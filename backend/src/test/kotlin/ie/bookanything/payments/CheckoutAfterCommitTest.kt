package ie.bookanything.payments

import ie.bookanything.audit.Actor
import ie.bookanything.availability.AvailabilityMode
import ie.bookanything.booking.BookingSource
import ie.bookanything.booking.BookingSupport
import ie.bookanything.booking.CreateCommand
import ie.bookanything.booking.CustomerSpec
import ie.bookanything.booking.PaymentChoice
import ie.bookanything.business.BusinessRepository
import ie.bookanything.support.Clinic
import ie.bookanything.support.Fixtures
import ie.bookanything.support.Money
import ie.bookanything.support.StripeWorld
import ie.bookanything.support.assertError
import ie.bookanything.support.assertStatus
import ie.bookanything.support.o
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.unique
import ie.bookanything.support.withApp
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.withTimeout
import java.time.Duration
import java.time.Instant
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * A booking held for online payment commits before its Stripe Checkout is created (docs/architecture.md section 7), so
 * a slow Stripe holds no database locks: other bookings go ahead, the committed hold protects the slot, a replay waits
 * for the same link, and a Stripe failure releases the hold. Wednesday 7 October 2026, Dublin.
 */
class CheckoutAfterCommitTest {
    private fun at(time: String) = "2026-10-07T$time:00+01:00"

    private fun paidBody(clinic: Clinic, time: String, email: String = "${unique("payer")}@example.test") =
        Fixtures.bookingBody(clinic, "Paid consult", at(time), email = email, resourceId = clinic.resource("Alex"))

    private fun bookingByEmail(email: String): Triple<String, String, String?> = Fixtures.sqlOne(
        "SELECT b.id, b.status::text AS status, b.idempotency_key FROM bookings b JOIN customers c ON c.id = b.customer_id " +
            "WHERE c.email = ? ORDER BY b.created_at DESC LIMIT 1",
        email,
    ) { Triple(it.getObject("id").toString(), it.getString("status"), it.getString("idempotency_key")) }!!

