package ie.bookanything.security

import ie.bookanything.support.Clinic
import ie.bookanything.support.Fixtures
import ie.bookanything.support.TestUser
import ie.bookanything.support.assertError
import ie.bookanything.support.assertStatus
import ie.bookanything.support.jsonOf
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.sOrNull
import ie.bookanything.support.unique
import ie.bookanything.support.withApp
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull

/** Abuse of the anonymous public booking endpoint (security review findings). */
class PublicBookingAbuseTest {
    private val wed = "2026-10-07"

    private fun body(clinic: Clinic, start: String, name: String, email: String, phone: String?) = jsonOf(
        "serviceId" to clinic.service("Consult"), "optionId" to null, "addonIds" to emptyList<String>(), "groupId" to null,
        "resourceId" to null, "start" to start, "customer" to mapOf("name" to name, "email" to email, "phone" to phone),
        "answers" to mapOf(clinic.questions.getValue("Reason for visit") to "Sore shoulder"), "customerNotes" to null,
    )

    @Test
    fun `an idempotency key replay for a different customer does not return the original booking or its manage token`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val key = unique("guessable-key")
        val start = "${wed}T11:00:00+01:00"
        val first = api.post(
            "${clinic.public}/bookings", body(clinic, start, "Jordan Casey", "jordan.casey@example.test", null),
            headers = mapOf("Idempotency-Key" to key),
        )
        assertStatus(HttpStatusCode.Created, first)
        val token = first.obj().s("manageToken")

        // Same key, service and start, but someone else's details: refused, and nothing leaks.
        val replay = api.post(
            "${clinic.public}/bookings", body(clinic, start, "Mallory Example", "mallory@example.test", null),
            headers = mapOf("Idempotency-Key" to key),
        )
        val text = replay.bodyAsText()
        assertFalse(text.contains(token), "the manage token must not be returned to another customer")
        assertError(HttpStatusCode.Conflict, "CONFLICT", replay)

        // The genuine client's retry still replays (email compared case-insensitively).
        val retry = api.post(
            "${clinic.public}/bookings", body(clinic, start, "Jordan Casey", "Jordan.Casey@example.test", null),
            headers = mapOf("Idempotency-Key" to key),
        )
        assertStatus(HttpStatusCode.OK, retry)
        assertEquals(token, retry.obj().s("manageToken"))
    }

    @Test
    fun `an anonymous booking with someone else's email does not overwrite their name or phone`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val email = "${unique("victim")}@example.test"
        val first = api.post("${clinic.public}/bookings", body(clinic, "${wed}T10:00:00+01:00", "Jordan Casey", email, "+353 1 555 0100"))
        assertStatus(HttpStatusCode.Created, first)
        val bookingId = first.obj()["booking"]!!.s("id")
        val customerId = api.get("${clinic.base}/bookings/$bookingId", clinic.owner.token).obj()["customer"]!!.s("id")

        // A stranger books with the same email and their own phone number (e.g. to receive the reminder SMS).
        val second = api.post(
            "${clinic.public}/bookings", body(clinic, "${wed}T14:00:00+01:00", "Mallory Example", email, "+353 1 555 0199"),
        )
        assertStatus(HttpStatusCode.Created, second)
        val customer = api.get("${clinic.base}/customers/$customerId", clinic.owner.token).obj()
        assertEquals("Jordan Casey", customer.s("name"))
        assertEquals("+353 1 555 0100", customer.sOrNull("phone"))

        // The verified owner of the email may update their own details.
        val owner = TestUser(ie.bookanything.support.devToken(unique("dev_jordan"), email, "Jordan Casey"), email)
        val third = api.post(
            "${clinic.public}/bookings", body(clinic, "${wed}T15:00:00+01:00", "Jordan C. Casey", email, "+353 1 555 0111"), owner.token,
        )
        assertStatus(HttpStatusCode.Created, third)
        val updated = api.get("${clinic.base}/customers/$customerId", clinic.owner.token).obj()
        assertEquals("Jordan C. Casey", updated.s("name"))
        assertEquals("+353 1 555 0111", updated.sOrNull("phone"))
    }

    @Test
    fun `the manage link of a booking made with someone else's email does not show their name or phone`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val email = "${unique("victim")}@example.test"
        val owner = TestUser(ie.bookanything.support.devToken(unique("dev_jordan"), email, "Jordan Casey"), email)
        val own = api.post(
            "${clinic.public}/bookings", body(clinic, "${wed}T10:00:00+01:00", "Jordan Casey", email, "+353 1 555 0100"), owner.token,
        )
        assertStatus(HttpStatusCode.Created, own)
        val ownView = api.get("/v1/public/manage/${own.obj().s("manageToken")}").obj()["customer"]!!
        assertEquals("Jordan Casey", ownView.s("name"))
        assertEquals("+353 1 555 0100", ownView.sOrNull("phone"))

        // A stranger books with the same email: the booking joins Jordan's record, but its manage link shows only the email.
        val stranger = api.post("${clinic.public}/bookings", body(clinic, "${wed}T14:00:00+01:00", "Mallory Example", email, null))
        assertStatus(HttpStatusCode.Created, stranger)
        val text = api.get("/v1/public/manage/${stranger.obj().s("manageToken")}").bodyAsText()
        assertFalse(text.contains("Jordan") || text.contains("555 0100"), text)
        val view = api.get("/v1/public/manage/${stranger.obj().s("manageToken")}").obj()["customer"]!!
        assertNull(view.sOrNull("name"))
        assertNull(view.sOrNull("phone"))
        assertEquals(email, view.s("email"))
    }
}
