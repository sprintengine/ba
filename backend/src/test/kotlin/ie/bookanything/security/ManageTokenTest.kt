package ie.bookanything.security

import ie.bookanything.auth.TokenService
import ie.bookanything.support.Api
import ie.bookanything.support.Clinic
import ie.bookanything.support.Fixtures
import ie.bookanything.support.SecurityFixtures
import ie.bookanything.support.SecurityFixtures.dublin
import ie.bookanything.support.TestConfig
import ie.bookanything.support.TestEnv
import ie.bookanything.support.assertError
import ie.bookanything.support.assertStatus
import ie.bookanything.support.b
import ie.bookanything.support.createBusiness
import ie.bookanything.support.jsonOf
import ie.bookanything.support.o
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.testBusiness
import ie.bookanything.support.unique
import ie.bookanything.support.withApp
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

/**
 * The emailed manage link (`/v1/public/manage/{token}`) is the only credential a guest has: it must be unguessable, reach
 * exactly one booking, reveal nothing about tokens that don't exist, and be rate limited where it changes things.
 */
class ManageTokenTest {
    private val setup get() = testBusiness("Manage Shop") {
        val ana = person("Ana")
        service("Massage", 60) { needs("Therapist", ana) }
        service("Paid massage", 60) { price(5000); needs("Therapist", ana) }
    }

    private suspend fun Api.manage(token: String, action: String? = null, body: String? = null): HttpResponse = when (action) {
        null -> get("/v1/public/manage/$token")
        "availability" -> get("/v1/public/manage/$token/availability?from=2026-10-08&to=2026-10-08")
        else -> post("/v1/public/manage/$token/$action", body ?: "{}")
    }

    private fun status(bookingId: String) = Fixtures.sqlOne("SELECT status::text FROM bookings WHERE id = ?", bookingId) { it.getString(1) }

