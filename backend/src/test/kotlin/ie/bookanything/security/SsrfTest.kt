package ie.bookanything.security

import ie.bookanything.oauth.HttpClientMetadataFetcher
import ie.bookanything.site.stock.StockImageProvider
import ie.bookanything.site.stock.UnsplashStockImages
import ie.bookanything.support.LocalHttpServer
import ie.bookanything.templates.BlockedUrlException
import ie.bookanything.templates.SafeWebsiteFetcher
import ie.bookanything.templates.UrlGuard
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Request
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket
import java.net.SocketAddress
import javax.net.SocketFactory
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Server-side fetches of user-supplied URLs (`templates/UrlGuard`): the AI setup's website fetch, OAuth client metadata
 * documents and stock photo download tracking. `templates/UrlGuardTest` and `AiDraftTest` cover the address ranges and the
 * basic forms; this adds the encodings attackers use, every hop the guard sees (redirects, DNS rebinding) and the fetchers.
 * No test touches the network: blocked URLs are refused before connecting, hops are checked with `UrlGuard.checkHop`,
 * and the safe client is driven through OkHttp against a loopback server whose DNS answers it is told to believe.
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

    /** Whether one hop (as OkHttp's network interceptor sees it: URL and the address connected to) may go ahead. */
    private fun hop(url: String, connectedTo: String): Boolean =
        runCatching { UrlGuard.checkHop(url.toHttpUrl(), InetAddress.getByName(connectedTo)) }.fold(
            onSuccess = { true },
            onFailure = {
                assertTrue(it is BlockedUrlException, it.toString())
                false
            },
        )

    @Test
    fun `every hop is checked against the address actually connected to (DNS rebinding, redirects)`() {
        // A public name whose DNS answer changed to an internal address between the check and the connection.
        listOf("127.0.0.1", "10.1.2.3", "169.254.169.254", "100.64.1.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1").forEach {
            assertEquals(false, hop("http://rebind.example/", it), "connected to $it")
        }
        // A redirect from a public page to an internal one is a new hop and is refused the same way, by URL or by address.
        listOf(
            "http://169.254.169.254/latest/meta-data/" to "169.254.169.254", "http://localhost/admin" to "127.0.0.1",
            "http://[::1]/" to "::1", "http://2130706433/" to "127.0.0.1", "http://public.example:8080/" to "93.184.215.14",
            "http://internal.example/" to "192.168.1.10",
        ).forEach { (url, address) -> assertEquals(false, hop(url, address), "redirect to $url") }
        // A public name on a public address goes ahead.
        assertTrue(hop("https://example.com/about", "93.184.215.14"))
        assertTrue(hop("https://example.com/", "2606:4700:4700::1111"))
    }

    /** Connects every socket to loopback:[target], whatever address the route names, so a route can claim any address. */
    private class LoopbackSockets(private val target: Int) : SocketFactory() {
        override fun createSocket(): Socket = object : Socket() {
            override fun connect(endpoint: SocketAddress, timeout: Int) =
                super.connect(InetSocketAddress(InetAddress.getLoopbackAddress(), target), timeout)
        }
        override fun createSocket(host: String, port: Int): Socket = throw UnsupportedOperationException()
        override fun createSocket(host: String, port: Int, localHost: InetAddress, localPort: Int): Socket =
            throw UnsupportedOperationException()
        override fun createSocket(host: InetAddress, port: Int): Socket = throw UnsupportedOperationException()
        override fun createSocket(address: InetAddress, port: Int, localAddress: InetAddress, localPort: Int): Socket =
            throw UnsupportedOperationException()
    }

    @Test
    fun `the safe client checks every hop through OkHttp, redirects included`() {
        LocalHttpServer { req ->
            if (req.path == "/start") {
                LocalHttpServer.Response(302, headers = mapOf("Location" to "http://internal.example/next"))
            } else {
                LocalHttpServer.Response(200, "secret", "text/plain")
            }
        }.use { server ->
            val answers = mapOf("public.example" to "93.184.215.14", "internal.example" to "10.1.2.3")
            // A resolver that lies (as rebinding would), so only the network interceptor stands between the redirect and
            // the server.
            val client = UrlGuard.safeClient(1_000, followRedirects = true).newBuilder()
                .dns { host -> listOf(InetAddress.getByName(answers.getValue(host))) }
                .socketFactory(LoopbackSockets(server.baseUrl.substringAfterLast(':').toInt()))
                .build()
            assertFailsWith<BlockedUrlException> {
                client.newCall(Request.Builder().url("http://public.example/start").build()).execute().close()
            }
            assertEquals(listOf("/start"), server.requests.map { it.path }, "the redirect to an internal address was never sent")
        }
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
