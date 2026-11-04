package ie.bookanything.payments

import ie.bookanything.AppContext
import ie.bookanything.audit.Actor
import ie.bookanything.audit.Audit
import ie.bookanything.auth.BusinessAccess
import ie.bookanything.auth.Role
import ie.bookanything.auth.SimulationBusinesses
import ie.bookanything.auth.SimulationIdentity
import ie.bookanything.auth.simulationCaller
import ie.bookanything.business.BusinessRepository
import ie.bookanything.business.BusinessRow
import ie.bookanything.businessAccess
import ie.bookanything.config.AppEnv
import ie.bookanything.http.ApiException
import ie.bookanything.http.Errors
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.post
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * `POST /v1/businesses/{businessId}/payments/simulation-account` (docs/simulation.md, "Payments on staging"): gives a
 * simulated business a Stripe test account that can take payments ([SimulationStripeAccounts]), creating it on the
 * first call, and says whether Stripe has enabled charges on it yet (the simulation calls again until it has).
 *
 * Not a way to attach an account to anything else. Each of these must hold, else the answer is the 404 of an unknown
 * path:
 * - the route only exists on staging with the simulation sign-in (`SIMULATION_AUTH_SECRET`, refused in production);
 * - the caller signed in with a simulation token, as a simulation identity, and owns the business;
 * - the business is a simulation business ([SimulationBusinesses]: `sim-` slug, simulation owner, no other member),
 *   checked again under the business's row lock when the account is stored.
 *
 * Then Stripe must be on a test key (`sk_test_`/`rk_test_`), else `PAYMENTS_NOT_CONFIGURED` (the simulation then runs
 * without paid bookings). The account is always one this call creates, never one named by the caller; a business that
 * already has an account of another kind keeps it (409).
 */
fun Route.simulationPaymentRoutes(ctx: AppContext) {
    if (ctx.simulation == null || ctx.config.env != AppEnv.STAGING) return
    post("/payments/simulation-account") {
        val access = call.simulationOwner(ctx)
        val stripe = ctx.simulationStripe ?: throw Errors.paymentsNotConfigured(
            "Simulation Stripe accounts need Stripe in test mode on this server (STRIPE_SECRET_KEY=sk_test_…).",
        )
        var business = access.business.takeIf { it.stripeAccountId != null } ?: createAccount(ctx, stripe, access.business, access.actor)
        val state = try {
            withContext(Dispatchers.IO) { stripe.state(business.stripeAccountId!!) }
        } catch (e: StripeRefusedException) {
            if (!SimulationStripeAccounts.isGone(e) || business.stripeConnectMethod != "created") throw e
            // The stored account is gone at Stripe (deleted by hand, say): forget it and make another, once.
            business = createAccount(ctx, stripe, forgetAccount(ctx, business), access.actor)
            withContext(Dispatchers.IO) { stripe.state(business.stripeAccountId!!) }
        }
        val accountId = business.stripeAccountId!!
        if (!SimulationStripeAccounts.isOurs(state, business.id)) {
            throw Errors.conflict("This business has a Stripe account that isn't a simulation account; it is left as it is.")
        }
        storeConnectStatus(ctx, business, accountId, state.chargesEnabled, state.detailsSubmitted)
        call.respond(
            SimulationAccountDto(accountId, state.chargesEnabled, state.detailsSubmitted, state.requirementsDue, state.disabledReason),
        )
    }
}

/** The caller's access as the owner of a simulation business, both the simulation's; else the 404 of an unknown path. */
private suspend fun ApplicationCall.simulationOwner(ctx: AppContext): BusinessAccess {
    if (simulationCaller?.signedIn != true) throw hidden()
    // Not a member, or not its owner: the same 404 (only bots signed in with the simulation's secret get this far).
    val access = try {
        businessAccess(ctx, Role.OWNER)
    } catch (_: ApiException) {
        throw hidden()
    }
    if (!SimulationIdentity.isUser(access.user.clerkUserId, access.user.email)) throw hidden()
    if (!ctx.db.read(access.businessId) { SimulationBusinesses.isSimulation(it, access.businessId) }) throw hidden()
    return access
}

/**
 * Creates [business]'s test account and stores it, if it is still a simulation business with no account (checked under
 * its locks). Otherwise the new account is deleted and the business moves to its next account generation, so a later
 * call doesn't get the deleted one back from Stripe's idempotency.
 */
private suspend fun createAccount(ctx: AppContext, stripe: SimulationStripeAccounts, business: BusinessRow, actor: Actor): BusinessRow {
    val id = business.id
    val created = withContext(Dispatchers.IO) { stripe.create(business) }
    val stored = ctx.db.tx(id) { conn ->
        SimulationBusinesses.lock(conn, listOf(id))
        val sim = SimulationBusinesses.isSimulation(conn, id)
        if (sim && StripeAccountRepository.setAccountIdIfMissing(conn, id, created)) {
            Audit.record(conn, id, actor, "payments.simulation_account_created", "business", id, mapOf("accountId" to created))
        }
        val now = BusinessRepository.findById(conn, id)
        if (now?.stripeAccountId != created) StripeAccountRepository.nextAccountGeneration(conn, id)
        now.takeIf { sim }
    }
    if (stored?.stripeAccountId != created) {
        // A member who isn't the simulation's joined meanwhile, or the business got another account first.
        withContext(Dispatchers.IO) { stripe.deleteIfOurs(created, id) }
        throw if (stored == null) hidden() else Errors.conflict("This business got another Stripe account meanwhile.")
    }
    return stored
}

/** Forgets [business]'s account (gone at Stripe) if it is still a simulation business; returns it as it is now. */
private suspend fun forgetAccount(ctx: AppContext, business: BusinessRow): BusinessRow = ctx.db.tx(business.id) { conn ->
    SimulationBusinesses.lock(conn, listOf(business.id))
    if (!SimulationBusinesses.isSimulation(conn, business.id)) throw hidden()
    StripeAccountRepository.unlink(conn, business.id, business.stripeAccountId!!)
    BusinessRepository.findById(conn, business.id) ?: throw hidden()
}

/** The answer to a path that doesn't exist, so the route can't be told apart from one. */
private fun hidden() = ApiException(HttpStatusCode.NotFound, "NOT_FOUND", "Not found.")
