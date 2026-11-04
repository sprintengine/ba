package ie.bookanything.security

import ie.bookanything.oauth.HttpClientMetadataFetcher
import ie.bookanything.site.stock.StockImageProvider
import ie.bookanything.site.stock.UnsplashStockImages
import ie.bookanything.support.LocalHttpServer
import ie.bookanything.templates.BlockedUrlException
import ie.bookanything.templates.SafeWebsiteFetcher
import ie.bookanything.templates.UrlGuard
import okhttp3.Address
import okhttp3.Authenticator
import okhttp3.Call
import okhttp3.Connection
import okhttp3.ConnectionSpec
import okhttp3.Dns
import okhttp3.Handshake
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Interceptor
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import okhttp3.Route
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ProxySelector
import java.net.Socket
import java.util.concurrent.TimeUnit
import javax.net.SocketFactory
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Server-side fetches of user-supplied URLs (`templates/UrlGuard`): the AI setup's website fetch, OAuth client metadata
 * documents and stock photo download tracking. `templates/UrlGuardTest` and `AiDraftTest` cover the address ranges and the
 * basic forms; this adds the encodings attackers use, every hop the guard sees (redirects, DNS rebinding) and the fetchers.
 * No test touches the network: blocked URLs are refused before connecting, and hops are checked on a simulated chain.
 */
class SsrfTest {
    @Test
    fun `IPv6, encoded IPv4, internal names and unusual URLs are refused before any connection`() {
        listOf(
            // IPv6 loopback, mapped, unique-local, link-local, unspecified, NAT64 and 6to4 of the metadata address.
            "http://[::1]/", "http://[0:0:0:0:0:0:0:1]/", "http://[::ffff:127.0.0.1]/", "http://[::ffff:7f00:1]/",
            "http://[::ffff:a9fe:a9fe]/", "http://[fd00::1]/", "http://[fd12:3456:789a::1]/", "http://[fc00::1]/", "http://[fe80::1]/",
            "http://[febf::1]/", "http://[::]/", "http://[64:ff9b::a9fe:a9fe]/", "http://[2002:a9fe:a9fe::]/", "http://[::127.0.0.1]/",
            // IPv4 in decimal, octal, shorthand and padded forms; trailing dots.
            "http://2130706433/", "http://017700000001/", "http://0177.0.0.1/", "http://0177.1/", "http://127.1/", "http://127.0.1/",
            "http://0/", "http://0.0.0.0/", "http://00000000177.0.0.1/", "http://127.0.0.1./", "http://169.254.169.254./",
            "http://169.254.43518/", "http://2852039166/",
            // Metadata, CGNAT and other private ranges as plain literals.
            "http://169.254.169.254/latest/meta-data/", "http://169.254.170.2/v2/credentials", "http://100.64.0.1/",
            "http://100.100.100.200/latest/meta-data/", "http://192.168.0.1/", "http://10.0.0.1/", "http://172.16.0.1/",
            // Internal names, also with a trailing dot or in capitals.
            "http://localhost/", "http://LOCALHOST/", "http://localhost./", "http://foo.localhost./", "http://printer.local./",
            "http://metadata.google.internal./", "http://metadata.google.internal/computeMetadata/v1/",
            // Schemes, credentials and ports.
            "file:///etc/passwd", "ftp://example.com/", "gopher://example.com:70/_", "dict://example.com:11211/", "jar:http://x/!/",
            "ldap://example.com/", "javascript:alert(1)", "data:text/html,hi", "//example.com/", "example.com",
            "http://user@example.com/", "http://user:pass@example.com/", "http://example.com:22/", "http://example.com:6379/",
            "https://example.com:8443/", "http://example.com:0/",
        ).forEach { assertNotNull(UrlGuard.problem(it), "should refuse $it") }
        listOf(
            "https://example.com/", "http://example.com:80/about", "https://example.com:443/", "https://8.8.8.8/",
            "https://[2606:4700:4700::1111]/", "https://xn--bcher-kva.example/", "https://100.128.0.1/",
        ).forEach { assertNull(UrlGuard.problem(it), "should allow $it") }
    }

