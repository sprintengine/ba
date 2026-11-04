package ie.bookanything.mcp.business

import ie.bookanything.AppContext
import ie.bookanything.assistant.actions.ActionOrigin
import ie.bookanything.auth.BusinessAccess
import ie.bookanything.auth.MemberBusiness
import ie.bookanything.auth.Memberships
import ie.bookanything.auth.Role
import ie.bookanything.business.AiAgentsAccess
import ie.bookanything.http.Errors
import ie.bookanything.http.RateLimiter
import ie.bookanything.mcp.McpToolContext
import ie.bookanything.oauth.McpPrincipal
import ie.bookanything.oauth.Scope
import java.util.UUID

/**
 * What every business tool runs with: the signed-in member (through one of their connected apps) and the businesses
 * they belong to, read for this request. Each call resolves its business afresh ([access]): membership, role, and the
 * business's own switch for connected apps all apply at the moment of the call.
 */
class BusinessToolContext(
    override val ctx: AppContext,
    val principal: McpPrincipal,
    val businesses: List<MemberBusiness>,
) : McpToolContext {
    /** Per grant (this member through this app), never per IP: AI platforms share a few addresses across their users. */
    override suspend fun limit(limit: RateLimiter.Limit) = ctx.rateLimiter.checkKey("grant:${principal.grantId}", limit, ctx.now())

    override fun has(scope: Scope): Boolean = principal.has(scope)

    /** Changes per member, across every app they connected. */
    suspend fun limitUser(limit: RateLimiter.Limit) = ctx.rateLimiter.checkKey("user:${principal.user.id}", limit, ctx.now())

    /** This app, as the origin of the proposals it makes (only it can decide them). */
    val app: ActionOrigin.App get() = ActionOrigin.App(principal.grantId, principal.clientId)

    /** The highest role the member holds anywhere: tools above it are not offered at all. */
    val topRole: Role? get() = businesses.maxByOrNull { it.role.rank }?.role

    /**
     * The business [ref] names (its slug or id; may be left out when the member belongs to exactly one), as long as
     * its owner lets this member use AI apps there; then the member's live access to it.
     */
    suspend fun access(ref: String?): BusinessAccess = access(pick(ref))

    suspend fun access(businessId: UUID): BusinessAccess =
        access(businesses.firstOrNull { it.id == businessId } ?: throw Errors.notFound("Business"))

    private suspend fun access(target: MemberBusiness): BusinessAccess {
        if (!target.agentsAllowed) throw notAllowed(target.name, target.aiAgents)
        val access = Memberships.require(ctx.db, principal.user, target.id, Role.STAFF)
        val rules = access.business.aiAgents.access
        if (!rules.allows(access.role)) throw notAllowed(target.name, rules)
        return access
    }

    private fun pick(ref: String?): MemberBusiness {
        val wanted = ref?.trim()?.takeIf { it.isNotEmpty() }
        if (wanted == null) {
            return businesses.singleOrNull() ?: throw Errors.field(BusinessTools.BUSINESS_ARG, "Say which business: ${choices()}")
        }
        return businesses.firstOrNull { it.slug.equals(wanted, ignoreCase = true) || it.id.toString().equals(wanted, ignoreCase = true) }
            ?: throw Errors.field(BusinessTools.BUSINESS_ARG, "Not one of your businesses. It is ${choices()}")
    }

    private fun choices() = businesses.joinToString(", ") { "\"${it.slug}\" (${it.name})" }.ifEmpty { "none: you aren't a member of any" }

    private fun notAllowed(name: String, rules: AiAgentsAccess) = Errors.forbidden(
        if (rules == AiAgentsAccess.OFF) {
            "AI agents are turned off for $name. Its owner can turn them on in Settings › AI agents on bookanything."
        } else {
            "At $name, only owners and admins can use AI agents. Its owner can let the whole team use them in Settings › AI " +
                "agents on bookanything."
        },
    )
}
