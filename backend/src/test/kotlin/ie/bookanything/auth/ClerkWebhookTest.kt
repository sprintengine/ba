package ie.bookanything.auth

import ie.bookanything.config.ClerkConfig
import ie.bookanything.support.Fixtures
import ie.bookanything.support.MutableClock
import ie.bookanything.support.TestConfig
import ie.bookanything.support.TestEnv
import ie.bookanything.support.TestUser
import ie.bookanything.support.assertError
import ie.bookanything.support.assertStatus
import ie.bookanything.support.jsonOf
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.unique
import ie.bookanything.support.withApp
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import java.time.Instant
import java.util.Base64
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ClerkWebhookTest {
    private val secret = "whsec_" + Base64.getEncoder().encodeToString("clerk-test-signing-key-32-bytes!".toByteArray())
    private val now = Instant.parse("2026-10-05T08:00:00Z")

    @Test
    fun `svix signatures are verified with a 5 minute tolerance`() {
        val clock = MutableClock(now)
        val v = SvixVerifier(secret, clock)
        val body = """{"type":"user.updated","data":{"id":"user_1"}}"""
        val ts = now.epochSecond
        val sig = v.sign("msg_1", ts, body)
        assertTrue(v.verify("msg_1", ts.toString(), "v1,$sig", body))
        // Several signatures (key rotation): any match is enough.
        assertTrue(v.verify("msg_1", ts.toString(), "v1,bm90LWl0 v1,$sig", body))
        assertFalse(v.verify("msg_1", ts.toString(), "v1,$sig", body.replace("user_1", "user_2")), "tampered body")
        assertFalse(v.verify("msg_2", ts.toString(), "v1,$sig", body), "different message id")
        assertFalse(v.verify("msg_1", (ts + 1).toString(), "v1,$sig", body), "different timestamp")
        assertFalse(v.verify("msg_1", ts.toString(), "v2,$sig", body), "unknown version")
        assertFalse(v.verify("msg_1", ts.toString(), null, body))
        assertFalse(v.verify("msg_1", "abc", "v1,$sig", body))
        // Expired / from the future.
        val old = ts - 301
        assertFalse(v.verify("msg_1", old.toString(), "v1,${v.sign("msg_1", old, body)}", body))
        val future = ts + 301
        assertFalse(v.verify("msg_1", future.toString(), "v1,${v.sign("msg_1", future, body)}", body))
        val recent = ts - 299
        assertTrue(v.verify("msg_1", recent.toString(), "v1,${v.sign("msg_1", recent, body)}", body))
        // Another secret never verifies.
        val other = SvixVerifier("whsec_" + Base64.getEncoder().encodeToString("another-key-another-key-another!".toByteArray()), clock)
        assertFalse(other.verify("msg_1", ts.toString(), "v1,$sig", body))
    }

    private fun env() = TestEnv(config = TestConfig.config(clerk = ClerkConfig(null, null, emptySet(), secret)))

    @Test
    fun `user events keep users in sync and deletion anonymises safely`() {
        val env = env()
        val verifier = SvixVerifier(secret, env.clock)
        withApp(env) { api ->
            suspend fun send(
                type: String, data: Map<String, Any?>, id: String = "msg_${UUID.randomUUID()}", sigOverride: String? = null,
            ): io.ktor.client.statement.HttpResponse {
                val body = jsonOf("type" to type, "object" to "event", "data" to data)
                val ts = env.clock.instant().epochSecond
                return api.client.post("/v1/webhooks/clerk") {
                    header("svix-id", id); header("svix-timestamp", ts.toString())
                    header("svix-signature", sigOverride ?: "v1,${verifier.sign(id, ts, body)}")
                    contentType(ContentType.Application.Json); setBody(body)
                }
            }
            val clerkId = "user_${unique("clerk")}"
            val email = "${unique("clerk")}@example.test"
            val shop = Fixtures.clinic(api)
            Fixtures.book(api, shop, "Consult", "2026-10-07T09:00:00+01:00", email = email)
            val created = send(
                "user.created",
                mapOf(
                    "id" to clerkId, "first_name" to "Robin", "last_name" to "Keane", "primary_email_address_id" to "idn_1",
                    "email_addresses" to listOf(
                        mapOf("id" to "idn_1", "email_address" to email.uppercase(), "verification" to mapOf("status" to "verified")),
                    ),
                ),
            )
            assertStatus(HttpStatusCode.OK, created)
            val row = Fixtures.sqlOne(
                "SELECT email::text, name, email_verified FROM users WHERE clerk_user_id = ?", clerkId,
            ) { Triple(it.getString(1), it.getString(2), it.getBoolean(3)) }!!
            assertEquals(Triple(email, "Robin Keane", true), row)
            // The user row was written, so their guest booking is theirs before their first request.
            val linked = Fixtures.sqlOne(
                "SELECT u.clerk_user_id FROM customers c JOIN users u ON u.id = c.user_id WHERE c.business_id = ? AND c.email = ?",
                UUID.fromString(shop.id), email,
            ) { it.getString(1) }
            assertEquals(clerkId, linked)
            assertError(
                HttpStatusCode.BadRequest, "INVALID_SIGNATURE", send("user.updated", mapOf("id" to clerkId), sigOverride = "v1,AAAA"),
            )

            // Deleting an owner who is the last owner suspends the business; another owner keeps it active.
            val owner = TestUser.create("clerkowner")
            val ownerSub = "dev_" + owner.email.substringBefore('@')
            val clinic = Fixtures.clinic(api, owner)
            api.get("/v1/me", owner.token)
            val booking = Fixtures.book(api, clinic, "Consult", "2026-10-07T10:00:00+01:00", token = owner.token, email = owner.email)
            assertStatus(HttpStatusCode.OK, send("user.deleted", mapOf("id" to ownerSub, "deleted" to true), id = "msg_del_$ownerSub"))
            val user = Fixtures.sqlOne(
                "SELECT email, name, deleted_at FROM users WHERE clerk_user_id = ?", ownerSub,
            ) { Triple(it.getString(1), it.getString(2), it.getObject(3)) }!!
            assertNull(user.first); assertNull(user.second); assertTrue(user.third != null)
            assertEquals(
                "suspended",
                Fixtures.sqlOne("SELECT status::text FROM businesses WHERE id = ?", UUID.fromString(clinic.id)) { it.getString(1) },
            )
            assertEquals(
                "removed",
                Fixtures.sqlOne(
                    "SELECT status::text FROM business_members WHERE business_id = ? LIMIT 1",
                    UUID.fromString(clinic.id),
                ) { it.getString(1) },
            )
            assertNull(
                Fixtures.sqlOne(
                    "SELECT user_id FROM customers WHERE email = ? AND business_id = ?", owner.email,
                    UUID.fromString(clinic.id),
                ) { it.getObject(1) },
            )
            // The business's own booking record stays.
            assertEquals(
                "confirmed",
                Fixtures.sqlOne(
                    "SELECT status::text FROM bookings WHERE id = ?",
                    UUID.fromString(booking["booking"]!!.s("id")),
                ) { it.getString(1) },
            )
            // Replays are acknowledged without effect.
            val dup = send("user.deleted", mapOf("id" to ownerSub, "deleted" to true), id = "msg_del_$ownerSub").obj()
            assertEquals("true", dup["duplicate"].toString())
        }
    }

    @Test
    fun `clerk webhook is off without a secret`() = withApp(TestEnv()) { api ->
        assertError(HttpStatusCode.ServiceUnavailable, "WEBHOOKS_NOT_CONFIGURED", api.post("/v1/webhooks/clerk", "{}"))
    }
}
