package ie.bookanything.mcp.customer

import ie.bookanything.AppContext
import ie.bookanything.audit.Actor
import ie.bookanything.business.BusinessRow
import ie.bookanything.customers.CustomerRepository
import ie.bookanything.http.RateLimiter
import ie.bookanything.mcp.McpToolContext
import ie.bookanything.oauth.McpPrincipal
import ie.bookanything.oauth.Scope
import io.ktor.server.application.ApplicationCall
import java.util.UUID

/** What every customer tool runs with: the app, the HTTP call (rate limits) and the signed-in customer. */
class CustomerToolContext(override val ctx: AppContext, val call: ApplicationCall, val principal: McpPrincipal) : McpToolContext {
    /** Per grant (this user through this app), never per IP: AI platforms share a few addresses across all their users. */
    override suspend fun limit(limit: RateLimiter.Limit) = ctx.rateLimiter.checkKey("grant:${principal.grantId}", limit, ctx.now())

    override fun has(scope: Scope): Boolean = principal.has(scope)

    /** Booking limits per user, across every app they connected. */
    suspend fun limitUser(limit: RateLimiter.Limit) = ctx.rateLimiter.checkKey("user:${principal.user.id}", limit, ctx.now())

    val user get() = principal.user

    /** The requests this app makes for the user (section 20.8). */
    val requests = CustomerRequests(ctx)

    /** Audited as an API agent acting for the user, through this OAuth client. */
    val actor: Actor get() = Actor.oauthClient(user.id, principal.clientId)

    /** The customer's own group at [business] (e.g. "Existing students"), so availability and booking use their rules. */
    suspend fun customerGroup(business: BusinessRow): UUID? = ctx.db.read(business.id) { conn ->
        val record = CustomerRepository.findByUser(conn, business.id, user.id)
            ?: user.verifiedEmail?.let { CustomerRepository.findByEmail(conn, business.id, it) }
        record?.takeIf { it.erasedAt == null }?.groupId
    }
}
