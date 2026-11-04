package ie.bookanything.templates

import ie.bookanything.http.Cidr
import ie.bookanything.http.parseIpLiteral
import okhttp3.Dns
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress
import java.util.concurrent.TimeUnit

/**
 * SSRF protection for server-side fetches of user-supplied URLs: http/https only, default ports
 * only, no credentials, and every resolved address (including after redirects and DNS
 * re-resolution) must be public.
 */
object UrlGuard {
    private val ALLOWED_PORTS = setOf(80, 443)
    private val NUMERIC_HOST = Regex("^[0-9.]+$")
    private val CANONICAL_IPV4 = Regex("^(0|[1-9][0-9]{0,2})(\\.(0|[1-9][0-9]{0,2})){3}$")
    private val INTERNAL_SUFFIXES = listOf(".localhost", ".local", ".internal")

    /** IPv4 networks that are not the public internet. */
    private val BLOCKED_IPV4 = networks(
        "0.0.0.0/8", "10.0.0.0/8", "127.0.0.0/8",
        "100.64.0.0/10", // CGNAT
        "169.254.0.0/16", // link local, cloud metadata
        "172.16.0.0/12", "192.168.0.0/16", "192.0.0.0/24", "192.0.2.0/24",
        "198.18.0.0/15", // benchmarking
        "198.51.100.0/24", "203.0.113.0/24",
        "224.0.0.0/3", // multicast and reserved
    )

    /** IPv6 networks that are not the public internet (beyond what [InetAddress] flags itself). */
    private val BLOCKED_IPV6 = networks(
        "fc00::/7", // unique local
        "fec0::/10", // site local (deprecated)
        "2001:db8::/32", // documentation
    )

    /** IPv6 networks that embed an IPv4 address, with the byte it starts at: IPv4-compatible, NAT64 and 6to4. */
    private val IPV4_CARRIERS = listOf(Cidr.parse("::/96")!! to 12, Cidr.parse("64:ff9b::/32")!! to 12, Cidr.parse("2002::/16")!! to 2)

    private fun networks(vararg cidrs: String) = cidrs.map { Cidr.parse(it)!! }

    /** Returns a reason when [url] must not be fetched, or null when its form is acceptable. */
    fun problem(url: String): String? {
        val parsed = url.trim().toHttpUrlOrNull() ?: return "not an http(s) URL"
        // A fully qualified name may end in a dot ("localhost.", "metadata.google.internal."): judge the name without it.
        val host = parsed.host.lowercase().trimEnd('.')
        return when {
            parsed.scheme != "http" && parsed.scheme != "https" -> "only http and https are allowed"
            parsed.username.isNotEmpty() || parsed.password.isNotEmpty() -> "credentials in URLs are not allowed"
            parsed.port !in ALLOWED_PORTS -> "only ports 80 and 443 are allowed"
            host == "localhost" || INTERNAL_SUFFIXES.any { host.endsWith(it) } -> "internal host names are not allowed"
            // OkHttp connects to digits-and-dots hosts with InetAddress.getByName (no Dns lookup), which reads shorthand and
            // decimal forms ("127.1", "2130706433", "169.254.43518"). Only plain dotted quads without leading zeros are allowed.
            NUMERIC_HOST.matches(host) && !CANONICAL_IPV4.matches(host) -> "ambiguous IP address"
            parseIpLiteral(host)?.let(::isBlocked) == true -> "private or reserved address"
            else -> null
        }
    }

    /** True for loopback, private, link-local (cloud metadata), CGNAT, multicast and other non-public addresses. */
    fun isBlocked(address: InetAddress): Boolean {
        val special = listOf(
            address.isAnyLocalAddress, address.isLoopbackAddress, address.isLinkLocalAddress,
            address.isSiteLocalAddress, address.isMulticastAddress,
        )
        return special.any { it } || when (address) {
            is Inet4Address -> BLOCKED_IPV4.any { it.contains(address) }
            // An IPv6 address that embeds an IPv4 address is judged by that address.
            is Inet6Address -> embeddedIpv4(address)?.let { v4 -> BLOCKED_IPV4.any { it.contains(v4) } }
                ?: BLOCKED_IPV6.any { it.contains(address) }
            else -> true
        }
    }

    /** The IPv4 address inside an IPv4-mapped, IPv4-compatible, NAT64 (64:ff9b::/32) or 6to4 (2002::/16) address, or null. */
    internal fun embeddedIpv4(address: Inet6Address): Inet4Address? {
        val b = address.address
        val mapped = (0 until 10).all { b[it] == 0.toByte() } && b[10] == 0xff.toByte() && b[11] == 0xff.toByte()
        val from = if (mapped) 12 else IPV4_CARRIERS.firstOrNull { (network, _) -> network.contains(address) }?.second
        return from?.let { InetAddress.getByAddress(b.copyOfRange(it, it + 4)) as Inet4Address }
    }

    /**
     * An OkHttp client for user-supplied URLs: [safeDns], no proxy, and every hop (including redirects) and the
     * address actually connected to (IP-literal hosts skip DNS) re-checked by a network interceptor.
     */
    fun safeClient(timeoutMillis: Long, followRedirects: Boolean): OkHttpClient = OkHttpClient.Builder()
        .dns(safeDns)
        .callTimeout(timeoutMillis, TimeUnit.MILLISECONDS)
        .connectTimeout(timeoutMillis, TimeUnit.MILLISECONDS)
        .readTimeout(timeoutMillis, TimeUnit.MILLISECONDS)
        .followRedirects(followRedirects)
        .followSslRedirects(followRedirects)
        .proxy(java.net.Proxy.NO_PROXY)
        .addNetworkInterceptor(
            Interceptor { chain ->
                checkHop(chain.request().url, chain.connection()?.route()?.socketAddress?.address)
                chain.proceed(chain.request())
            },
        )
        .build()

    /**
     * One hop (the first request or a redirect), as the network interceptor sees it: its URL must pass [problem] and the
     * address actually connected to must be public, whatever DNS said a moment before (DNS rebinding).
     */
    internal fun checkHop(url: HttpUrl, connectedTo: InetAddress?) {
        problem(url.toString())?.let { throw BlockedUrlException("blocked $url: $it") }
        if (connectedTo == null || isBlocked(connectedTo)) throw BlockedUrlException("blocked $url: connected to a non-public address")
    }

    /**
     * DNS that only returns public addresses, so OkHttp can never connect to an internal one (also defeats DNS rebinding).
     * Only `lookup`: OkHttp 5 then resolves through it alone (no HTTPS records, no asynchronous lookups that bypass it).
     */
    val safeDns: Dns = Dns { hostname ->
        val all = Dns.SYSTEM.lookup(hostname)
        val allowed = all.filterNot(::isBlocked)
        if (allowed.isEmpty() || allowed.size != all.size) throw BlockedUrlException("host $hostname resolves to a non-public address")
        allowed
    }
}
