package ie.bookanything.booking

import ie.bookanything.jobs.JobWorker
import ie.bookanything.support.Api
import ie.bookanything.support.Clinic
import ie.bookanything.support.Fixtures
import ie.bookanything.support.Fixtures.book
import ie.bookanything.support.Fixtures.slots
import ie.bookanything.support.TestEnv
import ie.bookanything.support.TestUser
import ie.bookanything.support.assertError
import ie.bookanything.support.assertStatus
import ie.bookanything.support.i
import ie.bookanything.support.jsonOf
import ie.bookanything.support.o
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.sOrNull
import ie.bookanything.support.withApp
import io.ktor.client.statement.HttpResponse
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Reschedule availability that ignores the booking being moved, customer payment links and staff payment links. */
class RescheduleAndPaymentLinkTest {
    private val wed = "2026-10-07"

    private suspend fun starts(res: HttpResponse): List<String> {
        assertStatus(HttpStatusCode.OK, res)
        return res.obj()["days"]!!.jsonArray.flatMap { d -> d.o["slots"]!!.jsonArray.map { it.s("start") } }
    }

    private fun staffBooking(
        clinic: Clinic, service: String, start: String, paymentMode: String, email: String?, notify: Boolean = true,
    ) = jsonOf(
        "serviceId" to clinic.service(service), "optionId" to null, "addonIds" to emptyList<String>(), "groupId" to null,
        "resourceIds" to null, "start" to start, "customerId" to null,
        "customer" to mapOf("name" to "Morgan Example", "email" to email, "phone" to null), "answers" to emptyMap<String, String>(),
        "internalNotes" to null, "paymentMode" to paymentMode, "notifyCustomer" to notify,
    )

    private suspend fun signedInBooking(
        api: Api, clinic: Clinic, user: TestUser, service: String, start: String, groupId: String? = null,
    ): JsonObject =
        book(api, clinic, service, start, token = user.token, email = user.email, groupId = groupId)["booking"]!!.o

    @Test
    fun `staff availability can ignore the booking being moved`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val owner = clinic.owner.token
        val booking = book(api, clinic, "Consult", "${wed}T14:00:00+01:00")["booking"]!!.o
        val id = booking.s("id")
        val consult = clinic.service("Consult")

        // The single room is taken 14:00-15:00, so 14:30 is busy for everyone else...
        assertFalse("${wed}T14:30:00+01:00" in starts(api.get("${clinic.base}/availability?serviceId=$consult&from=$wed&to=$wed", owner)))
        // ...but free for the booking itself, which keeps its own duration.
        val own = api.get("${clinic.base}/availability?serviceId=$consult&excludeBookingId=$id&from=$wed&to=$wed", owner)
        val ownStarts = starts(own)
        assertTrue("${wed}T14:30:00+01:00" in ownStarts, ownStarts.toString())
        assertTrue("${wed}T14:00:00+01:00" in ownStarts)
        // serviceId may be omitted when excludeBookingId is given, but must match when present.
        assertEquals(ownStarts, starts(api.get("${clinic.base}/availability?excludeBookingId=$id&from=$wed&to=$wed", owner)))
        assertError(
            HttpStatusCode.BadRequest, "INVALID_REQUEST",
            api.get("${clinic.base}/availability?serviceId=${clinic.service("Class")}&excludeBookingId=$id&from=$wed&to=$wed", owner),
        )
        assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", api.get("${clinic.base}/availability?from=$wed&to=$wed", owner))

        // Staff reschedule into the overlapping slot.
        val moved = api.post(
            "${clinic.base}/bookings/$id/reschedule", jsonOf("start" to "${wed}T14:30:00+01:00", "notifyCustomer" to false), owner,
        )
        assertStatus(HttpStatusCode.OK, moved)
        assertEquals("${wed}T14:30:00+01:00", moved.obj().s("start"))
        assertEquals("${wed}T15:30:00+01:00", moved.obj().s("end"))

