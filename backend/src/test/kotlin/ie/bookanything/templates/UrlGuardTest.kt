package ie.bookanything.templates

import ie.bookanything.oauth.FetchedDocument
import ie.bookanything.oauth.HttpClientMetadataFetcher
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import java.net.Inet6Address
import java.net.InetAddress
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class UrlGuardTest {
    private fun blocked(ip: String) = UrlGuard.isBlocked(InetAddress.getByName(ip))

    @Test
    fun `non-public networks are blocked, their neighbours are not`() {
        listOf(
            "0.1.2.3", "10.9.9.9", "127.0.0.2", "100.64.0.0", "100.127.255.255", "169.254.1.1", "172.16.0.0", "172.31.255.255",
            "192.168.0.1", "192.0.0.8", "192.0.2.1", "198.18.0.0", "198.19.255.255", "198.51.100.7", "203.0.113.9", "224.0.0.1",
            "240.0.0.1", "255.255.255.255", "fc00::1", "fdff::1", "fec0::1", "fe80::1", "2001:db8::1", "::1", "::",
            "::10.0.0.1", "64:ff9b::7f00:1", "2002:c0a8:101::1",
        ).forEach { assertTrue(blocked(it), "should block $it") }
        listOf(
            "1.1.1.1", "100.63.255.255", "100.128.0.0", "172.15.255.255", "172.32.0.0", "192.0.1.1", "192.0.3.1", "192.169.0.1",
            "198.17.255.255", "198.20.0.0", "198.51.101.1", "203.0.114.1", "223.255.255.255", "2001:db9::1", "2606:4700::1111",
            "::8.8.8.8", "64:ff9b::808:808", "2002:808:808::1",
        ).forEach { assertFalse(blocked(it), "should allow $it") }
    }

    @Test
    fun `IPv4 addresses are found inside IPv6 ones`() {
        fun embedded(ip: String) = UrlGuard.embeddedIpv4(InetAddress.getByName(ip) as Inet6Address)?.hostAddress
        assertEquals("10.0.0.1", embedded("::10.0.0.1"))
        assertEquals("169.254.169.254", embedded("64:ff9b::a9fe:a9fe"))
        assertEquals("192.168.1.1", embedded("2002:c0a8:101::1"))
        val mapped = Inet6Address.getByAddress(null, ByteArray(10) + byteArrayOf(-1, -1, 127, 0, 0, 1), -1)
        assertEquals("127.0.0.1", UrlGuard.embeddedIpv4(mapped)?.hostAddress)
        assertTrue(UrlGuard.isBlocked(mapped))
        assertNull(embedded("2606:4700::1111"))
    }

    private fun response(type: String?, body: String): Response = Response.Builder()
        .request(Request.Builder().url("https://example.com/").build()).protocol(Protocol.HTTP_1_1).code(200).message("OK")
        .apply { if (type != null) header("Content-Type", type) }
        .body(body.toResponseBody(type?.toMediaType()))
        .build()

    @Test
    fun `fetched pages become text and only text types are read`() {
        val fetcher = SafeWebsiteFetcher(maxBytes = 1_000)
        assertEquals("Title: Hi\nHi\nHello", fetcher.text(response("text/html; charset=utf-8", "<title>Hi</title><p>Hello</p>")))
        assertEquals("Title: Hi\nHi", fetcher.text(response(null, "<title>Hi</title>")), "untyped responses are read as HTML")
        assertEquals("plain", fetcher.text(response("text/plain", "plain")))
        assertEquals(1_000, fetcher.text(response("text/plain", "x".repeat(5_000)))!!.length, "the body is capped")
        assertNull(fetcher.text(response("image/png", "x")))
    }

    @Test
    fun `client metadata documents must be small JSON`() {
        val fetcher = HttpClientMetadataFetcher()
        assertEquals(FetchedDocument("{}", null), fetcher.document(response("application/json", "{}")))
        assertEquals(FetchedDocument("{}", null), fetcher.document(response("application/cimd+json", "{}")))
        assertNull(fetcher.document(response("text/html", "{}")))
        assertNull(fetcher.document(response("application/json", " ".repeat(6_000))))
        assertNull(fetcher.fetch("http://example.com/client.json"), "https only")
    }
}
