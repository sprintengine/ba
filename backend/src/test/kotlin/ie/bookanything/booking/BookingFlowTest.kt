package ie.bookanything.booking

import ie.bookanything.jobs.JobWorker
import ie.bookanything.support.Fixtures
import ie.bookanything.support.Fixtures.book
import ie.bookanything.support.Fixtures.slots
import ie.bookanything.support.TestEnv
import ie.bookanything.support.TestUser
import ie.bookanything.support.assertError
import ie.bookanything.support.assertStatus
import ie.bookanything.support.b
import ie.bookanything.support.i
import ie.bookanything.support.jsonOf
import ie.bookanything.support.o
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.sOrNull
import ie.bookanything.support.unique
import ie.bookanything.support.withApp
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.json.jsonArray
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class BookingFlowTest {
    private val wed = "2026-10-07"

    @Test
    fun `free public booking is confirmed and notifications go out through the outbox`() {
        val env = TestEnv()
        withApp(env) { api ->
            val clinic = Fixtures.clinic(api)
            assertTrue("$wed" + "T10:00:00+01:00" in slots(api, clinic, "Consult", wed))
            val result = book(api, clinic, "Consult", "${wed}T10:00:00+01:00", email = "first.guest@example.test")
            assertEquals("confirmed", result["booking"]!!.s("status"))
            assertEquals("not_required", result["booking"]!!.s("paymentStatus"))
            assertEquals("confirmed", result["next"]!!.s("type"))
            assertNull(result["next"]!!.sOrNull("checkoutUrl"))
            assertTrue(result["booking"]!!.s("reference").matches(Regex("^BA-[0-9A-HJKMNP-TV-Z]{6}$")))
            assertEquals(2, result["booking"]!!.o["resources"]!!.jsonArray.size)
            assertTrue("${wed}T10:00:00+01:00" !in slots(api, clinic, "Consult", wed))

            JobWorker(env.ctx).drain()
            val sent = env.email.sent.filter { it.to == "first.guest@example.test" }
            assertEquals(listOf("booking_confirmed"), sent.map { it.template })
            assertTrue(sent[0].text.contains("/manage/${result.s("manageToken")}"))
            assertTrue(!sent[0].text.contains("Sore shoulder"), "sensitive answers must never be emailed")
            assertTrue(env.email.sent.any { it.template == "new_booking_for_business" && it.to == clinic.owner.email })
        }
    }

    @Test
    fun `idempotency key replays the original result`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val key = unique("idem-key")
        val body = Fixtures.bookingBody(clinic, "Consult", "${wed}T11:00:00+01:00", email = "idem@example.test")
        val first = api.post("${clinic.public}/bookings", body, headers = mapOf("Idempotency-Key" to key))
        assertStatus(HttpStatusCode.Created, first)
        val replay = api.post("${clinic.public}/bookings", body, headers = mapOf("Idempotency-Key" to key))
        assertStatus(HttpStatusCode.OK, replay)
        val a = first.obj(); val b = replay.obj()
        assertEquals(a["booking"]!!.s("id"), b["booking"]!!.s("id"))
        assertEquals(a.s("manageToken"), b.s("manageToken"))
        val different = Fixtures.bookingBody(clinic, "Consult", "${wed}T15:00:00+01:00")
        assertError(
            HttpStatusCode.Conflict, "CONFLICT",
            api.post("${clinic.public}/bookings", different, headers = mapOf("Idempotency-Key" to key)),
        )
        assertError(
            HttpStatusCode.BadRequest, "INVALID_REQUEST",
            api.post("${clinic.public}/bookings", body, headers = mapOf("Idempotency-Key" to "bad key!")),
        )
        assertEquals("confirmed", b["next"]!!.s("type"))

        // Once the booking is cancelled, a replay says so instead of "confirmed".
        assertStatus(HttpStatusCode.OK, api.post("/v1/public/manage/${a.s("manageToken")}/cancel"))
        val afterCancel = api.post("${clinic.public}/bookings", body, headers = mapOf("Idempotency-Key" to key))
        assertStatus(HttpStatusCode.OK, afterCancel)
        assertEquals("cancelled", afterCancel.obj()["next"]!!.s("type"))
    }

    @Test
    fun `concurrent bookings of the same slot - exactly one wins`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val start = "${wed}T12:00:00+01:00"
        val statuses = coroutineScope {
            (1..8).map { n ->
                async(Dispatchers.IO) {
                    api.post(
                        "${clinic.public}/bookings", Fixtures.bookingBody(clinic, "Consult", start, email = "racer$n@example.test"),
                    ).let { it.status to it.bodyAsText() }
                }
            }.awaitAll()
        }
        assertEquals(1, statuses.count { it.first == HttpStatusCode.Created }, statuses.toString())
        assertEquals(
            7, statuses.count { it.first == HttpStatusCode.Conflict && it.second.contains("SLOT_UNAVAILABLE") }, statuses.toString(),
        )
        val active = Fixtures.sqlOne(
            "SELECT count(*) FROM bookings WHERE business_id = ? AND status = 'confirmed'", java.util.UUID.fromString(clinic.id),
        ) { it.getInt(1) }
        assertEquals(1, active)
    }

    @Test
    fun `holds block the slot until they expire, and a late payment is refunded automatically`() {
        val env = TestEnv()
        withApp(env) { api ->
            val clinic = Fixtures.clinic(api)
            val alex = clinic.resource("Alex")
            val start = "${wed}T12:00:00+01:00"
            val held = book(api, clinic, "Paid consult", start, resourceId = alex)
            assertEquals("held", held["booking"]!!.s("status"))
            assertEquals("pending", held["booking"]!!.s("paymentStatus"))
            assertEquals("payment_required", held["next"]!!.s("type"))
            val checkoutUrl = held["next"]!!.s("checkoutUrl")
            assertTrue(checkoutUrl.startsWith("http://localhost:3000/dev/checkout/"))
            assertNotNull(held["booking"]!!.sOrNull("holdExpiresAt"))
            assertTrue(start !in slots(api, clinic, "Paid consult", wed, "&resourceId=$alex"))

            // pay endpoint returns the pending checkout while the hold is valid
            val pay = api.post("/v1/public/manage/${held.s("manageToken")}/pay")
            assertStatus(HttpStatusCode.OK, pay)
            assertEquals(checkoutUrl, pay.obj().s("checkoutUrl"))

            env.clock.advanceMinutes(16)
            assertTrue(start in slots(api, clinic, "Paid consult", wed, "&resourceId=$alex"))
            val second = book(api, clinic, "Paid consult", start, resourceId = alex)
            assertEquals("held", second["booking"]!!.s("status"))
            val first = api.get("/v1/public/manage/${held.s("manageToken")}").obj()
            assertEquals("expired", first.s("status"))
            assertError(HttpStatusCode.Conflict, "POLICY_VIOLATION", api.post("/v1/public/manage/${held.s("manageToken")}/pay"))

            // The first customer pays after their hold expired: the slot is taken, so they are refunded in full.
            val paymentId = checkoutUrl.substringAfterLast('/')
            val done = api.post("/v1/public/dev-payments/$paymentId/complete", jsonOf("outcome" to "succeeded"))
            assertStatus(HttpStatusCode.OK, done)
            val after = api.get("/v1/public/manage/${held.s("manageToken")}").obj()
            assertEquals("cancelled", after.s("status"))
            assertEquals("refunded", after.s("paymentStatus"))
            assertEquals(5000, after.i("amountRefundedCents"))

            // The second customer pays in time and is confirmed.
            val secondPayment = second["next"]!!.s("checkoutUrl").substringAfterLast('/')
            val redirect = api.post(
                "/v1/public/dev-payments/$secondPayment/complete", jsonOf("outcome" to "succeeded"),
            ).obj().s("redirectUrl")
            assertTrue(redirect.startsWith("http://localhost:3000/manage/${second.s("manageToken")}"))
            val confirmed = api.get("/v1/public/manage/${second.s("manageToken")}").obj()
            assertEquals("confirmed", confirmed.s("status"))
            assertEquals("paid", confirmed.s("paymentStatus"))
            assertEquals(5000, confirmed.i("amountPaidCents"))
        }
    }

    @Test
    fun `expired holds are released by the periodic job and abandoned checkouts expire the booking`() {
        val env = TestEnv()
        withApp(env) { api ->
            val clinic = Fixtures.clinic(api)
            val held = book(api, clinic, "Paid consult", "${wed}T13:00:00+01:00", resourceId = clinic.resource("Alex"))
            env.clock.advanceMinutes(20)
            JobWorker(env.ctx).runPeriodic(force = true)
            assertEquals("expired", api.get("/v1/public/manage/${held.s("manageToken")}").obj().s("status"))
            val allocations = Fixtures.sqlOne(
                "SELECT count(*) FROM booking_allocations WHERE booking_id = ? AND active",
                java.util.UUID.fromString(held["booking"]!!.s("id")),
            ) { it.getInt(1) }
            assertEquals(0, allocations)

            val other = book(api, clinic, "Paid consult", "${wed}T15:00:00+01:00", resourceId = clinic.resource("Alex"))
            val paymentId = other["next"]!!.s("checkoutUrl").substringAfterLast('/')
            val view = api.get("/v1/public/dev-payments/$paymentId").obj()
            assertEquals("pending", view["payment"]!!.s("status"))
            api.post("/v1/public/dev-payments/$paymentId/complete", jsonOf("outcome" to "cancelled"))
            assertEquals("expired", api.get("/v1/public/manage/${other.s("manageToken")}").obj().s("status"))
            assertError(
                HttpStatusCode.BadRequest, "INVALID_REQUEST",
                api.post("/v1/public/dev-payments/$paymentId/complete", jsonOf("outcome" to "maybe")),
            )
        }
    }

    @Test
    fun `deposit services charge only the deposit`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val held = book(api, clinic, "Deposit consult", "${wed}T09:00:00+01:00")
        assertEquals(2000, held["booking"]!!.i("depositCents"))
        val paymentId = held["next"]!!.s("checkoutUrl").substringAfterLast('/')
        assertEquals(2000, api.get("/v1/public/dev-payments/$paymentId").obj()["payment"]!!.i("amountCents"))
        api.post("/v1/public/dev-payments/$paymentId/complete", jsonOf("outcome" to "succeeded"))
        val b = api.get("/v1/public/manage/${held.s("manageToken")}").obj()
        assertEquals(2000, b.i("amountPaidCents"))
        assertEquals(8000, b.i("priceCents"))
        assertEquals("paid", b.s("paymentStatus"))
    }

    @Test
    fun `rescheduling into a slot that overlaps the booking itself succeeds`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val created = book(api, clinic, "Consult", "${wed}T14:00:00+01:00")
        val token = created.s("manageToken")
        val avail = api.get("/v1/public/manage/$token/availability?from=$wed&to=$wed").obj()
        val starts = avail["days"]!!.jsonArray.flatMap { d -> d.o["slots"]!!.jsonArray.map { it.s("start") } }
        assertTrue("${wed}T14:30:00+01:00" in starts, "own allocation must not block overlapping slots")
        val moved = api.post("/v1/public/manage/$token/reschedule", jsonOf("start" to "${wed}T14:30:00+01:00"))
        assertStatus(HttpStatusCode.OK, moved)
        assertEquals("${wed}T14:30:00+01:00", moved.obj().s("start"))
        assertEquals("${wed}T15:30:00+01:00", moved.obj().s("end"))
        // The old time is free again for others.
        assertTrue("${wed}T14:00:00+01:00" !in slots(api, clinic, "Consult", wed)) // still overlaps 14:30–15:30
        assertTrue("${wed}T13:30:00+01:00" in slots(api, clinic, "Consult", wed))
        val count = Fixtures.sqlOne(
            "SELECT count(*) FROM booking_allocations WHERE booking_id = ?", java.util.UUID.fromString(created["booking"]!!.s("id")),
        ) { it.getInt(1) }
        assertEquals(2, count)
    }

    @Test
    fun `cancellation refunds follow the policy`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        suspend fun paid(start: String): String {
            val held = book(api, clinic, "Paid consult", start)
            api.post(
                "/v1/public/dev-payments/${held["next"]!!.s("checkoutUrl").substringAfterLast('/')}/complete",
                jsonOf("outcome" to "succeeded"),
            )
            return held.s("manageToken")
        }
        // Late: today 14:00 Dublin is < 24h away → 50%.
        val late = paid("2026-10-05T14:00:00+01:00")
        val preview = api.get("/v1/public/manage/$late").obj()["refundPreview"]!!.o
        assertEquals(2500, preview.i("amountCents"))
        val cancelled = api.post("/v1/public/manage/$late/cancel", jsonOf("reason" to "Can't make it")).obj()
        assertEquals("cancelled", cancelled.s("status"))
        assertEquals(2500, cancelled.i("amountRefundedCents"))
        assertEquals("partially_refunded", cancelled.s("paymentStatus"))
        assertEquals(false, cancelled.b("canCancel"))

        // Early: Thursday → full refund.
        val early = paid("2026-10-08T10:00:00+01:00")
        val c2 = api.post("/v1/public/manage/$early/cancel").obj()
        assertEquals(5000, c2.i("amountRefundedCents"))
        assertEquals("refunded", c2.s("paymentStatus"))

        // Staff cancellation: default policy for the business is a full refund; "none" keeps the money.
        val staffNone = paid("2026-10-08T12:00:00+01:00")
        val id = api.get("/v1/public/manage/$staffNone").obj().s("id")
        val res = api.post(
            "${clinic.base}/bookings/$id/cancel",
            jsonOf("reason" to "Therapist ill", "refund" to "none", "notifyCustomer" to true), clinic.owner.token,
        )
        assertStatus(HttpStatusCode.OK, res)
        assertEquals(0, res.obj().i("amountRefundedCents"))
        val staffPolicy = paid("2026-10-08T14:00:00+01:00")
        val id2 = api.get("/v1/public/manage/$staffPolicy").obj().s("id")
        val res2 = api.post("${clinic.base}/bookings/$id2/cancel", jsonOf("refund" to "policy"), clinic.owner.token).obj()
        assertEquals(5000, res2.i("amountRefundedCents"))
        val detail = api.get("${clinic.base}/bookings/$id2", clinic.owner.token).obj()
        assertEquals(listOf("charge", "refund"), detail["payments"]!!.jsonArray.map { it.s("kind") })
        assertTrue(detail["history"]!!.jsonArray.any { it.s("action") == "booking.cancelled" })
    }

    @Test
    fun `manage token endpoints and customer policy`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val created = book(api, clinic, "Consult", "${wed}T09:00:00+01:00", email = "manage.me@example.test")
        val token = created.s("manageToken")
        val view = api.get("/v1/public/manage/$token").obj()
        assertEquals("manage.me@example.test", view["customer"]!!.s("email"))
        assertTrue(view.b("canCancel"))
        assertTrue(view.b("canReschedule"))
        assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.get("/v1/public/manage/not-a-real-token-but-long-enough"))
        assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.get("/v1/public/manage/x"))
        assertError(
            HttpStatusCode.Conflict, "SLOT_UNAVAILABLE",
            api.post("/v1/public/manage/$token/reschedule", jsonOf("start" to "${wed}T09:10:00+01:00")),
        )
        assertError(
            HttpStatusCode.BadRequest, "INVALID_REQUEST", api.post("/v1/public/manage/$token/reschedule", jsonOf("start" to "next week")),
        )
        assertError(HttpStatusCode.Conflict, "POLICY_VIOLATION", api.post("/v1/public/manage/$token/pay"))
        // Business turns off self-service rescheduling.
        api.patch(
            clinic.base,
            jsonOf(
                "policies" to mapOf(
                    "minNoticeMinutes" to 60, "maxAdvanceDays" to 60, "cancellationNoticeHours" to 24,
                    "lateCancellationRefundPercent" to 50, "allowCustomerCancel" to true, "allowCustomerReschedule" to false,
                    "holdMinutes" to 15,
                    "requireCustomerPhone" to false,
                ),
            ),
            clinic.owner.token,
        )
        assertError(
            HttpStatusCode.Conflict, "POLICY_VIOLATION",
            api.post("/v1/public/manage/$token/reschedule", jsonOf("start" to "${wed}T11:00:00+01:00")),
        )
        assertStatus(HttpStatusCode.OK, api.post("/v1/public/manage/$token/cancel", jsonOf("reason" to "Changed plans")))
        assertError(HttpStatusCode.Conflict, "POLICY_VIOLATION", api.post("/v1/public/manage/$token/cancel"))
    }

    @Test
    fun `approval flow, group sessions, audiences and buffers through the API`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        // Approval
        val pending = book(api, clinic, "Approval consult", "${wed}T09:30:00+01:00")
        assertEquals("pending_approval", pending["booking"]!!.s("status"))
        assertEquals("pending_approval", pending["next"]!!.s("type"))
        val pid = pending["booking"]!!.s("id")
        assertEquals("confirmed", api.post("${clinic.base}/bookings/$pid/approve", null, clinic.owner.token).obj().s("status"))
        assertError(HttpStatusCode.Conflict, "POLICY_VIOLATION", api.post("${clinic.base}/bookings/$pid/approve", null, clinic.owner.token))
        val other = book(api, clinic, "Approval consult", "${wed}T10:30:00+01:00")
        val declined = api.post(
            "${clinic.base}/bookings/${other["booking"]!!.s("id")}/decline", jsonOf("reason" to "Fully booked"), clinic.owner.token,
        ).obj()
        assertEquals("cancelled", declined.s("status"))
        assertEquals("business", declined.s("cancelledBy"))

        // Group session: capacity 3
        val session = "${wed}T18:00:00+01:00"
        book(api, clinic, "Class", session)
        val avail = api.get("${clinic.public}/availability?serviceId=${clinic.service("Class")}&from=$wed&to=$wed").obj()
        val slot = avail["days"]!!.jsonArray[0].o["slots"]!!.jsonArray.first { it.s("start") == session }
        assertEquals(2, slot.i("seatsLeft"))
        book(api, clinic, "Class", session)
        book(api, clinic, "Class", session)
        assertTrue(session !in slots(api, clinic, "Class", wed))
        assertError(
            HttpStatusCode.Conflict, "SLOT_UNAVAILABLE",
            api.post("${clinic.public}/bookings", Fixtures.bookingBody(clinic, "Class", session)),
        )

        // Service restricted to a group
        assertEquals(emptyList(), slots(api, clinic, "Members only", wed))
        val members = clinic.groups.getValue("Members")
        assertTrue(slots(api, clinic, "Members only", wed, "&groupId=$members").isNotEmpty())
        assertError(
            HttpStatusCode.Conflict, "POLICY_VIOLATION",
            api.post("${clinic.public}/bookings", Fixtures.bookingBody(clinic, "Members only", "${wed}T09:00:00+01:00")),
        )
        book(api, clinic, "Members only", "${wed}T16:30:00+01:00", groupId = members)

        // Restricted group: VIP sees only windows that list it (Saturday), never the open weekday windows.
        val sat = "2026-10-10"
        val vip = clinic.groups.getValue("VIP")
        assertEquals(emptyList(), slots(api, clinic, "Consult", sat))
        assertTrue(slots(api, clinic, "Consult", sat, "&groupId=$vip").isNotEmpty())
        assertEquals(emptyList(), slots(api, clinic, "Consult", wed, "&groupId=$vip"))

        // Buffers (15 before / 15 after, 45 minutes, Blake 13:00–17:00)
        assertEquals(listOf("13:15", "14:00", "14:45", "15:30"), slots(api, clinic, "Buffered", wed).map { it.substring(11, 16) })
        book(api, clinic, "Buffered", "${wed}T14:00:00+01:00")
        assertEquals(listOf("15:30"), slots(api, clinic, "Buffered", wed).map { it.substring(11, 16) })
    }

    @Test
    fun `free plan booking limit`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val first = book(api, clinic, "Consult", "${wed}T09:00:00+01:00")
        val bid = java.util.UUID.fromString(first["booking"]!!.s("id"))
        Fixtures.sql(
            """
            INSERT INTO bookings (business_id, reference, customer_id, service_id, start_at, end_at, status, currency, created_at)
            SELECT b.business_id, 'BA-L' || lpad(g::text, 5, '0'), b.customer_id, b.service_id, b.start_at, b.end_at, 'cancelled', 'EUR', b.created_at
            FROM bookings b, generate_series(1, 99) g WHERE b.id = ?
            """.trimIndent(),
            bid,
        )
        val res = api.post("${clinic.public}/bookings", Fixtures.bookingBody(clinic, "Consult", "${wed}T11:00:00+01:00"))
        assertError(HttpStatusCode.Conflict, "PLAN_LIMIT_REACHED", res)
        val billing = api.get("${clinic.base}/billing", clinic.owner.token).obj()
        assertEquals(100, billing["usage"]!!.i("bookingsThisMonth"))
        assertEquals(100, billing["usage"]!!.i("limit"))
        // A hold that expired unpaid is not a booking taken: it frees its place in the month's count.
        val businessId = java.util.UUID.fromString(clinic.id)
        Fixtures.sql("UPDATE bookings SET status = 'expired' WHERE reference = 'BA-L00001' AND business_id = ?", businessId)
        assertEquals(99, api.get("${clinic.base}/billing", clinic.owner.token).obj()["usage"]!!.i("bookingsThisMonth"))
        assertStatus(
            HttpStatusCode.Created, api.post("${clinic.public}/bookings", Fixtures.bookingBody(clinic, "Consult", "${wed}T11:00:00+01:00")),
        )
        val full = api.post("${clinic.public}/bookings", Fixtures.bookingBody(clinic, "Consult", "${wed}T15:00:00+01:00"))
        assertError(HttpStatusCode.Conflict, "PLAN_LIMIT_REACHED", full)
        Fixtures.sql("UPDATE businesses SET plan = 'pro' WHERE id = ?", java.util.UUID.fromString(clinic.id))
        assertStatus(
            HttpStatusCode.Created, api.post("${clinic.public}/bookings", Fixtures.bookingBody(clinic, "Consult", "${wed}T15:00:00+01:00")),
        )
    }

    @Test
    fun `signed-in customers get their booking linked immediately`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val user = TestUser.create("cust")
        book(api, clinic, "Consult", "${wed}T15:00:00+01:00", token = user.token, email = user.email)
        val mine = api.get("/v1/me/bookings", user.token).obj()
        assertEquals(1, mine["upcoming"]!!.jsonArray.size)
        assertEquals(clinic.slug, mine["upcoming"]!!.jsonArray[0].o["business"]!!.s("slug"))
    }
}