        // Another business cannot use its own endpoint to probe this booking.
        val other = Fixtures.clinic(api)
        assertError(
            HttpStatusCode.NotFound, "NOT_FOUND",
            api.get("${other.base}/availability?excludeBookingId=$id&from=$wed&to=$wed", other.owner.token),
        )
        assertError(
            HttpStatusCode.NotFound, "NOT_FOUND",
            api.get("${clinic.base}/availability?excludeBookingId=${java.util.UUID.randomUUID()}&from=$wed&to=$wed", owner),
        )
    }

    @Test
    fun `staff reschedule availability is scoped to the staff member's bookings and calendar`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val staff = TestUser.create("staff", "Sam Staff")
        assertStatus(
            HttpStatusCode.Created,
            api.post(
                "${clinic.base}/team/invitations",
                jsonOf("email" to staff.email, "role" to "staff", "resourceId" to clinic.resource("Alex")), clinic.owner.token,
            ),
        )
        api.get("/v1/me", staff.token)
        val alex = book(api, clinic, "Paid consult", "${wed}T10:00:00+01:00", resourceId = clinic.resource("Alex"))["booking"]!!.o
        val blake = book(api, clinic, "Paid consult", "${wed}T14:00:00+01:00", resourceId = clinic.resource("Blake"))["booking"]!!.o
        val ok = starts(api.get("${clinic.base}/availability?excludeBookingId=${alex.s("id")}&from=$wed&to=$wed", staff.token))
        assertTrue("${wed}T10:00:00+01:00" in ok)
        assertError(
            HttpStatusCode.NotFound, "NOT_FOUND",
            api.get("${clinic.base}/availability?excludeBookingId=${blake.s("id")}&from=$wed&to=$wed", staff.token),
        )
        assertError(
            HttpStatusCode.Forbidden, "FORBIDDEN",
            api.get(
                "${clinic.base}/availability?excludeBookingId=${alex.s("id")}&resourceId=${clinic.resource("Blake")}&from=$wed&to=$wed",
                staff.token,
            ),
        )
    }

    @Test
    fun `reschedule availability respects the booking's customer group`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val user = TestUser.create("member", "Riley Example")
        val members = clinic.groups.getValue("Members")
        val booking = signedInBooking(api, clinic, user, "Members only", "${wed}T10:00:00+01:00", groupId = members)
        val id = booking.s("id")

        // Without the group the service can't be booked at all (what /my/bookings used to show)...
        assertEquals(emptyList(), slots(api, clinic, "Members only", wed))
        // ...the booking's own availability uses its group, for the customer and for staff.
        val mine = starts(api.get("/v1/me/bookings/$id/availability?from=$wed&to=$wed", user.token))
        assertTrue("${wed}T10:00:00+01:00" in mine && "${wed}T11:00:00+01:00" in mine, mine.toString())
        val staff = starts(api.get("${clinic.base}/availability?excludeBookingId=$id&from=$wed&to=$wed", clinic.owner.token))
        assertTrue("${wed}T11:00:00+01:00" in staff, staff.toString())
        val moved = api.post("/v1/me/bookings/$id/reschedule", jsonOf("start" to "${wed}T11:00:00+01:00"), user.token)
        assertStatus(HttpStatusCode.OK, moved)
        assertEquals("${wed}T11:00:00+01:00", moved.obj().s("start"))
    }

    @Test
    fun `a customer moving their booking keeps the person they chose unless they choose again`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val blake = clinic.resource("Blake")
        val created = book(api, clinic, "Approval consult", "${wed}T14:00:00+01:00", resourceId = blake)
        val token = created.s("manageToken")
        book(api, clinic, "Approval consult", "${wed}T15:00:00+01:00", resourceId = blake) // Blake is busy at 15:00; Alex is free

        // Only Blake's free times are offered (Blake works from 13:00), not Alex's.
        val times = starts(api.get("/v1/public/manage/$token/availability?from=$wed&to=$wed"))
        assertTrue("${wed}T13:00:00+01:00" in times && "${wed}T14:30:00+01:00" in times, times.toString())
        assertFalse("${wed}T10:00:00+01:00" in times || "${wed}T15:00:00+01:00" in times, times.toString())
        assertError(
            HttpStatusCode.Conflict, "SLOT_UNAVAILABLE",
            api.post("/v1/public/manage/$token/reschedule", jsonOf("start" to "${wed}T15:00:00+01:00")),
        )
        val moved = api.post("/v1/public/manage/$token/reschedule", jsonOf("start" to "${wed}T13:00:00+01:00"))
        assertStatus(HttpStatusCode.OK, moved)
        assertEquals(listOf(blake), moved.obj()["resources"]!!.jsonArray.map { it.s("id") })

        // Choosing someone else is still allowed.
        val alex = clinic.resource("Alex")
        val switched = api.post("/v1/public/manage/$token/reschedule", jsonOf("start" to "${wed}T10:00:00+01:00", "resourceId" to alex))
        assertStatus(HttpStatusCode.OK, switched)
        assertEquals(listOf(alex), switched.obj()["resources"]!!.jsonArray.map { it.s("id") })

        // If the chosen person no longer works there, any of the others will do.
        api.patch("${clinic.base}/resources/$alex", jsonOf("isActive" to false), clinic.owner.token)
        val anyone = api.post("/v1/public/manage/$token/reschedule", jsonOf("start" to "${wed}T16:00:00+01:00"))
        assertStatus(HttpStatusCode.OK, anyone)
        assertEquals(listOf(blake), anyone.obj()["resources"]!!.jsonArray.map { it.s("id") })
    }

    @Test
    fun `signed-in customers see and take slots overlapping their own booking`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val user = TestUser.create("cust", "Rowan Sample")
        val id = signedInBooking(api, clinic, user, "Consult", "${wed}T14:00:00+01:00").s("id")
        assertFalse("${wed}T14:30:00+01:00" in slots(api, clinic, "Consult", wed))
        val mine = starts(api.get("/v1/me/bookings/$id/availability?from=$wed&to=$wed", user.token))
        assertTrue("${wed}T14:30:00+01:00" in mine, mine.toString())
        assertEquals(60, api.get("/v1/me/bookings/$id/availability?from=$wed&to=$wed", user.token).obj().i("durationMinutes"))
        val moved = api.post("/v1/me/bookings/$id/reschedule", jsonOf("start" to "${wed}T14:30:00+01:00"), user.token)
        assertStatus(HttpStatusCode.OK, moved)
        assertEquals("${wed}T15:30:00+01:00", moved.obj().s("end"))

        // Only the owner of the booking may look.
        val stranger = TestUser.create("stranger")
        assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.get("/v1/me/bookings/$id/availability?from=$wed&to=$wed", stranger.token))
        assertError(HttpStatusCode.Unauthorized, "UNAUTHENTICATED", api.get("/v1/me/bookings/$id/availability?from=$wed&to=$wed"))
        assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", api.get("/v1/me/bookings/$id/availability?from=$wed", user.token))
    }

    @Test
    fun `signed-in customers can pay a held booking`() {
        val env = TestEnv()
        withApp(env) { api ->
            val clinic = Fixtures.clinic(api)
            val user = TestUser.create("payer", "Quinn Example")
            val result = book(api, clinic, "Paid consult", "${wed}T11:00:00+01:00", token = user.token, email = user.email)
            val id = result["booking"]!!.s("id")
            val pay = api.post("/v1/me/bookings/$id/pay", null, user.token)
            assertStatus(HttpStatusCode.OK, pay)
            assertEquals(result["next"]!!.s("checkoutUrl"), pay.obj().s("checkoutUrl"))
            assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.post("/v1/me/bookings/$id/pay", null, TestUser.create("other").token))

            val free = signedInBooking(api, clinic, user, "Consult", "${wed}T15:00:00+01:00")
            assertError(HttpStatusCode.Conflict, "POLICY_VIOLATION", api.post("/v1/me/bookings/${free.s("id")}/pay", null, user.token))

            env.clock.advanceMinutes(20)
            assertError(HttpStatusCode.Conflict, "POLICY_VIOLATION", api.post("/v1/me/bookings/$id/pay", null, user.token))
        }
    }

    @Test
    fun `staff bookings that collect online return, email and resend the payment link`() {
        val env = TestEnv()
        withApp(env) { api ->
            val clinic = Fixtures.clinic(api)
            val owner = clinic.owner.token
            val res = api.post(
                "${clinic.base}/bookings",
                staffBooking(clinic, "Paid consult", "${wed}T09:00:00+01:00", "collect_online", "morgan.example@example.test"), owner,
            )
            assertStatus(HttpStatusCode.Created, res)
            val created = res.obj()
            assertEquals("held", created.s("status"))
            assertEquals("pending", created.s("paymentStatus"))
            val checkoutUrl = created.s("checkoutUrl")
            assertTrue(checkoutUrl.startsWith("http://localhost:3000/dev/checkout/"), checkoutUrl)
            val id = created.s("id")
            assertEquals(checkoutUrl, api.get("${clinic.base}/bookings/$id", owner).obj().s("checkoutUrl"))

            JobWorker(env.ctx).drain()
            val first = env.email.sent.filter { it.to == "morgan.example@example.test" }
            assertEquals(listOf("payment_requested"), first.map { it.template })
            assertTrue(first[0].text.contains(checkoutUrl), first[0].text)
            assertTrue(first[0].html.contains(checkoutUrl))

            val resend = api.post("${clinic.base}/bookings/$id/send-payment-link", null, owner)
            assertStatus(HttpStatusCode.OK, resend)
            assertEquals(checkoutUrl, resend.obj().s("checkoutUrl"))
            assertEquals("morgan.example@example.test", resend.obj().s("sentTo"))
            JobWorker(env.ctx).drain()
            assertEquals(2, env.email.sent.count { it.to == "morgan.example@example.test" && it.template == "payment_requested" })
            val history = api.get("${clinic.base}/bookings/$id", owner).obj()["history"]!!.jsonArray
            assertTrue(history.any { it.s("action") == "booking.payment_link_sent" })

            // Paying through the link confirms the booking; the link is gone afterwards.
            api.post("/v1/public/dev-payments/${checkoutUrl.substringAfterLast('/')}/complete", jsonOf("outcome" to "succeeded"))
            val paid = api.get("${clinic.base}/bookings/$id", owner).obj()
            assertEquals("confirmed", paid.s("status"))
            assertNull(paid.sOrNull("checkoutUrl"))
            assertError(HttpStatusCode.Conflict, "POLICY_VIOLATION", api.post("${clinic.base}/bookings/$id/send-payment-link", null, owner))
        }
    }

    @Test
    fun `a staff booking paid online is confirmed even when the service needs approval, and the business isn't emailed`() {
        val env = TestEnv()
        withApp(env) { api ->
            val clinic = Fixtures.clinic(api)
            val owner = clinic.owner.token
            val email = "paid.request@example.test"
            val body = staffBooking(clinic, "Approval consult", "${wed}T09:00:00+01:00", "collect_online", email)
            val created = api.post("${clinic.base}/bookings", body, owner).obj()
            assertEquals("held", created.s("status"))
            val checkout = created.s("checkoutUrl").substringAfterLast('/')
            api.post("/v1/public/dev-payments/$checkout/complete", jsonOf("outcome" to "succeeded"))
            assertEquals("confirmed", api.get("${clinic.base}/bookings/${created.s("id")}", owner).obj().s("status"))
            JobWorker(env.ctx).drain()
            assertTrue(env.email.sent.any { it.to == email && it.template == "booking_confirmed" })
            assertTrue(env.email.sent.none { it.to == clinic.owner.email && it.template == "new_booking_for_business" })
        }
    }

    @Test
    fun `payment links need a held booking and a customer email`() {
        val env = TestEnv()
        withApp(env) { api ->
            val clinic = Fixtures.clinic(api)
            val owner = clinic.owner.token
            val atVenue = api.post(
                "${clinic.base}/bookings",
                staffBooking(clinic, "Paid consult", "${wed}T10:00:00+01:00", "at_venue", "venue.payer@example.test"), owner,
            ).obj()
            assertEquals("confirmed", atVenue.s("status"))
            assertTrue("checkoutUrl" in atVenue)
            assertNull(atVenue.sOrNull("checkoutUrl"))
            assertNull(api.get("${clinic.base}/bookings/${atVenue.s("id")}", owner).obj().sOrNull("checkoutUrl"))
            assertError(
                HttpStatusCode.Conflict, "POLICY_VIOLATION",
                api.post("${clinic.base}/bookings/${atVenue.s("id")}/send-payment-link", null, owner),
            )

            val noEmail = api.post(
                "${clinic.base}/bookings",
                staffBooking(clinic, "Paid consult", "${wed}T11:00:00+01:00", "collect_online", null), owner,
            ).obj()
            assertNotNull(noEmail.sOrNull("checkoutUrl"))
            assertError(
                HttpStatusCode.Conflict, "POLICY_VIOLATION",
                api.post("${clinic.base}/bookings/${noEmail.s("id")}/send-payment-link", null, owner),
            )

            val quiet = api.post(
                "${clinic.base}/bookings",
                staffBooking(clinic, "Paid consult", "${wed}T12:00:00+01:00", "collect_online", "quiet.payer@example.test", notify = false),
                owner,
            ).obj()
            JobWorker(env.ctx).drain()
            assertTrue(env.email.sent.none { it.to == "quiet.payer@example.test" }, "notifyCustomer=false sends nothing")

            // After the hold lapses there is no link to share.
            env.clock.advanceMinutes(20)
            assertNull(api.get("${clinic.base}/bookings/${quiet.s("id")}", owner).obj().sOrNull("checkoutUrl"))
            assertError(
                HttpStatusCode.Conflict, "POLICY_VIOLATION",
                api.post("${clinic.base}/bookings/${quiet.s("id")}/send-payment-link", null, owner),
            )
        }
    }

    @Test
    fun `decline stores the reason and tells the customer`() {
        val env = TestEnv()
        withApp(env) { api ->
            val clinic = Fixtures.clinic(api)
            val pending = book(api, clinic, "Approval consult", "${wed}T11:30:00+01:00", email = "decline.me@example.test")
            val id = pending["booking"]!!.s("id")
            val declined = api.post("${clinic.base}/bookings/$id/decline", jsonOf("reason" to "Fully booked that week"), clinic.owner.token)
            assertStatus(HttpStatusCode.OK, declined)
            assertEquals("Fully booked that week", declined.obj().s("cancellationReason"))
            JobWorker(env.ctx).drain()
            val email = env.email.sent.single { it.to == "decline.me@example.test" && it.template == "booking_declined" }
            assertTrue(email.text.contains("Fully booked that week"), email.text)
        }
    }

    @Test
    fun `a request can't be approved once its time has passed, but can still be declined`() {
        val env = TestEnv()
        withApp(env) { api ->
            val clinic = Fixtures.clinic(api)
            val id = book(api, clinic, "Approval consult", "${wed}T11:30:00+01:00")["booking"]!!.s("id")
            env.clock.advanceMinutes(2 * 24 * 60 + 4 * 60) // Wednesday 13:00 in Dublin
            val late = api.post("${clinic.base}/bookings/$id/approve", null, clinic.owner.token)
            assertError(HttpStatusCode.Conflict, "POLICY_VIOLATION", late)
            assertTrue(late.obj()["error"]!!.s("message").contains("time has passed"))
            assertEquals("pending_approval", api.get("${clinic.base}/bookings/$id", clinic.owner.token).obj().s("status"))
            assertStatus(HttpStatusCode.OK, api.post("${clinic.base}/bookings/$id/decline", jsonOf("reason" to null), clinic.owner.token))
        }
    }
}
