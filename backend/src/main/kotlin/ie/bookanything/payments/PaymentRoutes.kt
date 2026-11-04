package ie.bookanything.payments

import ie.bookanything.AppContext
import ie.bookanything.audit.Actor
import ie.bookanything.audit.Audit
import ie.bookanything.auth.Role
import ie.bookanything.business.BusinessRow
import ie.bookanything.businessAccess
import ie.bookanything.http.Errors
import ie.bookanything.http.Validator
import ie.bookanything.http.receiveBody
import io.ktor.server.response.respond
import io.ktor.server.response.respondRedirect
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable

@Serializable
data class PaymentsStatusDto(
    val provider: String,
    val connected: Boolean,
    val chargesEnabled: Boolean,
    val detailsSubmitted: Boolean,
    /** How the account was linked: "created" (Stripe onboarding we started) or "oauth" (an account the owner had). */
    val connectMethod: String? = null,
    /** Whether "I already have a Stripe account" is offered (Stripe with STRIPE_CONNECT_CLIENT_ID). */
    val canConnectExisting: Boolean = false,
    val accountId: String? = null,
    /** The account's name in Stripe, when Stripe could be asked. */
    val accountName: String? = null,
)

@Serializable
data class ReturnUrlInput(val returnUrl: String)

@Serializable
data class UrlResponse(val url: String)

/** What Stripe's redirect carried to the owner's page (`?stripe=complete&code=&state=`). */
@Serializable
data class ConnectCompleteInput(val state: String = "", val code: String = "")

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
                StripeAccountRepository.setConnectStatus(it, b.id, b.stripeAccountId, s.chargesEnabled, s.detailsSubmitted)
                Audit.record(
                    it, b.id, Actor.SYSTEM, "payments.account_updated", "business", b.id,
                    mapOf("chargesEnabled" to s.chargesEnabled, "detailsSubmitted" to s.detailsSubmitted),
                )
            }
        }
        call.respond(statusDto(ctx, b, s))
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

    // "I already have a Stripe account": Stripe's OAuth page, then our callback (stripeConnectCallbackRoutes).
    post("/payments/connect/existing") {
        val access = call.businessAccess(ctx, Role.OWNER)
        val input = call.receiveBody<ReturnUrlInput>()
        // Stripe's code comes back to this page, so it is only ever our own payments page (never an embed origin).
        val returnUrl = checkReturnUrl(ctx, input.returnUrl)
        val page = ctx.config.urls.base + "/dashboard/${access.business.slug}/settings/payments"
        if (returnUrl.substringBefore('?').substringBefore('#').trimEnd('/') != page) {
            throw Errors.field("returnUrl", "Must be this business's payments settings page")
        }
        val url = withContext(Dispatchers.IO) { ctx.connectExisting.start(access.business, access.user.id, page, access.actor) }
        call.respond(UrlResponse(url))
    }

    // Stripe's page sent the owner back to their page (relayed by the callback); they finish it signed in.
    post("/payments/connect/existing/complete") {
        val access = call.businessAccess(ctx, Role.OWNER)
        val input = call.receiveBody<ConnectCompleteInput>()
        val v = Validator()
        v.requireText(input.state, "state", max = MAX_STATE)
        v.requireText(input.code, "code", max = MAX_STATE)
        v.throwIfInvalid()
        val result = withContext(Dispatchers.IO) {
            ctx.connectExisting.complete(access.businessId, access.user.id, input.state.trim(), input.code.trim())
        }
        call.respond(result)
    }

    post("/payments/disconnect") {
        val access = call.businessAccess(ctx, Role.OWNER)
        if (ctx.payments.name != "stripe") throw Errors.paymentsNotConfigured("There is no Stripe account to disconnect on this server.")
        if (!withContext(Dispatchers.IO) { ctx.connectExisting.disconnect(access.business, access.actor) }) {
            throw Errors.conflict("This business has no Stripe account connected.")
        }
        val b = access.business.copy(
            stripeAccountId = null, stripeConnectMethod = null, stripeChargesEnabled = false, stripeDetailsSubmitted = false,
        )
        call.respond(statusDto(ctx, b, ConnectStatus(false, false, false)))
    }

    billingRoutes(ctx)
}

private fun statusDto(ctx: AppContext, b: BusinessRow, s: ConnectStatus) = PaymentsStatusDto(
    ctx.payments.name, s.connected, s.chargesEnabled, s.detailsSubmitted,
    connectMethod = b.stripeConnectMethod.takeIf { s.connected },
    canConnectExisting = ctx.payments.canConnectExisting,
    accountId = b.stripeAccountId.takeIf { s.connected },
    accountName = s.accountName,
)

/**
 * `GET /v1/payments/stripe/callback`: where Stripe's OAuth page sends the owner's browser back (the redirect URI
 * registered with Stripe). No session here, so nothing is connected: it checks the state and passes the code on to the
 * page the owner started from, which completes it signed in ([ConnectExisting.relay]). Always redirects.
 */
fun Route.stripeConnectCallbackRoutes(ctx: AppContext) {
    get("/payments/stripe/callback") {
        val q = call.request.queryParameters
        val target = withContext(Dispatchers.IO) { ctx.connectExisting.relay(q["state"], q["code"], q["error"]) }
        call.respondRedirect(target)
    }
}

/** Longer than any state we sign or code Stripe issues. */
private const val MAX_STATE = 512
