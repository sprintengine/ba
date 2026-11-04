package ie.bookanything.payments

import ie.bookanything.AppContext
import ie.bookanything.audit.Actor
import ie.bookanything.audit.Audit
import ie.bookanything.auth.Role
import ie.bookanything.businessAccess
import ie.bookanything.http.Errors
import ie.bookanything.http.Validator
import ie.bookanything.http.receiveBody
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable

@Serializable
data class PaymentsStatusDto(val provider: String, val connected: Boolean, val chargesEnabled: Boolean, val detailsSubmitted: Boolean)

@Serializable
data class ReturnUrlInput(val returnUrl: String)

@Serializable
data class UrlResponse(val url: String)

/** A return URL into the bookanything app (Stripe sends the owner back there); field error otherwise. */
internal fun checkReturnUrl(ctx: AppContext, raw: String): String {
    val v = Validator()
    val url = v.url(raw, "returnUrl")
    v.throwIfInvalid()
    if (!ctx.config.urls.isAllowed(url!!)) throw Errors.field("returnUrl", "Must point to the bookanything app")
    return url
}

/** Online payments (Stripe Connect status and onboarding) and, through [billingRoutes], the business's own plan. */
fun Route.paymentSettingsRoutes(ctx: AppContext) {
    get("/payments/status") {
        val access = call.businessAccess(ctx, Role.ADMIN)
        val b = access.business
        val s = withContext(Dispatchers.IO) { ctx.payments.connectStatus(b) }
        // Keep the stored flags fresh even if an account.updated webhook was missed or delayed.
        if (ctx.payments.name == "stripe" && b.stripeAccountId != null &&
            (s.chargesEnabled != b.stripeChargesEnabled || s.detailsSubmitted != b.stripeDetailsSubmitted)
        ) {
            ctx.db.tx(b.id) {
                StripeAccountRepository.setConnectStatus(it, b.id, s.chargesEnabled, s.detailsSubmitted)
                Audit.record(
                    it, b.id, Actor.SYSTEM, "payments.account_updated", "business", b.id,
                    mapOf("chargesEnabled" to s.chargesEnabled, "detailsSubmitted" to s.detailsSubmitted),
                )
            }
        }
        call.respond(PaymentsStatusDto(ctx.payments.name, s.connected, s.chargesEnabled, s.detailsSubmitted))
    }

    post("/payments/connect") {
        val access = call.businessAccess(ctx, Role.OWNER)
        val input = call.receiveBody<ReturnUrlInput>()
        val returnUrl = checkReturnUrl(ctx, input.returnUrl)
        val link = withContext(Dispatchers.IO) { ctx.payments.createConnectLink(access.business, returnUrl) }
        ctx.db.tx(access.businessId) {
            link.accountId?.let { id -> StripeAccountRepository.setAccountIdIfMissing(it, access.businessId, id) }
            Audit.record(
                it, access.businessId, access.actor, "payments.connect_started", "business", access.businessId,
                mapOf("accountCreated" to (link.accountId != null)),
            )
        }
        call.respond(UrlResponse(link.url))
    }

    billingRoutes(ctx)
}