    /** One hop as OkHttp's network interceptors see it: the request URL and the address actually connected to. */
    private class Hop(private val request: Request, connectedTo: InetAddress) : Interceptor.Chain {
        var proceeded = false
        private val connection = object : Connection {
            private val address = Address(
                request.url.host, request.url.port, Dns.SYSTEM, SocketFactory.getDefault(), null, null, null, Authenticator.NONE,
                null, listOf(Protocol.HTTP_1_1), listOf(ConnectionSpec.CLEARTEXT), ProxySelector.getDefault(),
            )
            private val route = Route(address, java.net.Proxy.NO_PROXY, InetSocketAddress(connectedTo, request.url.port))
            override fun route() = route
            override fun socket(): Socket = throw UnsupportedOperationException()
            override fun handshake(): Handshake? = null
            override fun protocol() = Protocol.HTTP_1_1
        }
        override fun request() = request
        override fun proceed(request: Request): Response {
            proceeded = true
            return Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(200).message("OK").body("ok".toResponseBody())
                .build()
        }
        override fun connection(): Connection = connection
        override fun call(): Call = throw UnsupportedOperationException()
        override fun connectTimeoutMillis() = 1000
        override fun withConnectTimeout(timeout: Int, unit: TimeUnit) = this
        override fun readTimeoutMillis() = 1000
        override fun withReadTimeout(timeout: Int, unit: TimeUnit) = this
        override fun writeTimeoutMillis() = 1000
        override fun withWriteTimeout(timeout: Int, unit: TimeUnit) = this
    }

    private val guard: Interceptor = UrlGuard.safeClient(1_000, followRedirects = true).networkInterceptors.single()

    private fun hop(url: String, connectedTo: String): Hop =
        Hop(Request.Builder().url(url).build(), InetAddress.getByName(connectedTo)).also { chain ->
            runCatching { guard.intercept(chain) }.exceptionOrNull()?.let { assertTrue(it is BlockedUrlException, it.toString()) }
        }

    @Test
    fun `every hop is checked against the address actually connected to (DNS rebinding, redirects)`() {
        // A public name whose DNS answer changed to an internal address between the check and the connection.
        listOf("127.0.0.1", "10.1.2.3", "169.254.169.254", "100.64.1.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1").forEach {
            assertEquals(false, hop("http://rebind.example/", it).proceeded, "connected to $it")
        }
        // A redirect from a public page to an internal one is a new hop and is refused the same way, by URL or by address.
        listOf(
            "http://169.254.169.254/latest/meta-data/" to "169.254.169.254", "http://localhost/admin" to "127.0.0.1",
            "http://[::1]/" to "::1", "http://2130706433/" to "127.0.0.1", "http://public.example:8080/" to "93.184.215.14",
            "http://internal.example/" to "192.168.1.10",
        ).forEach { (url, address) -> assertEquals(false, hop(url, address).proceeded, "redirect to $url") }
        // A public name on a public address goes ahead.
        assertTrue(hop("https://example.com/about", "93.184.215.14").proceeded)
        assertTrue(hop("https://example.com/", "2606:4700:4700::1111").proceeded)
    }

    @Test
    fun `the fetchers never connect to a refused URL`() {
        LocalHttpServer { LocalHttpServer.Response(200, "<title>internal</title>", "text/html") }.use { server ->
            val port = server.baseUrl.substringAfterLast(':')
            val website = SafeWebsiteFetcher(timeoutMillis = 1_000)
            val metadata = HttpClientMetadataFetcher()
            listOf(
                server.baseUrl, "http://localhost:$port/", "http://[::1]:$port/", "http://[::ffff:127.0.0.1]:$port/",
                "http://2130706433:$port/", "http://127.1:$port/", "http://localhost./", "http://127.0.0.1/", "https://127.0.0.1/",
            ).forEach { url -> assertNull(website.fetchText(url), url) }
            listOf(
                "https://127.0.0.1/client.json", "https://localhost/client.json", "https://[::1]/client.json",
                "https://169.254.169.254/client.json", "https://localhost./client.json", "${server.baseUrl}/client.json",
            ).forEach { url -> assertNull(metadata.fetch(url), url) }
            assertEquals(0, server.requests.size, "nothing reached the internal server")
        }
    }

    @Test
    fun `stock download tracking only ever calls the Unsplash API host`() {
        LocalHttpServer { LocalHttpServer.Response(200, "{}") }.use { server ->
            val unsplash = UnsplashStockImages("key", baseUrl = server.baseUrl)
            listOf(
                "${server.baseUrl}/photos/abc/download", "http://api.unsplash.com/photos/abc",
                "https://api.unsplash.com.evil.example/photos/x", "https://evil.example/https://api.unsplash.com/photos/",
                "https://api.unsplash.com@evil.example/photos/",
            ).forEach(unsplash::trackDownload)
            assertEquals(0, server.requests.size, "the access key is never sent anywhere else")
        }
        // Anything after the fixed prefix is path, so the host stays Unsplash's.
        listOf(
            "x@evil.example/", "..%2F..%2F@evil.example", "%2F%2Fevil.example/", "abc/download?u=https://evil.example",
            "..\\..\\evil.example",
        ).forEach { tail ->
            assertEquals("api.unsplash.com", (StockImageProvider.DOWNLOAD_PREFIX + tail).toHttpUrl().host, tail)
        }
    }
}
