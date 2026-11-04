package ie.bookanything.http

import ie.bookanything.db.Db
import ie.bookanything.db.queryOne
import ie.bookanything.db.update
import io.ktor.server.application.ApplicationCall
import java.sql.Connection
import java.time.Instant

/**
 * Fixed-window rate limiting stored in Postgres (`rate_limit_buckets`) so limits hold across
 * multiple stateless app instances. Old rows are purged by a periodic job.
 */
class RateLimiter(
    private val db: Db,
    private val enabled: Boolean,
    private val ipResolver: ClientIpResolver,
    /** Development only ([ie.bookanything.config.AppConfig.rateLimitMultiplier]): each limit allows this many times its max. */
    private val multiplier: Int = 1,
) {

    data class Limit(val name: String, val max: Int, val windowSeconds: Long)

    companion object {
        val PUBLIC_BOOKING = Limit("booking", 20, 600)
        val AVAILABILITY = Limit("availability", 120, 60)
        val MANAGE = Limit("manage", 30, 600)

        /** Confirming a payment on return from Checkout, per booking (each asks the payment provider). */
        val PAYMENT_CONFIRM = Limit("payment-confirm", 5, 600)
        val AI_DRAFT = Limit("ai-draft", 20, 3600)

        /** Businesses created, per user. */
        val ONBOARDING = Limit("onboarding", 10, 3600)
        val AI_SITE = Limit("ai-site", 60, 3600)
        val ASSISTANT = Limit("assistant", 60, 3600)
        val UPLOADS = Limit("uploads", 60, 3600)
        val STOCK_SEARCH = Limit("stock-search", 120, 3600)
        val MCP = Limit("mcp", 120, 60)
        val MCP_BOOKING = Limit("mcp-booking", 10, 600)

        /**
         * The rate-limit key for a client address. IPv6 clients are grouped by /64, the smallest block a subscriber
         * normally gets, so rotating addresses inside it does not reset the limit.
         */
        fun bucket(ip: String): String {
            val address = parseIpLiteral(ip) ?: return ip
            if (address !is java.net.Inet6Address) return address.hostAddress
            val b = address.address
            val groups = (0 until 4).map { ((b[it * 2].toInt() and 0xff) shl 8) or (b[it * 2 + 1].toInt() and 0xff) }
            return groups.joinToString(":") { Integer.toHexString(it) } + "::/64"
        }
    }

    /** The TCP peer comes from `request.local` (never rewritten by forwarded-header plugins). */
    fun clientIp(call: ApplicationCall): String {
        val peer = call.request.local.remoteAddress
        val forwarded = call.request.headers.getAll("X-Forwarded-For").orEmpty()
        val fromEdge = ipResolver.clientIpHeader?.let { call.request.headers[it] }
        val ip = ipResolver.resolve(peer, forwarded, fromEdge)
        // LOG_LEVEL=DEBUG shows what the proxy chain delivers (to verify CLIENT_IP_HEADER / TRUST_FORWARDED_FOR in staging).
        if (log.isDebugEnabled) log.debug("client ip={} peer={} x-forwarded-for={} client-ip-header={}", ip, peer, forwarded, fromEdge)
        return ip
    }

    private val log = org.slf4j.LoggerFactory.getLogger(RateLimiter::class.java)

    /** Per client address. */
    suspend fun check(call: ApplicationCall, limit: Limit, now: Instant) {
        if (!enabled) return
        checkKey(bucket(clientIp(call)), limit, now)
    }

    /**
     * Per an explicit subject, e.g. an OAuth grant or a user: needed where many people share one address (AI platforms call
     * the customer MCP from a few egress IPs, so per-IP limits would throttle all their users together).
     */
    suspend fun checkKey(subject: String, limit: Limit, now: Instant) {
        if (!enabled) return
        val windowStart = Instant.ofEpochSecond(now.epochSecond - now.epochSecond % limit.windowSeconds)
        val count = db.tx { conn ->
            conn.queryOne(
                """
                INSERT INTO rate_limit_buckets (key, window_start, count) VALUES (?, ?, 1)
                ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limit_buckets.count + 1
                RETURNING count
                """.trimIndent(),
                "${limit.name}:$subject", windowStart,
            ) { it.getInt(1) } ?: 0
        }
        if (count > limit.max * multiplier) throw Errors.rateLimited()
    }

    /** Deletes buckets of windows that ended long ago (run periodically). Returns the number deleted. */
    fun purge(conn: Connection, before: Instant): Int = conn.update("DELETE FROM rate_limit_buckets WHERE window_start < ?", before)
}
