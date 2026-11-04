package ie.bookanything.security

import ie.bookanything.auth.SvixVerifier
import ie.bookanything.config.ClerkConfig
import ie.bookanything.payments.StripePaymentProvider
import ie.bookanything.support.FakeStripeGateway
import ie.bookanything.support.Fixtures
import ie.bookanything.support.MutableClock
import ie.bookanything.support.StripeTest
import ie.bookanything.support.TestConfig
import ie.bookanything.support.TestEnv
import ie.bookanything.support.assertError
import ie.bookanything.support.assertStatus
import ie.bookanything.support.jsonOf
import ie.bookanything.support.o
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.unique
import ie.bookanything.support.withApp
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import java.util.Base64
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Webhook endpoints at the HTTP level: what reaches the handlers is exactly what the provider signed, recently, once.
 * `auth/ClerkWebhookTest` covers the Svix verifier itself and `payments/StripePaymentsTest` the basic Stripe cases.
 */
class WebhookSignatureTest {
    private val clerkSecret = "whsec_" + Base64.getEncoder().encodeToString("security-test-signing-key-32byte".toByteArray())
    private val otherSecret = "whsec_" + Base64.getEncoder().encodeToString("another-signing-key-of-32-bytes!".toByteArray())

    private fun clerkEnv(secret: String? = clerkSecret) =
        TestEnv(config = TestConfig.config(clerk = ClerkConfig(null, null, emptySet(), secret)))

    private suspend fun ie.bookanything.support.Api.clerk(body: String, headers: Map<String, String?>): HttpResponse =
        client.post("/v1/webhooks/clerk") {
            headers.forEach { (k, v) -> if (v != null) header(k, v) }
            contentType(ContentType.Application.Json); setBody(body)
        }

    private fun userCount(clerkId: String) =
        Fixtures.sqlOne("SELECT count(*) FROM users WHERE clerk_user_id = ?", clerkId) { it.getInt(1) }

    @Test
    fun `Clerk events need every Svix header, a valid signature and a fresh timestamp`() {
        val env = clerkEnv()
        val signer = SvixVerifier(clerkSecret, env.clock)
        val otherSigner = SvixVerifier(otherSecret, env.clock)
        withApp(env) { api ->
            val clerkId = "user_${unique("svix")}"
            val body = jsonOf("type" to "user.created", "data" to mapOf("id" to clerkId, "first_name" to "Sam"))
            val now = env.clock.instant().epochSecond
            fun headers(id: String? = "msg_${unique("m")}", ts: Long? = now, sig: String? = null, signedBody: String = body) = mapOf(
                "svix-id" to id, "svix-timestamp" to ts?.toString(),
                "svix-signature" to (sig ?: if (id != null && ts != null) "v1,${signer.sign(id, ts, signedBody)}" else "v1,AAAA"),
            )
            val refused = listOf(
                "no id" to headers(id = null), "no timestamp" to headers(ts = null),
                "no signature" to headers().filterKeys { it != "svix-signature" },
                "garbage signature" to headers(sig = "v1,bm90LWEtc2lnbmF0dXJl"),
                "unversioned signature" to headers().mapValues { (k, v) -> if (k == "svix-signature") v!!.removePrefix("v1,") else v },
                "signed for another body" to headers(signedBody = body.replace("Sam", "Eve")),
                "another secret" to "msg_other".let { id -> headers(id = id, sig = "v1,${otherSigner.sign(id, now, body)}") },
                "six minutes old" to (now - 360).let { ts -> "msg_old".let { id -> headers(id, ts, "v1,${signer.sign(id, ts, body)}") } },
                "six minutes ahead" to (now + 360).let { ts -> "msg_new".let { id -> headers(id, ts, "v1,${signer.sign(id, ts, body)}") } },
                "timestamp not a number" to headers(ts = null) + ("svix-timestamp" to "soon"),
            )
            refused.forEach { (what, h) ->
                val res = api.clerk(body, h)
                assertEquals(HttpStatusCode.BadRequest, res.status, what)
                assertEquals("INVALID_SIGNATURE", res.obj()["error"]!!.o.s("code"), what)
            }
            assertEquals(0, userCount(clerkId), "no refused event reached the handler")

            // Several signatures (secret rotation): one valid is enough. Four minutes old is within tolerance.
            val ts = now - 240
            val id = "msg_${unique("ok")}"
            val many = "v1,bm90LWl0 v1,${otherSigner.sign(id, ts, body)} v1,${signer.sign(id, ts, body)}"
            val ok = api.clerk(body, headers(id, ts, many))
            assertStatus(HttpStatusCode.OK, ok)
            assertEquals("false", ok.obj()["duplicate"].toString())
            assertEquals(1, userCount(clerkId))
            // The same message again (a replay, or Svix retrying) is acknowledged without applying it twice.
            assertEquals("true", api.clerk(body, headers(id, ts, many)).obj()["duplicate"].toString())
            // The signature binds the message id: a captured body and signature can't be replayed under a new id.
            assertError(HttpStatusCode.BadRequest, "INVALID_SIGNATURE", api.clerk(body, headers("msg_new_id", ts, many)))
        }
    }