    @Test
    fun `while Stripe is slow, another resource books freely and the held slot is already taken`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            s.connect(clinic)
            val gate = CountDownLatch(1)
            s.gateway.gate = gate
            val email = "${unique("slow.stripe")}@example.test"
            try {
                coroutineScope {
                    val first = async(Dispatchers.IO) { api.post("${clinic.public}/bookings", paidBody(clinic, "10:00", email)) }
                    assertTrue(s.gateway.entered.tryAcquire(30, TimeUnit.SECONDS), "the first request is inside the Stripe call")

                    // Committed before Stripe was called: held, with a pending charge that has no checkout yet and no email.
                    val (bookingId, status, _) = bookingByEmail(email)
                    assertEquals("held", status)
                    assertEquals(listOf("charge pending 5000"), Money.ledger(bookingId))
                    assertNull(s.charge(bookingId).second, "no Stripe session stored yet")

                    // Blake is in the same therapist pool, whose resource rows the booking locks: before, this request
                    // waited for the first one's Stripe call to finish.
                    val other = withTimeout(LOCK_FREE_MS) {
                        api.post("${clinic.public}/bookings", Fixtures.bookingBody(clinic, "Buffered", at("14:00")))
                    }
                    assertStatus(HttpStatusCode.Created, other)
                    // The same slot is already held, so it is refused straight away rather than waiting.
                    val same = withTimeout(LOCK_FREE_MS) { api.post("${clinic.public}/bookings", paidBody(clinic, "10:00")) }
                    assertError(HttpStatusCode.Conflict, "SLOT_UNAVAILABLE", same)

                    gate.countDown()
                    val created = first.await()
                    assertStatus(HttpStatusCode.Created, created)
                    val body = created.obj()
                    assertEquals("payment_required", body["next"]!!.o.s("type"))
                    val url = body["next"]!!.o.s("checkoutUrl")
                    assertTrue(url.startsWith("https://checkout.stripe.test/"), url)
                    assertEquals(url.substringAfterLast('/'), s.charge(bookingId).second, "the session is stored on the charge")
                    assertEquals(1, s.gateway.sessions.size)
                }
            } finally {
                gate.countDown()
            }
        }
    }

    @Test
    fun `a replay sent while the first request waits on Stripe gets the same checkout link`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            s.connect(clinic)
            val gate = CountDownLatch(1)
            s.gateway.gate = gate
            val key = mapOf("Idempotency-Key" to unique("same-request"))
            val body = paidBody(clinic, "11:00")
            try {
                coroutineScope {
                    val first = async(Dispatchers.IO) { api.post("${clinic.public}/bookings", body, headers = key) }
                    assertTrue(s.gateway.entered.tryAcquire(30, TimeUnit.SECONDS))
                    val second = async(Dispatchers.IO) { api.post("${clinic.public}/bookings", body, headers = key) }
                    delay(WAITING_MS)
                    assertFalse(second.isCompleted, "the replay waits for the first request's checkout")
                    gate.countDown()
                    val a = first.await()
                    val b = second.await()
                    assertStatus(HttpStatusCode.Created, a)
                    assertStatus(HttpStatusCode.OK, b)
                    val (ra, rb) = a.obj() to b.obj()
                    assertEquals(ra["booking"]!!.o.s("id"), rb["booking"]!!.o.s("id"))
                    assertEquals(ra["next"]!!.o.s("checkoutUrl"), rb["next"]!!.o.s("checkoutUrl"))
                    assertEquals(1, s.gateway.sessions.size, "one Stripe session")
                }
                // Later replays read the stored link.
                val later = api.post("${clinic.public}/bookings", body, headers = key)
                assertStatus(HttpStatusCode.OK, later)
                assertEquals(s.gateway.sessions.size, 1)
            } finally {
                gate.countDown()
            }
        }
    }

    @Test
    fun `when Stripe fails the request fails as before, the hold is released and a retry with the same key books again`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            s.connect(clinic)
            val email = "${unique("stripe.down")}@example.test"
            val key = mapOf("Idempotency-Key" to unique("retried"))
            val body = paidBody(clinic, "12:00", email)
            s.gateway.failCheckouts.set(1)

            assertError(HttpStatusCode.BadGateway, "PAYMENT_PROVIDER_ERROR", api.post("${clinic.public}/bookings", body, headers = key))
            val (failedId, status, storedKey) = bookingByEmail(email)
            assertEquals("expired", status, "released as an abandoned checkout is")
            assertNull(storedKey, "the Idempotency-Key is free again")
            assertEquals(listOf("charge cancelled 5000"), Money.ledger(failedId))
            val active = Fixtures.sqlOne("SELECT count(*) FROM booking_allocations WHERE booking_id = ?::uuid AND active", failedId) {
                it.getInt(1)
            }
            assertEquals(0, active, "its slot is free again")
            assertEquals(
                "checkout_failed",
                Fixtures.sqlOne(
                    "SELECT summary->>'reason' FROM audit_events WHERE entity_id = ?::uuid AND action = 'booking.expired'", failedId,
                ) { it.getString(1) },
            )

            val retried = api.post("${clinic.public}/bookings", body, headers = key)
            assertStatus(HttpStatusCode.Created, retried)
            val r = retried.obj()
            assertNotEquals(failedId, r["booking"]!!.o.s("id"))
            assertEquals("held", r["booking"]!!.o.s("status"))
            assertTrue(r["next"]!!.o.s("checkoutUrl").startsWith("https://checkout.stripe.test/"))
        }
    }

    @Test
    fun `a hold whose checkout was never created (the process stopped after the commit) expires as any unpaid hold`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            s.connect(clinic)
            val engine = s.env.ctx.booking.engine
            engine.checkoutWait = Duration.ofMillis(WAITING_MS)
            val businessId = UUID.fromString(clinic.id)
            val email = "${unique("crashed")}@example.test"
            val key = unique("crashed")
            val business = s.env.db.txBlocking { BusinessRepository.findById(it, businessId)!! }
            val cmd = CreateCommand(
                serviceId = UUID.fromString(clinic.service("Paid consult")), optionId = null, addonIds = emptyList(), groupId = null,
                selectedResourceId = UUID.fromString(clinic.resource("Alex")), forcedResourceIds = null,
                start = Instant.parse("2026-10-07T12:00:00Z"), customer = CustomerSpec(name = "Jordan Casey", email = email),
                answers = emptyMap(), customerNotes = null, internalNotes = null,
                source = BookingSource.PUBLIC, mode = AvailabilityMode.PUBLIC, payment = PaymentChoice.AUTO, notifyCustomer = true,
                idempotencyKey = key, actor = Actor.GUEST, user = null, returnUrl = null,
            )
            // The booking and its charge commit; the request then stops before calling Stripe.
            s.env.db.txBlocking(businessId) { conn -> engine.create(conn, business, cmd, s.clock.instant()) }
            val body = Fixtures.bookingBody(clinic, "Paid consult", at("13:00"), email = email, resourceId = clinic.resource("Alex"))
            val headers = mapOf("Idempotency-Key" to key)

            assertError(HttpStatusCode.Conflict, "CONFLICT", api.post("${clinic.public}/bookings", body, headers = headers))
            assertTrue(s.gateway.sessions.isEmpty(), "a replay never calls Stripe itself")

            s.clock.advanceMinutes(32)
            s.env.db.txBlocking { BookingSupport.expireStaleHolds(it, s.clock.instant(), businessId) }
            val replay = api.post("${clinic.public}/bookings", body, headers = headers)
            assertStatus(HttpStatusCode.OK, replay)
            assertEquals("expired", replay.obj()["next"]!!.o.s("type"))
        }
    }
}

/** Far below the gate's 30 s: a request that waited for the first one's locks would not answer within it. */
private const val LOCK_FREE_MS = 10_000L

/** Long enough for a replay that did not wait to have answered. */
private const val WAITING_MS = 750L
