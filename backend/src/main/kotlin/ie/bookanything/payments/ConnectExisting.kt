package ie.bookanything.payments

import ie.bookanything.audit.Actor
import ie.bookanything.audit.Audit
import ie.bookanything.auth.Memberships
import ie.bookanything.auth.Role
import ie.bookanything.auth.TokenService
import ie.bookanything.business.BusinessRepository
import ie.bookanything.business.BusinessRow
import ie.bookanything.config.AppUrls
import ie.bookanything.db.Db
import ie.bookanything.db.PgState
import ie.bookanything.db.constraintName
import ie.bookanything.db.instant
import ie.bookanything.db.instantOrNull
import ie.bookanything.db.queryOne
import ie.bookanything.db.sqlState
import ie.bookanything.db.str
import ie.bookanything.db.update
import ie.bookanything.db.uuid
import ie.bookanything.http.ApiException
import ie.bookanything.http.Errors
import org.slf4j.LoggerFactory
import java.sql.Connection
import java.sql.SQLException
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.Base64
import java.util.UUID

/** What a Connect OAuth `state` says: the business and owner it was issued to, its nonce and when it stops working. */
data class ConnectStateClaims(val businessId: UUID, val userId: UUID, val nonce: String, val expiresAt: Instant)

/**
 * The Connect OAuth `state` (CSRF protection): `base64url(v1.businessId.userId.nonce.expiry).mac`, the MAC keyed with
 * `TOKEN_SECRET`. A tampered or foreign state fails the MAC before anything is looked up; the nonce makes it single use
 * (`stripe_connect_states`, consumed atomically) and the expiry short lived.
 */
object StripeConnectState {
    private const val PURPOSE = "stripe-connect-state"
    private const val VERSION = "v1"
    private const val FIELDS = 5
    val TTL: Duration = Duration.ofMinutes(10)

    private val encoder = Base64.getUrlEncoder().withoutPadding()

    fun encode(tokens: TokenService, c: ConnectStateClaims): String {
        val payload = encoder.encodeToString(
            listOf(VERSION, c.businessId, c.userId, c.nonce, c.expiresAt.epochSecond).joinToString(".").toByteArray(Charsets.UTF_8),
        )
        return "$payload.${tokens.sign(PURPOSE, payload)}"
    }

    /** The claims of a state this server signed, or null (malformed, tampered, signed with another key). Expiry is not checked. */
    fun decode(tokens: TokenService, state: String?): ConnectStateClaims? {
        val parts = state?.takeIf { it.length <= MAX_LENGTH }?.split('.') ?: return null
        if (parts.size != 2 || !tokens.verify(PURPOSE, parts[0], parts[1])) return null
        val fields = runCatching { String(Base64.getUrlDecoder().decode(parts[0]), Charsets.UTF_8) }.getOrNull()?.split('.')
        if (fields == null || fields.size != FIELDS || fields.first() != VERSION) return null
        val (business, user, nonce, expiry) = fields.drop(1)
        return runCatching {
            ConnectStateClaims(UUID.fromString(business), UUID.fromString(user), nonce, Instant.ofEpochSecond(expiry.toLong()))
        }.getOrNull()
    }

    private const val MAX_LENGTH = 512
}

/** `stripe_connect_states`: the nonces of issued states (hashed), who they were issued to and whether they were used. */
object StripeConnectStateRepository {
    data class Row(val businessId: UUID, val userId: UUID, val returnUrl: String, val expiresAt: Instant, val usedAt: Instant?)

    fun insert(conn: Connection, nonce: String, businessId: UUID, userId: UUID, returnUrl: String, expiresAt: Instant) {
        conn.update(
            "INSERT INTO stripe_connect_states (nonce_hash, business_id, user_id, return_url, expires_at) VALUES (?, ?, ?, ?, ?)",
            TokenService.hash(nonce), businessId, userId, returnUrl, expiresAt,
        )
    }

