package ie.bookanything.payments

import ie.bookanything.AppContext
import ie.bookanything.audit.Audit
import ie.bookanything.auth.Role
import ie.bookanything.booking.BookingSupport
import ie.bookanything.business.Plan
import ie.bookanything.businessAccess
import ie.bookanything.http.Errors
import ie.bookanything.http.receiveBody
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import java.util.Locale

@Serializable
data class BillingCheckoutInput(val plan: String, val returnUrl: String)

@Serializable
data class BillingUsage(val bookingsThisMonth: Int, val limit: Int?)

@Serializable
data class PlanPrice(
    val plan: String, val name: String, val amountCents: Int, val currency: String, val interval: String, val features: List<String>,
)

@Serializable
data class BillingDto(val plan: String, val status: String, val usage: BillingUsage, val prices: List<PlanPrice>)

val PLAN_PRICES = listOf(
    PlanPrice(
        Plan.FREE.wire, Plan.FREE.displayName, 0, "EUR", "month",
        listOf(
            "Up to 100 bookings a month", "Up to 3 team members", "Online payments with 0% platform fee",
            "bookanything badge on your booking page",
        ),
    ),
    PlanPrice(
        Plan.PRO.wire, Plan.PRO.displayName, 1200, "EUR", "month",
        listOf("Unlimited bookings", "Unlimited team members", "SMS reminders at cost", "Remove the bookanything badge"),
    ),
    PlanPrice(
        Plan.BUSINESS.wire, Plan.BUSINESS.displayName, 3900, "EUR", "month",
        listOf("Everything in Pro", "Priority support", "Advanced reports"),
    ),
)

/**
 * What a business's AI credits pay for here: Bo (when offered) and the site builder (`SITES_ENABLED`). Null when neither
 * is: AI setup runs before the business exists, so it doesn't draw on them.
 */
fun aiCreditUses(assistant: Boolean, sites: Boolean): String? = when {
    assistant && sites -> "Bo and the site builder"
    assistant -> "Bo"
    sites -> "the site builder"
    else -> null
}

/** The business's own bookanything plan: usage and prices, Stripe Billing checkout and portal. */
internal fun Route.billingRoutes(ctx: AppContext) {
    get("/billing") {
        val access = call.businessAccess(ctx, Role.OWNER)
        val used = ctx.db.read(access.businessId) { BookingSupport.monthlyBookingCount(it, access.business, ctx.now()) }
        call.respond(
            BillingDto(
                plan = access.business.plan.wire,
                status = access.business.planStatus ?: "active",
                usage = BillingUsage(used.toInt(), access.business.plan.monthlyBookingLimit),
                // Each plan's AI credits come from configuration (AI_CREDITS_*), listed for what this deployment offers.
                prices = PLAN_PRICES.map { p ->
                    val credits = ctx.config.ai.allowances.creditsFor(Plan.parse(p.plan))
                    val uses = aiCreditUses(ctx.assistantAvailable, ctx.config.sitesEnabled) ?: return@map p
                    p.copy(features = p.features + "${"%,d".format(Locale.ROOT, credits)} AI credits a month for $uses")
                },
            ),
        )
    }

    post("/billing/checkout") {
        val access = call.businessAccess(ctx, Role.OWNER)
        val input = call.receiveBody<BillingCheckoutInput>()
        val plan = Plan.parseOrNull(input.plan)?.takeIf { it.isPaid } ?: throw Errors.field("plan", "Must be pro or business")
        val returnUrl = checkReturnUrl(ctx, input.returnUrl)
        val b = access.business
        if (b.hasPaidSubscription) {
            throw Errors.conflict("You already have a subscription. Use the billing portal to change or cancel your plan.")
        }
        val session = withContext(Dispatchers.IO) { ctx.payments.createBillingCheckout(b, plan, returnUrl, access.user.email) }
        ctx.db.tx(b.id) {
            session.customerId?.let { id -> StripeAccountRepository.setCustomerIdIfMissing(it, b.id, id) }
            Audit.record(it, b.id, access.actor, "billing.checkout_started", "business", b.id, mapOf("plan" to plan.wire))
        }
        call.respond(UrlResponse(session.url))
    }

    post("/billing/portal") {
        val access = call.businessAccess(ctx, Role.OWNER)
        val input = call.receiveBody<ReturnUrlInput>()
        val returnUrl = checkReturnUrl(ctx, input.returnUrl)
        call.respond(UrlResponse(withContext(Dispatchers.IO) { ctx.payments.createBillingPortal(access.business, returnUrl) }))
    }
}
