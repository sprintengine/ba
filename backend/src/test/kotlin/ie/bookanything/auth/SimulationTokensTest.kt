package ie.bookanything.auth

import ie.bookanything.config.AppEnv
import ie.bookanything.support.DEFAULT_NOW
import ie.bookanything.support.MutableClock
import java.util.Base64
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The simulation's tokens (docs/simulation.md, "On staging"): only well-formed, correctly signed, current tokens for
 * identities in the reserved namespace are accepted. Everything here is refused without a database or a server.
 */
class SimulationTokensTest {
    private val secret = "simulation-secret-for-tests-0123456789"
    private val clock = MutableClock(DEFAULT_NOW)
    private val tokens = SimulationTokens(secret, clock, AppEnv.STAGING)
    private val sub = "sim_abc12_customer1"
    private val email = "sim-abc12-customer1@sim.bookanything.test"
    private val b64 = Base64.getUrlEncoder().withoutPadding()

    /** A token signed with [key] over [payloadJson] exactly as [SimulationTokens] signs, for forging variations. */
    private fun forge(payloadJson: String, kind: String = "sim", key: String = secret): String {
        val payload = b64.encodeToString(payloadJson.toByteArray())
        val mac = Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(key.toByteArray(), "HmacSHA256")) }
            .doFinal("bookanything-simulation/v1\n$kind.$payload".toByteArray())
        return "$kind.$payload.${b64.encodeToString(mac)}"
    }

    private val now get() = clock.instant.epochSecond

    private fun claims(sub: String = this.sub, email: String = this.email, iat: Long = now, exp: Long = now + 600, extra: String = "") =
        """{"sub":"$sub","email":"$email","name":"Customer 1","iat":$iat,"exp":$exp$extra}"""

    @Test
    fun `a token it signed for a simulation identity signs that identity in, with a verified email`() {
        val identity = assertNotNull(tokens.verifyBearer(tokens.bearer(sub, email, "Customer 1")))
        assertEquals(VerifiedIdentity(sub, email, emailVerified = true, name = "Customer 1"), identity)
        // The same claims signed by the runner (TypeScript) verify the same: the format is the contract.
        assertEquals(identity, tokens.verifyBearer(forge(claims())))
        assertEquals(identity, tokens.verifyBearer(forge(claims(email = email.uppercase()))), "addresses are compared lower case")
        assertEquals("Customer 1", tokens.verifyBearer(forge(claims(extra = ""","jti":"a-nonce"""")))?.name)
        assertNull(tokens.verifyBearer(tokens.bearer(sub, email, null))?.name)
    }

    @Test
    fun `the runner mints exactly what this verifies (the vector simulation's auth test produces)`() {
        // Computed outside both code bases for this secret at the default test time; simulation/test/auth.test.ts mints it.
        val vector = listOf(
            "sim.eyJzdWIiOiJzaW1fdmVjX293bmVyMSIsImVtYWlsIjoic2ltLXZlYy1vd25lcjFAc2ltLmJvb2thbnl0aGluZy50ZXN0Iiwib",
            "mFtZSI6Ik93bmVyIDEgdmVjIiwiaWF0IjoxNzkxMTg3MjAwLCJleHAiOjE3OTExODc4MDAsImp0aSI6InZlY3Rvci1ub25jZSJ9",
            ".2FC8Psx3U0W2Ak4UeWi7-7yNJo5CigUUybcisIp35pk",
        ).joinToString("")
        val guest = listOf(
            "simg.eyJpYXQiOjE3OTExODcyMDAsImV4cCI6MTc5MTE4NzgwMCwianRpIjoidmVjdG9yLW5vbmNlIn0",
            ".wD0WEgStoklLS6lmSrihOAfeD2fzbAJOGfbbanKkRKM",
        ).joinToString("")
        assertEquals(
            VerifiedIdentity("sim_vec_owner1", "sim-vec-owner1@sim.bookanything.test", emailVerified = true, name = "Owner 1 vec"),
            tokens.verifyBearer(vector),
        )
        assertTrue(tokens.verifyGuest(guest))
    }

    @Test
    fun `identities outside the reserved namespace are refused, so a leaked secret can't become a real user`() {
        listOf("user_2abc", "dev_owner", "sim", "sim_", "SIM_abc", "xsim_abc", "sim_abc def", "sim_" + "a".repeat(101), "sim_abc\u0000")
            .forEach { assertNull(tokens.verifyBearer(forge(claims(sub = it))), "sub $it") }
        listOf(
            "owner@bookanything.ie", "owner@bookanything.test", "a@example.test", "a@sim.bookanything.test.evil.example",
            "a@evil.sim.bookanything.test", "a@sim-bookanything.test", "a@simxbookanything.test", "@sim.bookanything.test",
            "a b@sim.bookanything.test", "a@b@sim.bookanything.test", "a@sim.bookanything.test ", ".a@sim.bookanything.test",
        ).forEach { assertNull(tokens.verifyBearer(forge(claims(email = it))), "email $it") }
        assertNull(tokens.verifyBearer(forge("""{"email":"$email","iat":$now,"exp":${now + 60}}""")), "no sub")
        assertNull(tokens.verifyBearer(forge("""{"sub":"$sub","iat":$now,"exp":${now + 60}}""")), "no email")
        assertNull(tokens.verifyBearer(forge(claims().replace("Customer 1", "x".repeat(201)))), "name too long")
        assertNull(tokens.verifyBearer(forge(claims().replace("Customer 1", "Cust\\u0007omer"))), "control character in name")
        // Nor will it mint one.
        assertFailsWith<IllegalArgumentException> { tokens.bearer("user_2abc", email, null) }
        assertFailsWith<IllegalArgumentException> { tokens.bearer(sub, "real.person@example.ie", null) }
    }

    @Test
    fun `expired, not yet issued and overlong tokens are refused, with half a minute of clock skew`() {
        assertNull(tokens.verifyBearer(forge(claims(iat = now - 700, exp = now - 31))), "expired")
        assertNotNull(tokens.verifyBearer(forge(claims(iat = now - 700, exp = now - 29))), "within the skew")
        assertNull(tokens.verifyBearer(forge(claims(iat = now + 31, exp = now + 600))), "issued in the future")
        assertNotNull(tokens.verifyBearer(forge(claims(iat = now + 29, exp = now + 600))))
        assertNull(tokens.verifyBearer(forge(claims(iat = now, exp = now + 901))), "lives longer than 15 minutes")
        assertNotNull(tokens.verifyBearer(forge(claims(iat = now, exp = now + 900))))
        assertNull(tokens.verifyBearer(forge(claims(iat = now, exp = now))), "exp must follow iat")
        assertNull(tokens.verifyBearer(forge(claims(iat = now - 10, exp = Long.MAX_VALUE))), "no forever tokens")
        assertNull(tokens.verifyBearer(forge(claims(iat = -1, exp = Long.MAX_VALUE))), "no overflow")
        assertNull(tokens.verifyBearer(forge(claims(iat = Long.MIN_VALUE, exp = Long.MIN_VALUE + 60))), "no overflow")

        val token = tokens.bearer(sub, email, null, lifetimeSeconds = 120)
        clock.instant = clock.instant.plusSeconds(140)
        assertNotNull(tokens.verifyBearer(token), "still within the skew")
        clock.instant = clock.instant.plusSeconds(20)
        assertNull(tokens.verifyBearer(token), "expired")
        assertFailsWith<IllegalArgumentException> { tokens.bearer(sub, email, null, lifetimeSeconds = 901) }
        assertFailsWith<IllegalArgumentException> { tokens.guest(lifetimeSeconds = 0) }
    }

    @Test
    fun `tampered, re-signed and malformed tokens are refused`() {
        val good = tokens.bearer(sub, email, "Customer 1")
        val (kind, payload, signature) = good.split('.')
        val otherPayload = b64.encodeToString(claims(sub = "sim_someone_else").toByteArray())
        assertNull(tokens.verifyBearer("$kind.$otherPayload.$signature"), "payload swapped under the signature")
        val flipped = signature.toCharArray().also { it[3] = if (it[3] == 'A') 'B' else 'A' }.concatToString()
        assertNull(tokens.verifyBearer("$kind.$payload.$flipped"), "signature changed")
        assertNull(tokens.verifyBearer(forge(claims(), key = "another-secret-entirely-0123456789ab")), "another secret")
        assertNull(tokens.verifyBearer("$kind.$payload.${signature.dropLast(2)}"), "truncated signature")
        assertNull(tokens.verifyBearer("$kind.$payload.$signature="), "padding")
        assertNull(tokens.verifyBearer("$kind.$payload=.$signature"), "padding on the payload")
        assertNull(tokens.verifyBearer("$kind.$payload"), "no signature")
        assertNull(tokens.verifyBearer("$kind.$payload.$signature.extra"), "a fourth part")
        assertNull(tokens.verifyBearer("$kind.$payload.."), "empty signature")
        assertNull(tokens.verifyBearer("$kind..$signature"), "empty payload")
        assertNull(tokens.verifyBearer(" $good"), "leading space")
        good.replace('-', '+').replace('_', '/').takeIf { it != good }?.let {
            assertNull(tokens.verifyBearer(it), "standard base64 is not base64url")
        }
        assertNull(tokens.verifyBearer("sim.${"A".repeat(3000)}.$signature"), "oversized")
        assertNull(tokens.verifyBearer(""))
        // A signature that is valid but over bytes that aren't JSON, or claims of the wrong type, or unknown claims.
        assertNull(tokens.verifyBearer(forge("not json")))
        assertNull(tokens.verifyBearer(forge("""{"sub":"$sub","email":"$email","iat":"soon","exp":${now + 60}}""")))
        assertNull(tokens.verifyBearer(forge("""{"sub":["$sub"],"email":"$email","iat":$now,"exp":${now + 60}}""")))
        assertNull(tokens.verifyBearer(forge(claims(extra = ""","role":"owner""""))), "unknown claim")
        assertNull(tokens.verifyBearer(forge(claims(extra = ""","admin":true""""))), "unknown claim")
        assertNull(tokens.verifyBearer(forge("""{"sub":"$sub","email":"$email","iat":$now}""")), "no exp")
    }

    @Test
    fun `there is no algorithm to confuse, and JWTs, dev tokens and the other kind of token are refused`() {
        val header = { json: String -> b64.encodeToString(json.toByteArray()) }
        val payload = b64.encodeToString(claims().toByteArray())
        // An unsigned JWT ("alg":"none") and an HS256 JWT signed with the simulation secret, which a JOSE library would take.
        assertNull(tokens.verifyBearer("${header("""{"alg":"none","typ":"JWT"}""")}.$payload."))
        val hs256Input = "${header("""{"alg":"HS256","typ":"JWT"}""")}.$payload"
        val hs256 = Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(secret.toByteArray(), "HmacSHA256")) }
            .doFinal(hs256Input.toByteArray())
        assertNull(tokens.verifyBearer("$hs256Input.${b64.encodeToString(hs256)}"))
        // A sim token whose "kind" is a JOSE header, and a token with a header in front.
        assertNull(tokens.verifyBearer(forge(claims(), kind = header("""{"alg":"none"}"""))))
        assertNull(tokens.verifyBearer("sim.${header("""{"alg":"HS256"}""")}.$payload.x"))
        // A MAC over the payload without the domain separation (the plain HMAC a careless runner would compute).
        val plain = Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(secret.toByteArray(), "HmacSHA256")) }
            .doFinal(payload.toByteArray())
        assertNull(tokens.verifyBearer("sim.$payload.${b64.encodeToString(plain)}"))
        assertNull(tokens.verifyBearer(DevTokenVerifier.token("dev_sim_abc", email, null)))
        // Guest tokens are not bearer tokens, and bearer tokens are not guest tokens, though one secret signs both.
        val guest = tokens.guest()
        assertTrue(tokens.verifyGuest(guest))
        assertNull(tokens.verifyBearer(guest))
        assertNull(tokens.verifyBearer("sim." + guest.removePrefix("simg.")), "a guest token relabelled")
        assertFalse(tokens.verifyGuest(tokens.bearer(sub, email, null)))
        assertFalse(tokens.verifyGuest("simg." + tokens.bearer(sub, email, null).removePrefix("sim.")), "a bearer token relabelled")
        assertFalse(tokens.verifyGuest(forge(claims(), kind = "simg")), "a guest token carrying an identity")
        assertTrue(tokens.verifyGuest(forge("""{"iat":$now,"exp":${now + 600},"jti":"n1"}""", kind = "simg")))
        assertFalse(tokens.verifyGuest(forge("""{"iat":${now - 1000},"exp":${now - 100}}""", kind = "simg")), "expired")
        assertFalse(tokens.verifyGuest(forge("""{"iat":$now,"exp":${now + 600}}""", kind = "simg", key = "x".repeat(40))))
    }

    @Test
    fun `the verifier sends sim tokens to the simulation and everything else to the primary verifier`() {
        val seen = mutableListOf<String>()
        val primary = TokenVerifier { token -> seen += token; null }
        val verifier = SimulationAwareVerifier(primary, tokens)
        assertEquals(sub, verifier.verify(tokens.bearer(sub, email, null))?.subject)
        assertNull(verifier.verify("sim.bogus.token"))
        assertEquals(emptyList(), seen, "the primary verifier never sees a sim token")
        verifier.verify("eyJhbGciOiJSUzI1NiJ9.e30.sig")
        assertEquals(listOf("eyJhbGciOiJSUzI1NiJ9.e30.sig"), seen)
        assertTrue(SimulationIdentity.isUser(sub, email))
        assertFalse(SimulationIdentity.isUser("user_2abc", email))
        assertFalse(SimulationIdentity.isUser(sub, "real@example.ie"))
        assertFalse(SimulationIdentity.isUser(sub, null))
    }
}
