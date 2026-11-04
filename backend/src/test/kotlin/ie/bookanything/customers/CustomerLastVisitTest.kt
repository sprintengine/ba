package ie.bookanything.customers

import ie.bookanything.support.Fixtures
import ie.bookanything.support.Fixtures.book
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.sOrNull
import ie.bookanything.support.unique
import ie.bookanything.support.withApp
import kotlinx.serialization.json.jsonArray
import kotlin.test.Test
import kotlin.test.assertEquals

class CustomerLastVisitTest {
    @Test
    fun `the last visit is the latest booking that happened, never an upcoming one`() = withApp { api ->
        // Regression: "Last visit" took the latest booking of any live status, so a customer with a booking next
        // week showed next week's date.
        val clinic = Fixtures.clinic(api)
        val email = "${unique("visits")}@example.test"
        val earlier = book(api, clinic, "Consult", "2026-10-06T09:00:00+01:00", email = email)["booking"]!!.s("id")
        book(api, clinic, "Consult", "2026-10-08T09:00:00+01:00", email = email)
        val t = clinic.owner.token
        val customerId = api.get("${clinic.base}/bookings/$earlier", t).obj()["customer"]!!.s("id")
        suspend fun lastVisit() = api.get("${clinic.base}/customers/$customerId", t).obj().sOrNull("lastBookingAt")
        suspend fun listedLastVisit() =
            api.get("${clinic.base}/customers?q=$email", t).obj()["items"]!!.jsonArray.single().sOrNull("lastBookingAt")

        // Both are still to come: no visit yet.
        assertEquals(null, lastVisit())
        assertEquals(null, listedLastVisit())

        // The earlier one happened (an outcome is recorded once it has started; confirmed ones complete on their own).
        Fixtures.sql("UPDATE bookings SET status = 'completed' WHERE id = ?::uuid", earlier)
        assertEquals("2026-10-06T09:00:00+01:00", lastVisit())
        assertEquals("2026-10-06T09:00:00+01:00", listedLastVisit())
    }
}