    @Test
    fun `a missing or malformed Clerk secret turns the endpoint off instead of accepting anything`() {
        listOf(null, "whsec_not base64!").forEach { secret ->
            withApp(clerkEnv(secret)) { api ->
                assertError(
                    HttpStatusCode.ServiceUnavailable, "WEBHOOKS_NOT_CONFIGURED",
                    api.clerk("{}", mapOf("svix-id" to "msg_1", "svix-timestamp" to "1", "svix-signature" to "v1,AAAA")),
                )
            }
        }
    }

    private fun stripeEnv(): TestEnv {
        val clock = MutableClock(ie.bookanything.support.DEFAULT_NOW)
        val payments = StripePaymentProvider(FakeStripeGateway(), StripeTest.config, clock)
        return TestEnv(clock, TestConfig.config(stripe = StripeTest.config), payments = payments)
    }

    private suspend fun ie.bookanything.support.Api.stripe(body: String, signature: String?): HttpResponse =
        client.post("/v1/webhooks/stripe") {
            if (signature != null) header("Stripe-Signature", signature)
            contentType(ContentType.Application.Json); setBody(body)
        }

    @Test
    fun `Stripe events need a valid, recent signature over the exact body`() {
        val env = stripeEnv()
        withApp(env) { api ->
            val id = "evt_${unique("sec")}"
            val payload = StripeTest.event("customer.created", mapOf("id" to "cus_x", "object" to "customer"), id = id)
            val ts = env.clock.instant().epochSecond
            val valid = StripeTest.signature(payload, StripeTest.WEBHOOK_SECRET, ts)
            val hex = valid.substringAfter("v1=")
            listOf(
                null, "", "garbage", "t=$ts", "v1=$hex", "t=$ts,v0=$hex", "t=${ts + 1},v1=$hex", "t=abc,v1=$hex",
                StripeTest.signature(payload, StripeTest.WEBHOOK_SECRET, ts - 301), // beyond the SDK's 5 minute tolerance
                StripeTest.signature(payload, "whsec_someone_else", ts), StripeTest.signature("$payload ", StripeTest.WEBHOOK_SECRET, ts),
            ).forEach { sig ->
                val res = api.stripe(payload, sig)
                assertEquals(HttpStatusCode.BadRequest, res.status, sig)
                assertEquals("INVALID_SIGNATURE", res.obj()["error"]!!.o.s("code"), "signature header '$sig'")
            }
            assertEquals(0, Fixtures.sqlAll("SELECT id FROM provider_events WHERE id = ?", id).size, "nothing refused was stored")

            // Rotation: several v1 signatures, one made with the current secret.
            val rotated = "t=$ts,v1=${"0".repeat(64)},v1=$hex"
            val first = api.stripe(payload, rotated)
            assertStatus(HttpStatusCode.OK, first)
            assertEquals("false", first.obj()["duplicate"].toString())
            // The same event id again, even re-signed with a different body, is a duplicate and changes nothing.
            val forged = StripeTest.event("checkout.session.completed", mapOf("id" to "cs_x", "object" to "checkout.session"), id = id)
            val again = api.stripe(forged, StripeTest.signature(forged, StripeTest.WEBHOOK_SECRET, ts))
            assertEquals("true", again.obj()["duplicate"].toString())
            assertEquals(
                "customer.created",
                Fixtures.sqlOne("SELECT type FROM provider_events WHERE id = ?", id) { it.getString(1) },
            )
            // Oversized bodies are refused before they are read in full.
            val huge = "x".repeat(1_000_001)
            val hugeSignature = StripeTest.signature(huge, StripeTest.WEBHOOK_SECRET, ts)
            assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", api.stripe(huge, hugeSignature))
        }
    }
}
