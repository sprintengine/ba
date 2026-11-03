package ie.bookanything.http

import java.math.BigInteger
import java.net.InetAddress

/** An IPv4 or IPv6 network in CIDR notation (a bare address is a /32 or /128). */
class Cidr private constructor(private val network: BigInteger, private val prefix: Int, private val bytes: Int) {

    fun contains(address: InetAddress): Boolean {
        val raw = normalise(address)
        if (raw.size != bytes) return false
        val bits = bytes * 8
        val value = BigInteger(1, raw)
        return value.shiftRight(bits - prefix) == network.shiftRight(bits - prefix)
    }

    companion object {
        fun parse(raw: String): Cidr? {
            val parts = raw.trim().split('/')
            if (parts.size > 2) return null
            val addr = parseIpLiteral(parts[0]) ?: return null
            val bytes = normalise(addr)
            val max = bytes.size * 8
            val prefix = if (parts.size == 2) parts[1].toIntOrNull() ?: return null else max
            if (prefix !in 0..max) return null
            return Cidr(BigInteger(1, bytes), prefix, bytes.size)
        }

        /** IPv4-mapped IPv6 addresses (::ffff:a.b.c.d) are treated as IPv4. */
        private fun normalise(address: InetAddress): ByteArray {
            val b = address.address
            if (b.size == 16 && (0 until 10).all { b[it] == 0.toByte() } && b[10] == 0xff.toByte() && b[11] == 0xff.toByte()) {
                return b.copyOfRange(12, 16)
            }
            return b
        }
    }
}

private val IPV4 = Regex("^\\d{1,3}(\\.\\d{1,3}){3}$")
private val IPV6 = Regex("^[0-9a-fA-F:.]+$")

/** Parses an IP literal without ever doing a DNS lookup. Returns null for anything else. */
fun parseIpLiteral(raw: String): InetAddress? {
    var s = raw.trim()
    if (s.startsWith("[") && s.contains("]")) s = s.substring(1, s.indexOf(']'))
    if (s.isEmpty() || s.length > 45) return null
    if (IPV4.matches(s)) {
        if (s.split('.').any { it.toInt() > 255 }) return null
    } else if (!(s.contains(':') && IPV6.matches(s))) {
        return null
    }
    return try { InetAddress.getByName(s) } catch (_: java.net.UnknownHostException) { null }
}

/**
 * Picks the client address for rate limiting (docs/architecture.md section 10).
 *
 * With [clientIpHeader] set (`CF-Connecting-IP` behind Cloudflare), a trusted TCP peer's single-address header names
 * the client: the edge overwrites it on every request, so a client cannot choose it. Otherwise, or when the header is
 * missing or malformed, `X-Forwarded-For` decides as below.
 *
 * Without [trustForwardedFor] the TCP peer is the client. With it, `X-Forwarded-For` is read
 * right to left (each proxy appends the address it received the request from):
 * - with [hops] set, the client is the entry appended by the outermost of `hops` proxies;
 * - otherwise the header is only honoured when the TCP peer is a trusted proxy, and the client is
 *   the first entry (from the right) that is not a trusted proxy.
 * Client-supplied (leftmost) entries are never trusted, so spoofing the header does not help.
 */
class ClientIpResolver(
    private val trustForwardedFor: Boolean,
    trustedProxies: List<String>,
    private val hops: Int? = null,
    /** The request header that carries the client address, set by the edge proxy; null to use `X-Forwarded-For`. */
    val clientIpHeader: String? = null,
) {
    private val trusted = trustedProxies.mapNotNull { Cidr.parse(it) }

    private fun isTrusted(address: InetAddress) = trusted.any { it.contains(address) }

    /** [headerValue] is the value of [clientIpHeader] on the request, if any. */
    fun resolve(peer: String, forwardedFor: List<String>, headerValue: String? = null): String =
        fromEdgeHeader(peer, headerValue) ?: fromForwardedFor(peer, forwardedFor)

    /** The edge's client address header, honoured only from a trusted peer and only when it is one IP literal. */
    private fun fromEdgeHeader(peer: String, headerValue: String?): String? {
        if (clientIpHeader == null || headerValue == null) return null
        if (parseIpLiteral(peer)?.let(::isTrusted) != true) return null
        return parseIpLiteral(headerValue)?.hostAddress
    }

    private fun fromForwardedFor(peer: String, forwardedFor: List<String>): String {
        val peerLabel = peer.take(64)
        if (!trustForwardedFor) return peerLabel
        val entries = forwardedFor.flatMap { it.split(',') }.map { it.trim() }.filter { it.isNotEmpty() }
        if (entries.isEmpty()) return peerLabel
        if (hops != null) {
            // The rightmost entry was written by the proxy closest to us.
            val index = entries.size - hops
            val candidate = entries.getOrNull(index.coerceAtLeast(0)) ?: return peerLabel
            return parseIpLiteral(candidate)?.hostAddress ?: peerLabel
        }
        val peerAddress = parseIpLiteral(peer) ?: return peerLabel
        if (!isTrusted(peerAddress)) return peerLabel
        var last = peerAddress
        for (entry in entries.asReversed()) {
            // A malformed entry cannot have been written by a trusted proxy: stop at the last good hop.
            val address = parseIpLiteral(entry) ?: return last.hostAddress
            if (!isTrusted(address)) return address.hostAddress
            last = address
        }
        return last.hostAddress
    }
}
