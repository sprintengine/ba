package ie.bookanything.auth

import ie.bookanything.config.AppEnv
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.serializer
import java.security.MessageDigest
import java.time.Clock
import java.util.Base64
import java.util.UUID
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * The reserved namespace of the reliability simulation's identities. Nothing outside it can be signed in with a
 * simulation token, so a leaked `SIMULATION_AUTH_SECRET` can't impersonate a real user: real subjects are Clerk's
 * (`user_…`), and nobody can verify an address on a `.test` domain (RFC 6761), so no real account has one.
 */
object SimulationIdentity {
    /** Every simulation subject starts with this (Clerk's are `user_…`, dev auth's `dev_…`). */
    const val SUBJECT_PREFIX = "sim_"

    /** Every simulation email is on exactly this domain (not a subdomain of it). */
    const val EMAIL_DOMAIN = "sim.bookanything.test"

    private val subject = Regex("^sim_[A-Za-z0-9_-]{1,100}$")
    private val email = Regex("^[a-z0-9][a-z0-9._+-]{0,63}@sim\\.bookanything\\.test$")

    fun isSubject(value: String): Boolean = subject.matches(value)

    /** [value] must already be lower case: an address is normalised before it is checked. */
    fun isEmail(value: String): Boolean = email.matches(value)

    /** Whether a stored user is one of the simulation's: both the subject and the email are in the namespace. */
    fun isUser(subject: String, email: String?): Boolean = isSubject(subject) && email != null && isEmail(email.lowercase())
}

/**
 * Signs and verifies the simulation's tokens (docs/simulation.md, "On staging"; backend README "Simulation sign-in").
 * Two kinds, one secret:
 *
 * - **bearer** `sim.<payload>.<signature>`: `Authorization: Bearer sim.…` signs in as `{sub, email, name}`;
 * - **guest** `simg.<payload>.<signature>`: the `X-Simulation-Token` header of an anonymous request (a guest booking),
 *   which only moves it into the simulation's rate-limit bucket.
 *
 * `<payload>` is base64url (no padding) JSON with `iat` and `exp` (epoch seconds) and, for bearer tokens, `sub`,
 * `email` and an optional `name`; `jti` is optional and unused. `<signature>` is base64url HMAC-SHA256 with the secret
 * over `bookanything-simulation/v1\n<kind>.<payload>`, so a guest token is never a bearer token and the signed bytes
 * are exactly the ones received. There is no header and no algorithm field to confuse: anything not in this shape is
 * refused before its payload is read, and the signature is compared in constant time before the JSON is parsed. A token
 * lives at most [MAX_LIFETIME_SECONDS], with [CLOCK_SKEW_SECONDS] of leeway.
 *
 * Constructed only from [ie.bookanything.config.SimulationAuthConfig], which production refuses; the constructor
 * refuses production too.
 */
class SimulationTokens(secret: String, private val clock: Clock, env: AppEnv) {
    init {
        require(env.allowsSimulationAuth) { "Simulation tokens are refused in production." }
        require(secret.toByteArray(Charsets.UTF_8).size >= MIN_SECRET_BYTES) { "The simulation secret is too short." }
    }

    private val key = SecretKeySpec(secret.toByteArray(Charsets.UTF_8), "HmacSHA256")

    @Serializable
    private data class Claims(
        val sub: String? = null,
        val email: String? = null,
        val name: String? = null,
        val iat: Long,
        val exp: Long,
        val jti: String? = null,
    )

    /** The identity a bearer token proves, or null for anything else (never throws for a bad token). */
    fun verifyBearer(token: String): VerifiedIdentity? {
        val claims = verified(token, BEARER) ?: return null
        val sub = claims.sub?.takeIf(SimulationIdentity::isSubject) ?: return null
        val email = claims.email?.lowercase()?.takeIf(SimulationIdentity::isEmail) ?: return null
        val name = claims.name?.trim()?.takeIf { it.isNotEmpty() }
        if (name != null && (name.length > MAX_NAME || name.any(Char::isISOControl))) return null
        return VerifiedIdentity(sub, email, emailVerified = true, name = name)
    }

    /** Whether [token] is a valid guest token (`X-Simulation-Token`). */
    fun verifyGuest(token: String): Boolean {
        val claims = verified(token, GUEST) ?: return false
        return claims.sub == null && claims.email == null && claims.name == null
    }

    /** A bearer token for [subject] (`sim_…`) and [email] (`…@sim.bookanything.test`), valid for [lifetimeSeconds]. */
    fun bearer(subject: String, email: String, name: String?, lifetimeSeconds: Long = MAX_LIFETIME_SECONDS): String {
        require(SimulationIdentity.isSubject(subject) && SimulationIdentity.isEmail(email.lowercase())) { "Not a simulation identity." }
        return sign(BEARER, payload(lifetimeSeconds, subject, email, name))
    }

