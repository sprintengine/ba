package ie.bookanything.http

import ie.bookanything.config.AppConfig
import ie.bookanything.config.ConfigException
import java.net.InetAddress
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ClientIpTest {
    private val defaults = AppConfig.DEFAULT_TRUSTED_PROXIES

    @Test
    fun `forwarded headers are ignored unless enabled`() {
        val r = ClientIpResolver(false, defaults)
        assertEquals("203.0.113.9", r.resolve("203.0.113.9", listOf("1.2.3.4")))
    }

    @Test
    fun `the first untrusted hop from the right is the client`() {
        val r = ClientIpResolver(true, defaults)
        // Browser → Next.js (10.0.0.7) → API. The client cannot inject a fake leftmost entry.
        assertEquals("198.51.100.20", r.resolve("10.0.0.7", listOf("6.6.6.6, 198.51.100.20")))
        // Several internal proxies are skipped.
        assertEquals("198.51.100.20", r.resolve("127.0.0.1", listOf("198.51.100.20, 10.0.0.3", "172.16.4.2")))
        // A direct, untrusted peer can't spoof the header at all.
        assertEquals("203.0.113.50", r.resolve("203.0.113.50", listOf("1.1.1.1")))
        // Everything trusted: the leftmost address is the best we know.
        assertEquals("10.0.0.1", r.resolve("10.0.0.2", listOf("10.0.0.1")))
        // Garbage written by the client stops the walk at the last trusted hop.
        assertEquals("10.0.0.3", r.resolve("10.0.0.2", listOf("not-an-ip, 10.0.0.3")))
        assertEquals("2001:db8:0:0:0:0:0:1", r.resolve("::1", listOf("2001:db8::1")))
        assertEquals("10.0.0.2", r.resolve("10.0.0.2", emptyList()))
    }

    @Test
    fun `IPv6 clients share a rate-limit bucket per 64 prefix`() {
        // One subscriber usually holds a whole /64, so per-address buckets are trivially rotated.
        assertEquals(RateLimiter.bucket("2001:db8:1:2:aaaa::1"), RateLimiter.bucket("2001:db8:1:2:bbbb:cccc:dddd:2"))
        assertEquals("2001:db8:1:2::/64", RateLimiter.bucket("2001:db8:1:2:aaaa::1"))
        assertTrue(RateLimiter.bucket("2001:db8:1:3::1") != RateLimiter.bucket("2001:db8:1:2::1"))
        assertEquals("198.51.100.20", RateLimiter.bucket("198.51.100.20"))
        assertEquals("198.51.100.20", RateLimiter.bucket("::ffff:198.51.100.20"))
        assertEquals("not-an-ip", RateLimiter.bucket("not-an-ip"))
    }

    @Test
    fun `a fixed hop count works behind proxies with changing addresses`() {
        val r = ClientIpResolver(true, emptyList(), hops = 2)
        // client, next.js (public IP), platform load balancer (peer)
        assertEquals("198.51.100.20", r.resolve("10.1.1.1", listOf("6.6.6.6, 198.51.100.20, 34.1.2.3")))
        assertEquals("198.51.100.20", r.resolve("10.1.1.1", listOf("198.51.100.20, 34.1.2.3")))
        assertEquals("198.51.100.20", r.resolve("10.1.1.1", listOf("198.51.100.20")))
        assertEquals("10.1.1.1", r.resolve("10.1.1.1", listOf("junk, 34.1.2.3")))
    }

    @Test
    fun `behind Cloudflare the edge's client address header names the client`() {
        val r = ClientIpResolver(false, defaults, clientIpHeader = "CF-Connecting-IP")
        // cloudflared on the Docker network is the peer; the edge overwrites CF-Connecting-IP on every request.
        assertEquals("198.51.100.20", r.resolve("172.18.0.3", listOf("192.0.2.66, 198.51.100.20"), "198.51.100.20"))
        assertEquals("2001:db8:0:0:0:0:0:1", r.resolve("172.18.0.3", emptyList(), "2001:db8::1"))
        // From an untrusted peer (the API reached around the tunnel) the header is the client's own claim: ignored.
        assertEquals("203.0.113.50", r.resolve("203.0.113.50", emptyList(), "198.51.100.20"))
        // Missing or malformed: fall back to the peer (or X-Forwarded-For when that is trusted).
        assertEquals("172.18.0.3", r.resolve("172.18.0.3", emptyList(), null))
        assertEquals("172.18.0.3", r.resolve("172.18.0.3", emptyList(), "192.0.2.1, 192.0.2.2"))
        val both = ClientIpResolver(true, defaults, clientIpHeader = "CF-Connecting-IP")
        assertEquals("198.51.100.20", both.resolve("172.18.0.3", listOf("192.0.2.66, 198.51.100.20"), "not-an-ip"))
    }

    @Test
    fun `cidr matching and literal parsing never resolve names`() {
        assertTrue(Cidr.parse("10.0.0.0/8")!!.contains(InetAddress.getByName("10.200.1.1")))
        assertFalse(Cidr.parse("10.0.0.0/8")!!.contains(InetAddress.getByName("11.0.0.1")))
        assertTrue(Cidr.parse("fc00::/7")!!.contains(InetAddress.getByName("fd12::1")))
        assertTrue(Cidr.parse("127.0.0.0/8")!!.contains(InetAddress.getByName("::ffff:127.0.0.1")))
        assertTrue(Cidr.parse("192.0.2.4")!!.contains(InetAddress.getByName("192.0.2.4")))
        assertNull(Cidr.parse("10.0.0.0/33"))
        assertNull(Cidr.parse("example.com"))
        assertNull(parseIpLiteral("localhost"))
        assertNull(parseIpLiteral("999.1.1.1"))
        assertEquals("1.2.3.4", parseIpLiteral(" 1.2.3.4 ")!!.hostAddress)
    }

    @Test
    fun `proxy settings are validated from the environment`() {
        val base = mapOf("APP_ENV" to "development")
        val c = AppConfig.fromEnvironment(
            base + mapOf("TRUST_FORWARDED_FOR" to "true", "TRUSTED_PROXIES" to "10.0.0.0/8, 35.191.0.0/16", "TRUSTED_PROXY_HOPS" to "2"),
        )
        assertEquals(listOf("10.0.0.0/8", "35.191.0.0/16"), c.trustedProxies)
        assertEquals(2, c.trustedProxyHops)
        assertEquals(defaults, AppConfig.fromEnvironment(base).trustedProxies)
        assertFailsWith<ConfigException> { AppConfig.fromEnvironment(base + mapOf("TRUSTED_PROXIES" to "nope")) }
        assertFailsWith<ConfigException> { AppConfig.fromEnvironment(base + mapOf("TRUSTED_PROXY_HOPS" to "0")) }
        assertEquals("CF-Connecting-IP", AppConfig.fromEnvironment(base + ("CLIENT_IP_HEADER" to " CF-Connecting-IP ")).clientIpHeader)
        assertNull(AppConfig.fromEnvironment(base).clientIpHeader)
        assertFailsWith<ConfigException> { AppConfig.fromEnvironment(base + ("CLIENT_IP_HEADER" to "X Forwarded: For")) }
    }
}
