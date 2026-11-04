package ie.bookanything.payments

import ie.bookanything.support.Api
import ie.bookanything.support.Clinic
import ie.bookanything.support.Money
import ie.bookanything.support.TestEnv
import ie.bookanything.support.arr
import ie.bookanything.support.assertError
import ie.bookanything.support.assertStatus
import ie.bookanything.support.createBusiness
import ie.bookanything.support.i
import ie.bookanything.support.jsonOf
import ie.bookanything.support.o
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.testBusiness
import ie.bookanything.support.unique
import ie.bookanything.support.withApp
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Paying at the venue instead of online, and staff recording payments taken in person. Now is Monday 5 October 2026,
 * 09:00 in Dublin.
 */
class PayAtVenueTest {
    private val thursday = "2026-10-08T10:00:00+01:00"
    private val friday = "2026-10-09T10:00:00+01:00"

    private val clinic = testBusiness("Venue Physio") {
        val pat = person("Pat")
        service("Massage", 60) { price(6000); needs("Therapist", pat) }
        service("Deposit massage", 60) { deposit(6000, 1500); needs("Therapist", pat) }
        service("Walk-in massage", 60) { atVenue(4000); needs("Therapist", pat) }
    }

    /** Turns the service's "let the customer pay at the venue" setting on or off, as the owner. */
    private suspend fun allowPayAtVenue(api: Api, c: Clinic, service: String, allow: Boolean = true): JsonObject {
        val current = api.get("${c.base}/services", c.owner.token).arr().single { it.s("name") == service }.o
        val res = api.put(
            "${c.base}/services/${current.s("id")}",
            JsonObject(current + ("allowPayAtVenue" to JsonPrimitive(allow))).toString(),
            c.owner.token,
        )
        assertStatus(HttpStatusCode.OK, res)
        return res.obj()
    }

    private suspend fun book(api: Api, c: Clinic, service: String, start: String, payment: String?) = api.post(
        "${c.public}/bookings",
        jsonOf(
            "serviceId" to c.service(service), "start" to start, "payment" to payment,
            "customer" to mapOf("name" to "Jordan Casey", "email" to "${unique("guest")}@example.test", "phone" to null),
        ),
    )

    private suspend fun paidInPerson(api: Api, c: Clinic, bookingId: String) =
        api.post("${c.base}/bookings/$bookingId/paid-in-person", null, c.owner.token)

    private suspend fun publicService(api: Api, c: Clinic, name: String) = Money.catalog(api, c, name)

    @Test
    fun `the setting is kept for services paid online and dropped for the others`() = withApp(TestEnv()) { api ->
        val c = api.createBusiness(clinic)
        assertFalse(publicService(api, c, "Massage")["allowPayAtVenue"]!!.jsonPrimitive.boolean, "off by default")

        assertTrue(allowPayAtVenue(api, c, "Massage")["allowPayAtVenue"]!!.jsonPrimitive.boolean)
        assertTrue(allowPayAtVenue(api, c, "Deposit massage")["allowPayAtVenue"]!!.jsonPrimitive.boolean)
        assertFalse(allowPayAtVenue(api, c, "Walk-in massage")["allowPayAtVenue"]!!.jsonPrimitive.boolean, "already paid there")

        assertTrue(publicService(api, c, "Massage")["allowPayAtVenue"]!!.jsonPrimitive.boolean)
        assertFalse(publicService(api, c, "Walk-in massage")["allowPayAtVenue"]!!.jsonPrimitive.boolean)
    }

    @Test
    fun `a customer chooses to pay at the venue when the service allows it`() = withApp(TestEnv()) { api ->
        val c = api.createBusiness(clinic)
        assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", book(api, c, "Massage", thursday, "at_venue"))

        allowPayAtVenue(api, c, "Massage")
        val atVenue = book(api, c, "Massage", thursday, "at_venue").also { assertStatus(HttpStatusCode.Created, it) }.obj()
        assertEquals("confirmed", atVenue["next"]!!.s("type"))
        assertNull(atVenue["next"]!!.o["checkoutUrl"]?.jsonPrimitive?.contentOrNull)
        assertEquals("confirmed pay_at_venue, paid 0, refunded 0", Money.state(atVenue["booking"]!!.o))
        assertEquals(0, atVenue["booking"]!!.o.i("amountPaidInPersonCents"))
        assertEquals(emptyList(), Money.ledger(Money.bookingId(atVenue)))

        // Choosing online (or nothing) still pays online, as the service says.
        val online = book(api, c, "Massage", friday, "online").also { assertStatus(HttpStatusCode.Created, it) }.obj()
        assertEquals("payment_required", online["next"]!!.s("type"))

        assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", book(api, c, "Massage", friday, "cash"))
    }

    @Test
    fun `staff record a payment taken at the venue once`() = withApp(TestEnv()) { api ->
        val c = api.createBusiness(clinic)
        val booked = book(api, c, "Walk-in massage", thursday, null).obj()
        val id = Money.bookingId(booked)

        val paid = paidInPerson(api, c, id).also { assertStatus(HttpStatusCode.OK, it) }.obj()
        assertEquals("confirmed paid, paid 4000, refunded 0", Money.state(paid))
        assertEquals(listOf("charge succeeded 4000"), Money.ledger(id))
        val detail = api.get("${c.base}/bookings/$id", c.owner.token).obj()
        assertEquals("in_person", detail["payments"]!!.jsonArray.single().s("provider"))
        assertTrue(detail["history"]!!.jsonArray.any { it.s("action") == "payment.received_in_person" })

        assertError(HttpStatusCode.Conflict, "POLICY_VIOLATION", paidInPerson(api, c, id))
    }

    @Test
    fun `nothing is due in person on a booking paid online in full`() = withApp(TestEnv()) { api ->
        val c = api.createBusiness(clinic)
        val paid = Money.paidBooking(api, c, "Massage", thursday)
        assertError(HttpStatusCode.Conflict, "POLICY_VIOLATION", paidInPerson(api, c, Money.bookingId(paid)))
    }

    @Test
    fun `a deposit's balance paid in person is never refunded online`() = withApp(TestEnv()) { api ->
        val c = api.createBusiness(clinic)
        val booked = Money.paidBooking(api, c, "Deposit massage", thursday)
        val id = Money.bookingId(booked)

        val paid = paidInPerson(api, c, id).obj()
        assertEquals("confirmed paid, paid 6000, refunded 0", Money.state(paid))
        assertEquals(listOf("charge succeeded 1500", "charge succeeded 4500"), Money.ledger(id))
        // Both sides see the in-person part, so their refund previews can leave it out.
        assertEquals(4500, paid.i("amountPaidInPersonCents"))
        assertEquals(4500, api.get("${c.base}/bookings/$id", c.owner.token).obj().i("amountPaidInPersonCents"))
        val view = Money.view(api, booked)
        assertEquals(4500, view.i("amountPaidInPersonCents"))
        // The customer may cancel in time: only the deposit they paid online can come back online.
        assertEquals(1500, view["refundPreview"]!!.o.i("amountCents"))

        val cancelled = api.post("${c.base}/bookings/$id/cancel", jsonOf("refund" to "full"), c.owner.token).obj()
        assertEquals(1500, cancelled.i("amountRefundedCents"))
        assertEquals(listOf("charge succeeded 1500", "charge succeeded 4500", "refund succeeded 1500"), Money.ledger(id))
    }
}