    @Test
    fun `manage tokens are long, random, secret-derived and stored only as a hash`() {
        val env = TestEnv()
        withApp(env) { api ->
            val shop = api.createBusiness(setup)
            val first = SecurityFixtures.book(api, shop, "Massage", dublin(env.clock, 2, "10:00"))
            val second = SecurityFixtures.book(api, shop, "Massage", dublin(env.clock, 2, "11:00"))
            val tokens = listOf(first, second).map { it.s("manageToken") }
            tokens.forEach { assertTrue(Regex("^[A-Za-z0-9_-]{43}$").matches(it), "256 bits, base64url: $it") }
            assertNotEquals(tokens[0], tokens[1])
            val id = first["booking"]!!.s("id")
            val stored = Fixtures.sqlOne("SELECT manage_token_hash FROM bookings WHERE id = ?", id) { it.getString(1) }
            assertEquals(TokenService.hash(tokens[0]), stored, "only the SHA-256 of the token is stored")
            assertEquals(0, Fixtures.sqlAll("SELECT id::text FROM bookings WHERE manage_token_hash = ?", tokens[0]).size)
            // The token is derived from the booking id with the server's secret: knowing the id is not enough.
            val guessed = TokenService("someone-elses-secret-value").manageToken(UUID.fromString(id))
            assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.manage(guessed))
            assertStatus(HttpStatusCode.OK, api.manage(tokens[0]))
        }
    }

    @Test
    fun `wrong, short, tampered and malformed tokens are all the same 404`() {
        val env = TestEnv()
        withApp(env) { api ->
            val shop = api.createBusiness(setup)
            val token = SecurityFixtures.book(api, shop, "Massage", dublin(env.clock, 2, "10:00")).s("manageToken")
            val flipped = token.dropLast(1) + (if (token.last() == 'A') 'B' else 'A')
            val unknown = TokenService.randomToken()
            val variants = listOf(
                unknown, flipped, token.drop(1), token + "A", token.uppercase(), token.take(19), "a", token.dropLast(1) + "+",
                token.reversed(),
                "${token.take(20)}%20${token.drop(20)}", "%2e%2e", "..", "$token%00", "x".repeat(101), "' OR '1'='1",
            )
            for (action in listOf(null, "availability", "cancel", "reschedule", "pay")) {
                val reference = api.manage(unknown, action, jsonOf("start" to dublin(env.clock, 3, "10:00"))).bodyAsText()
                for (variant in variants) {
                    val res = api.manage(variant, action, jsonOf("start" to dublin(env.clock, 3, "10:00")))
                    assertError(HttpStatusCode.NotFound, "NOT_FOUND", res)
                    assertEquals(reference, res.bodyAsText(), "'$variant' on ${action ?: "view"} must look like any unknown token")
                }
            }
            assertStatus(HttpStatusCode.OK, api.manage(token))
            assertEquals("confirmed", api.manage(token).obj().s("status"), "nothing above changed the booking")
        }
    }

    @Test
    fun `a token reaches its own booking only, never the customer's other bookings`() {
        val env = TestEnv()
        withApp(env) { api ->
            val shop = api.createBusiness(setup)
            val other = api.createBusiness(setup)
            val email = "${unique("same")}@example.test"
            val a = SecurityFixtures.book(api, shop, "Massage", dublin(env.clock, 2, "10:00"), email)
            val b = SecurityFixtures.book(api, shop, "Massage", dublin(env.clock, 2, "12:00"), email)
            val c = SecurityFixtures.book(api, other, "Massage", dublin(env.clock, 2, "10:00"), email)
            val (idA, idB, idC) = listOf(a, b, c).map { it["booking"]!!.s("id") }

            assertEquals(idA, api.manage(a.s("manageToken")).obj().s("id"))
            assertEquals(shop.slug, api.manage(a.s("manageToken")).obj()["business"]!!.o.s("slug"))
            assertStatus(HttpStatusCode.OK, api.manage(a.s("manageToken"), "cancel"))
            assertEquals(listOf("cancelled", "confirmed", "confirmed"), listOf(idA, idB, idC).map(::status))

            val moved = api.manage(b.s("manageToken"), "reschedule", jsonOf("start" to dublin(env.clock, 3, "14:00")))
            assertStatus(HttpStatusCode.OK, moved)
            assertEquals(idB, moved.obj().s("id"))
            assertEquals(
                listOf(dublin(env.clock, 2, "10:00"), dublin(env.clock, 2, "10:00")),
                listOf(idA, idC).map { id ->
                    Fixtures.sqlOne("SELECT start_at FROM bookings WHERE id = ?", id) { it.getTimestamp(1).toInstant() }!!
                        .atZone(java.time.ZoneId.of("Europe/Dublin")).format(java.time.format.DateTimeFormatter.ISO_OFFSET_DATE_TIME)
                },
                "the other bookings did not move",
            )
            // The managed view is the customer's: no staff notes, no answers, no other bookings.
            val view = api.manage(b.s("manageToken")).obj()
            listOf("internalNotes", "answers", "bookings", "customerNotes").forEach { assertTrue(it !in view, "$it in $view") }
        }
    }

    @Test
    fun `the token survives a reschedule, and cancelled, expired or erased bookings follow the policy`() {
        val env = TestEnv()
        withApp(env) { api ->
            val shop = api.createBusiness(setup)
            val booking = SecurityFixtures.book(api, shop, "Massage", dublin(env.clock, 2, "10:00"))
            val token = booking.s("manageToken")
            assertStatus(HttpStatusCode.OK, api.manage(token, "reschedule", jsonOf("start" to dublin(env.clock, 3, "11:00"))))
            assertStatus(HttpStatusCode.OK, api.manage(token, "reschedule", jsonOf("start" to dublin(env.clock, 4, "11:00"))))
            val view = api.manage(token).obj()
            assertEquals(dublin(env.clock, 4, "11:00"), view.s("start"), "the same link follows the booking")

            // Cancelled: still readable, never changeable again.
            assertStatus(HttpStatusCode.OK, api.manage(token, "cancel"))
            val cancelled = api.manage(token).obj()
            assertEquals("cancelled", cancelled.s("status"))
            assertEquals(false, cancelled.b("canCancel"))
            assertEquals(false, cancelled.b("canReschedule"))
            assertError(HttpStatusCode.Conflict, "POLICY_VIOLATION", api.manage(token, "cancel"))
            assertError(
                HttpStatusCode.Conflict, "POLICY_VIOLATION",
                api.manage(token, "reschedule", jsonOf("start" to dublin(env.clock, 5, "11:00"))),
            )
            assertError(HttpStatusCode.Conflict, "POLICY_VIOLATION", api.manage(token, "pay"))
            assertEquals("cancelled", status(booking["booking"]!!.s("id")))

            // A held (unpaid) booking can be paid until its hold expires, then no more.
            val held = SecurityFixtures.book(api, shop, "Paid massage", dublin(env.clock, 2, "15:00"))
            assertEquals("payment_required", held["next"]!!.s("type"))
            assertStatus(HttpStatusCode.OK, api.manage(held.s("manageToken"), "pay"))
            env.clock.advanceMinutes(16)
            assertError(HttpStatusCode.Conflict, "POLICY_VIOLATION", api.manage(held.s("manageToken"), "pay"))
            assertStatus(HttpStatusCode.OK, api.manage(held.s("manageToken")))

            // Erasing the customer (GDPR) kills every manage link they had.
            val customerId = Fixtures.sqlOne("SELECT customer_id::text FROM bookings WHERE id = ?", booking["booking"]!!.s("id")) {
                it.getString(1)
            }
            assertStatus(HttpStatusCode.NoContent, api.delete("${shop.base}/customers/$customerId", shop.owner.token))
            assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.manage(token))
        }
    }

    @Test
    fun `manage actions are rate limited per address, and the window resets`() {
        val clock = SecurityFixtures.isolatedClock(61)
        val env = TestEnv(clock = clock, config = TestConfig.config(rateLimits = true))
        withApp(env) { api ->
            val shop: Clinic = api.createBusiness(setup)
            val token = SecurityFixtures.book(api, shop, "Massage", dublin(clock, 2, "10:00")).s("manageToken")
            // Guessing tokens spends the same budget as real actions.
            repeat(30) { assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.manage(TokenService.randomToken(), "cancel")) }
            assertError(HttpStatusCode.TooManyRequests, "RATE_LIMITED", api.manage(token, "cancel"))
            assertError(HttpStatusCode.TooManyRequests, "RATE_LIMITED", api.manage(token, "reschedule", jsonOf("start" to "x")))
            assertError(HttpStatusCode.TooManyRequests, "RATE_LIMITED", api.manage(token, "pay"))
            assertEquals("confirmed", api.manage(token).obj().s("status"))
            // Current behaviour: viewing is not limited (a 256-bit token can't be guessed); availability has its own limit.
            assertStatus(HttpStatusCode.OK, api.manage(token))
            clock.advanceMinutes(10)
            assertStatus(HttpStatusCode.OK, api.manage(token, "cancel"))
        }
    }
}