    /** The state's row, locked: the callback decides and marks it used in one transaction. */
    fun lock(conn: Connection, nonce: String): Row? = conn.queryOne(
        "SELECT business_id, user_id, return_url, expires_at, used_at FROM stripe_connect_states WHERE nonce_hash = ? FOR UPDATE",
        TokenService.hash(nonce),
    ) { Row(it.uuid("business_id"), it.uuid("user_id"), it.str("return_url"), it.instant("expires_at"), it.instantOrNull("used_at")) }

    fun markUsed(conn: Connection, nonce: String, now: Instant) {
        conn.update("UPDATE stripe_connect_states SET used_at = ? WHERE nonce_hash = ?", now, TokenService.hash(nonce))
    }

    /** Deletes up to [limit] states that expired before [before] (used or not: either way they can't be used again). */
    fun purgeExpired(conn: Connection, before: Instant, limit: Int): Int = conn.update(
        "DELETE FROM stripe_connect_states WHERE nonce_hash IN (SELECT nonce_hash FROM stripe_connect_states WHERE expires_at < ? LIMIT ?)",
        before, limit,
    )
}

/**
 * How connecting an existing account ended: the `outcome` of `POST /payments/connect/existing/complete`, or the `reason`
 * of `?stripe=connect_error&reason=` when Stripe's redirect could not go further. Clients say it in words.
 */
enum class ConnectOutcome(val wire: String) {
    CONNECTED("connected"),

    /** The owner said no on Stripe's page. */
    DENIED("denied"),

    /** The state was used, expired, or the code was too old: start again. */
    EXPIRED("expired"),

    /** The state is not ours, or not this business's and this person's (tampered, foreign, or someone else's link). */
    INVALID("invalid"),

    /** The person who started is no longer an owner of the business. */
    FORBIDDEN("forbidden"),

    /** The business has another Stripe account (disconnect it first). */
    ALREADY_CONNECTED("already_connected"),

    /** That Stripe account already takes payments for another business here. */
    ACCOUNT_IN_USE("account_in_use"),

    /** The account settles in another currency than the business charges in. */
    CURRENCY("currency"),

    /** Stripe failed; trying again may work. */
    FAILED("failed"),
}

/** `POST /payments/connect/existing/complete`: how it ended and, for [ConnectOutcome.CURRENCY], the account's currency. */
@kotlinx.serialization.Serializable
data class ConnectResultDto(val outcome: String, val currency: String? = null)

/**
 * "I already have a Stripe account" (docs/architecture.md section 7): Stripe Connect OAuth.
 *
 * 1. [start] (owner): a signed, single-use, short-lived state bound to the business and to that owner, and Stripe's page.
 * 2. Stripe sends the browser to our callback, [relay]: no session there, so it only checks the state and passes the code
 *    on to the page the owner started from (`?stripe=complete&code=&state=`), or says why it can't.
 * 3. That page, signed in, calls [complete]: the state must be this business's and this caller's (so a link someone
 *    else started can't attach the caller's Stripe account to their business), it is spent, the code is exchanged for
 *    the account id only (no access or refresh tokens are kept) and the account is linked if it fits the business.
 *
 * [disconnect] undoes either way of connecting; the processor applies Stripe's `account.application.deauthorized`.
 */