    /** A guest token for `X-Simulation-Token`, valid for [lifetimeSeconds]. */
    fun guest(lifetimeSeconds: Long = MAX_LIFETIME_SECONDS): String = sign(GUEST, payload(lifetimeSeconds))

    private fun payload(lifetimeSeconds: Long, sub: String? = null, email: String? = null, name: String? = null): String {
        require(lifetimeSeconds in 1..MAX_LIFETIME_SECONDS) { "A simulation token lives at most $MAX_LIFETIME_SECONDS seconds." }
        val now = clock.instant().epochSecond
        val claims = Claims(sub, email, name, now, now + lifetimeSeconds, UUID.randomUUID().toString())
        return json.encodeToString(serializer<Claims>(), claims)
    }

    private fun sign(kind: String, payloadJson: String): String {
        val payload = b64.encodeToString(payloadJson.toByteArray(Charsets.UTF_8))
        return "$kind.$payload.${b64.encodeToString(mac(kind, payload))}"
    }

    private fun mac(kind: String, payload: String): ByteArray =
        Mac.getInstance("HmacSHA256").apply { init(key) }.doFinal("$CONTEXT$kind.$payload".toByteArray(Charsets.UTF_8))

    /** The claims of [token] when it is a [kind] token signed with our secret and current; null otherwise. */
    private fun verified(token: String, kind: String): Claims? {
        val payload = signedPayload(token, kind) ?: return null
        val claims = try {
            json.decodeFromString(serializer<Claims>(), payload.toString(Charsets.UTF_8))
        } catch (_: IllegalArgumentException) { // Bad JSON or claims of the wrong type (SerializationException is one).
            null
        }
        return claims?.takeIf(::current)
    }

    /** The payload's bytes when [token] has exactly the shape of a [kind] token and its signature is ours; null otherwise. */
    private fun signedPayload(token: String, kind: String): ByteArray? {
        val parts = if (token.length <= MAX_TOKEN_LENGTH) token.split('.') else return null
        val wellFormed = parts.size == 3 && parts[0] == kind &&
            BASE64URL.matches(parts[1]) && BASE64URL.matches(parts[2])
        if (!wellFormed) return null
        val given = decode(parts[2])?.takeIf { it.size == SIGNATURE_BYTES } ?: return null
        // Compared in constant time, before a byte of the payload is read.
        return if (MessageDigest.isEqual(mac(kind, parts[1]), given)) decode(parts[1]) else null
    }

    private fun current(claims: Claims): Boolean {
        val now = clock.instant().epochSecond
        // In this order nothing overflows: iat is bounded first, then exp by it.
        return claims.iat in 0..now + CLOCK_SKEW_SECONDS && claims.exp in claims.iat + 1..claims.iat + MAX_LIFETIME_SECONDS &&
            now < claims.exp + CLOCK_SKEW_SECONDS
    }

    private fun decode(part: String): ByteArray? = try {
        Base64.getUrlDecoder().decode(part)
    } catch (_: IllegalArgumentException) {
        null
    }

    companion object {
        const val BEARER = "sim"
        const val GUEST = "simg"

        /** The request header that carries a guest token. */
        const val GUEST_HEADER = "X-Simulation-Token"

        /** 15 minutes: the runner mints a fresh token well before one runs out. */
        const val MAX_LIFETIME_SECONDS = 900L
        const val CLOCK_SKEW_SECONDS = 30L
        const val MIN_SECRET_BYTES = 32
        private const val MAX_TOKEN_LENGTH = 2048
        private const val MAX_NAME = 200
        private const val SIGNATURE_BYTES = 32
        private const val CONTEXT = "bookanything-simulation/v1\n"
        private val BASE64URL = Regex("^[A-Za-z0-9_-]+$")
        private val b64 = Base64.getUrlEncoder().withoutPadding()

        /** Unknown claims are refused, so a token can't carry anything this code doesn't check. */
        private val json = Json { ignoreUnknownKeys = false; explicitNulls = false }
    }
}

/** Verifies `sim.…` bearer tokens with [simulation] and every other token with [primary] (Clerk, or dev auth). */
class SimulationAwareVerifier(private val primary: TokenVerifier, private val simulation: SimulationTokens) : TokenVerifier {
    override fun verify(token: String): VerifiedIdentity? =
        if (token.startsWith("${SimulationTokens.BEARER}.")) simulation.verifyBearer(token) else primary.verify(token)
}