class ConnectExisting(
    private val db: Db,
    private val clock: Clock,
    private val tokens: TokenService,
    private val provider: PaymentProvider,
    private val urls: AppUrls,
    private val redirectUri: String,
) {
    private val log = LoggerFactory.getLogger(ConnectExisting::class.java)

    /** Owner only (the caller checks). Returns Stripe's authorize URL. */
    fun start(business: BusinessRow, userId: UUID, returnUrl: String, actor: Actor): String {
        if (!provider.canConnectExisting) {
            throw Errors.paymentsNotConfigured("Connecting an existing Stripe account isn't available on this server.")
        }
        if (business.stripeAccountId != null) {
            throw Errors.conflict("This business already has a Stripe account. Disconnect it first to connect a different one.")
        }
        val now = clock.instant()
        val claims = ConnectStateClaims(business.id, userId, TokenService.randomToken(), now.plus(StripeConnectState.TTL))
        db.txBlocking(business.id) {
            StripeConnectStateRepository.insert(it, claims.nonce, business.id, userId, returnUrl, claims.expiresAt)
            Audit.record(it, business.id, actor, "payments.connect_started", "business", business.id, mapOf("method" to "oauth"))
        }
        return provider.existingAccountUrl(business, StripeConnectState.encode(tokens, claims), redirectUri)
    }

    /**
     * Stripe's redirect back ([state], and [code] or [error]): where to send the browser. Never throws for a bad request
     * (the browser always lands somewhere) and never connects anything: that takes the signed-in owner ([complete]).
     */
    fun relay(state: String?, code: String?, error: String?): String {
        val dashboard = urls.base + "/dashboard"
        val claims = StripeConnectState.decode(tokens, state)
            ?: return failed(dashboard, ConnectOutcome.INVALID).also { log.warn("stripe connect callback: invalid state") }
        return try {
            db.txBlocking(claims.businessId) { conn ->
                val row = StripeConnectStateRepository.lock(conn, claims.nonce)
                    ?: return@txBlocking failed(dashboard, ConnectOutcome.EXPIRED)
                val unusable = unusable(row, claims)
                when {
                    unusable != null -> failed(row.returnUrl, unusable)
                    error != null || code.isNullOrBlank() -> {
                        // Stripe's answer ends this attempt: the state is spent.
                        StripeConnectStateRepository.markUsed(conn, claims.nonce, clock.instant())
                        val outcome = if (error == "access_denied") ConnectOutcome.DENIED else ConnectOutcome.FAILED
                        if (outcome == ConnectOutcome.FAILED) log.warn("stripe connect callback error={}", error)
                        auditFailure(conn, claims.businessId, outcome, null)
                        failed(row.returnUrl, outcome)
                    }
                    else -> withQuery(row.returnUrl, "stripe=complete&code=${enc(code)}&state=${enc(state!!)}")
                }
            }
        } catch (@Suppress("TooGenericExceptionCaught") e: Exception) { // The browser must land somewhere, whatever failed.
            log.error("stripe connect callback failed", e)
            failed(dashboard, ConnectOutcome.FAILED)
        }
    }

    /**
     * Completes connecting the account Stripe's page authorized ([code]) for [businessId], as [userId] (signed in, an
     * owner: the caller checks). The [state] must have been issued to exactly this business and person.
     */
    fun complete(businessId: UUID, userId: UUID, state: String, code: String): ConnectResultDto {
        val claims = StripeConnectState.decode(tokens, state)
        if (claims == null || claims.businessId != businessId || claims.userId != userId) {
            log.warn("stripe connect for business {}: state not issued to this business and person", businessId)
            return result(ConnectOutcome.INVALID)
        }
        val checked = db.txBlocking(businessId) { conn -> spend(conn, claims) }
        if (checked != null) return result(checked)
        val accountId = try {
            provider.exchangeExistingAccountCode(code)
        } catch (e: StripeOAuthError) {
            log.warn("stripe connect for business {}: code refused ({})", businessId, e.code)
            return result(if (e.code == "invalid_grant") ConnectOutcome.EXPIRED else ConnectOutcome.FAILED)
        } catch (_: ApiException) {
            return result(ConnectOutcome.FAILED)
        }
        // From here Stripe has connected the account: anything that stops us linking it undoes that.
        val account = try {
            provider.existingAccount(accountId)
        } catch (_: ApiException) {
            undo(accountId)
            return result(ConnectOutcome.FAILED)
        }
        val outcome = try {
            db.txBlocking(businessId) { conn -> link(conn, claims, account) }
        } catch (e: SQLException) {
            if (e.sqlState() != PgState.UNIQUE_VIOLATION || e.constraintName() != ACCOUNT_UNIQUE) {
                undo(accountId)
                throw e
            }
            // Another business linked the same account at the same moment: it is theirs (the undo below leaves it).
            ConnectOutcome.ACCOUNT_IN_USE
        } catch (@Suppress("TooGenericExceptionCaught") e: Exception) { // Rethrown: the connection is undone first.
            undo(accountId)
            throw e
        }
        if (outcome != ConnectOutcome.CONNECTED) undo(accountId)
        return result(outcome, account.defaultCurrency?.uppercase()?.takeIf { outcome == ConnectOutcome.CURRENCY })
    }

    /** Why [row] can't be used for [claims] (null: it can). */
    private fun unusable(row: StripeConnectStateRepository.Row, claims: ConnectStateClaims): ConnectOutcome? {
        val now = clock.instant()
        return when {
            row.businessId != claims.businessId || row.userId != claims.userId -> ConnectOutcome.INVALID
            row.usedAt != null || !now.isBefore(row.expiresAt) || !now.isBefore(claims.expiresAt) -> ConnectOutcome.EXPIRED
            else -> null
        }
    }

    /** Spends the state (once, even with two completions at once) and checks the business can link an account. */
    private fun spend(conn: Connection, claims: ConnectStateClaims): ConnectOutcome? {
        val row = StripeConnectStateRepository.lock(conn, claims.nonce) ?: return ConnectOutcome.EXPIRED
        unusable(row, claims)?.let { return it }
        StripeConnectStateRepository.markUsed(conn, claims.nonce, clock.instant())
        val business = BusinessRepository.findById(conn, claims.businessId)
        val failure = when {
            business == null || business.isSuspended -> ConnectOutcome.FORBIDDEN
            // Roles can change in the minutes the owner spent at Stripe.
            Memberships.find(conn, claims.businessId, claims.userId)?.role != Role.OWNER -> ConnectOutcome.FORBIDDEN
            // Checked before the code is exchanged, so nothing is connected at Stripe for nothing.
            business.stripeAccountId != null -> ConnectOutcome.ALREADY_CONNECTED
            else -> null
        }
        failure?.let { auditFailure(conn, claims.businessId, it, null) }
        return failure
    }

    private fun link(conn: Connection, claims: ConnectStateClaims, account: LinkedAccount): ConnectOutcome {
        val business = BusinessRepository.lockById(conn, claims.businessId) ?: return ConnectOutcome.FORBIDDEN
        // The same account linked a moment ago (a second tab, or the app and the website): already done.
        if (business.stripeAccountId == account.accountId) return ConnectOutcome.CONNECTED
        val failure = when {
            StripeAccountRepository.businessIdByAccount(conn, account.accountId) != null -> ConnectOutcome.ACCOUNT_IN_USE
            business.stripeAccountId != null -> ConnectOutcome.ALREADY_CONNECTED
            account.defaultCurrency?.equals(business.currency, ignoreCase = true) == false -> ConnectOutcome.CURRENCY
            else -> null
        }
        if (failure != null) {
            auditFailure(conn, business.id, failure, account.accountId)
            return failure
        }
        StripeAccountRepository.linkExisting(conn, business.id, account.accountId, account.chargesEnabled, account.detailsSubmitted)
        Audit.record(
            conn, business.id, Actor.member(Role.OWNER, claims.userId), "payments.connected", "business", business.id,
            mapOf(
                "method" to "oauth", "account" to account.accountId, "chargesEnabled" to account.chargesEnabled,
                "country" to account.country,
            ),
        )
        return ConnectOutcome.CONNECTED
    }

    /** Ends the connection Stripe made for [accountId] that we don't keep (best effort; see [deauthorizeIfUnused]). */
    private fun undo(accountId: String) {
        runCatching { deauthorizeIfUnused(accountId, except = null) }
            .onFailure { log.warn("could not undo the Stripe connection of {}: {}", accountId, it.message) }
    }

    /**
     * Ends our access to [accountId] at Stripe unless something here still needs it: a business linked to it, or money
     * on it for any business but [except] (a refund to send, a checkout that may still be paid, an upcoming booking paid
     * there). Returns whether it did.
     */
    private fun deauthorizeIfUnused(accountId: String, except: UUID?): Boolean {
        val needed = db.txBlocking(readOnly = true) { conn ->
            StripeAccountRepository.businessIdByAccount(conn, accountId) != null ||
                AccountPayments.accountHasOpenPayments(conn, accountId, clock.instant(), except)
        }
        if (needed) {
            log.info("not deauthorizing {}: it is still in use here", accountId)
            return false
        }
        return provider.disconnectExisting(accountId)
    }

    /**
     * Owner only (the caller checks). Forgets the business's Stripe account, so it stops taking online payments.
     *
     * - An account we created stays the owner's, with its own dashboard, and we keep access to it: its open checkouts
     *   are closed after it is forgotten (one paid meanwhile still confirms its booking, matched by the account it was
     *   taken on) and its charges can still be refunded.
     * - For an account connected with OAuth our access ends, so nothing may still need it: refused while a refund on it
     *   waits or an upcoming booking paid on it could be refunded, and its open checkouts are closed first (refused when
     *   one was just paid, as its confirmation is on its way). Deauthorized after the commit, so Stripe's event finds no
     *   business, and only if no other business's money is on it.
     *
     * Returns whether there was an account.
     */
    fun disconnect(business: BusinessRow, actor: Actor): Boolean {
        val accountId = business.stripeAccountId ?: return false
        val oauth = business.stripeConnectMethod == "oauth"
        if (oauth) {
            val open = db.txBlocking(business.id, readOnly = true) {
                AccountPayments.openCheckouts(it, business.id, provider.name, accountId)
            }
            if (open.any { provider.expireCheckout(business, it.providerRef!!, accountId) }) {
                throw Errors.conflict("A customer has just paid on this Stripe account. Try again in a few minutes, once it is confirmed.")
            }
        }
        val open = db.txBlocking(business.id) { conn ->
            val current = BusinessRepository.lockById(conn, business.id)
            if (current?.stripeAccountId != accountId) return@txBlocking null
            if (oauth) {
                val paid = AccountPayments.refundableUpcoming(conn, business.id, accountId, clock.instant())
                if (paid > 0) throw Errors.conflict(refundsNeedAccount(paid))
                if (AccountPayments.pendingRefunds(conn, business.id, accountId) > 0) {
                    throw Errors.conflict("A refund on this Stripe account is still being made. Try again once it has gone through.")
                }
            }
            StripeAccountRepository.unlink(conn, business.id, accountId)
            Audit.record(
                conn, business.id, actor, "payments.disconnected", "business", business.id,
                mapOf("account" to accountId, "method" to business.stripeConnectMethod),
            )
            AccountPayments.openCheckouts(conn, business.id, provider.name, accountId)
        } ?: return false
        if (!oauth) {
            open.forEach { charge ->
                runCatching { provider.expireCheckout(business, charge.providerRef!!, accountId) }
                    .onFailure { log.warn("closing checkout of payment {} after disconnecting failed: {}", charge.id, it.message) }
            }
            return true
        }
        runCatching { deauthorizeIfUnused(accountId, except = business.id) }
            .onFailure { log.warn("deauthorizing {} for business {} failed: {}", accountId, business.id, it.message) }
        return true
    }

    private fun auditFailure(conn: Connection, businessId: UUID, outcome: ConnectOutcome, account: String?) {
        Audit.record(
            conn, businessId, Actor.SYSTEM, "payments.connect_failed", "business", businessId,
            mapOf("method" to "oauth", "reason" to outcome.wire, "account" to account),
        )
    }

    private fun result(outcome: ConnectOutcome, currency: String? = null) = ConnectResultDto(outcome.wire, currency)

    private fun failed(returnUrl: String, outcome: ConnectOutcome) = withQuery(returnUrl, "stripe=connect_error&reason=${outcome.wire}")

    private fun withQuery(url: String, query: String) = StripePaymentProvider.withQuery(url, query)

    private fun enc(s: String) = java.net.URLEncoder.encode(s, Charsets.UTF_8)

    companion object {
        const val CALLBACK_PATH = "/v1/payments/stripe/callback"
        private const val ACCOUNT_UNIQUE = "businesses_stripe_account_uq"

        fun refundsNeedAccount(bookings: Int): String =
            "$bookings upcoming ${if (bookings == 1) "booking was" else "bookings were"} paid online through this Stripe account, " +
                "and refunding a cancellation needs it connected. Disconnect it once they have taken place."
    }
}
