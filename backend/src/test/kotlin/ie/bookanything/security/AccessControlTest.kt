package ie.bookanything.security

import ie.bookanything.support.Api
import ie.bookanything.support.Clinic
import ie.bookanything.support.Fixtures
import ie.bookanything.support.Fixtures.book
import ie.bookanything.support.TestDatabase
import ie.bookanything.support.TestUser
import ie.bookanything.support.arr
import ie.bookanything.support.assertError
import ie.bookanything.support.assertStatus
import ie.bookanything.support.jsonOf
import ie.bookanything.support.o
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.sOrNull
import ie.bookanything.support.withApp
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.test.fail

class TenantIsolationTest {
    private suspend fun denied(res: HttpResponse) {
        if (res.status != HttpStatusCode.NotFound && res.status != HttpStatusCode.Forbidden) {
            fail(
                "Expected 404/403, got ${res.status}: ${res.bodyAsText()}",
            )
        }
    }

    @Test
    fun `members of business A cannot read or change business B`() = withApp { api ->
        val a = Fixtures.clinic(api)
        val b = Fixtures.clinic(api)
        val bBooking = book(api, b, "Consult", "2026-10-07T10:00:00+01:00")["booking"]!!.s("id")
        val bCustomer = api.get("${b.base}/bookings/$bBooking", b.owner.token).obj()["customer"]!!.s("id")
        val t = a.owner.token
        denied(api.get(b.base, t))
        denied(api.patch(b.base, jsonOf("name" to "Hijacked"), t))
        denied(api.delete(b.base, t))
        denied(api.get("${b.base}/overview", t))
        denied(api.get("${b.base}/services", t))
        denied(api.post("${b.base}/resources", jsonOf("kind" to "person", "name" to "Intruder"), t))
        denied(api.patch("${b.base}/resources/${b.resource("Alex")}", jsonOf("name" to "Renamed"), t))
        denied(api.put("${b.base}/resources/${b.resource("Alex")}/rules", jsonOf("rules" to emptyList<Any>()), t))
        denied(api.get("${b.base}/bookings", t))
        denied(api.get("${b.base}/bookings/$bBooking", t))
        denied(api.post("${b.base}/bookings/$bBooking/cancel", jsonOf("refund" to "none"), t))
        denied(api.get("${b.base}/customers", t))
        denied(api.get("${b.base}/customers/$bCustomer", t))
        denied(api.delete("${b.base}/customers/$bCustomer", t))
        denied(api.get("${b.base}/team", t))
        denied(api.post("${b.base}/team/invitations", jsonOf("email" to "x@example.test", "role" to "admin"), t))
        denied(api.get("${b.base}/reports/summary?from=2026-10-01&to=2026-10-31", t))
        denied(api.get("${b.base}/audit", t))
        denied(api.get("${b.base}/billing", t))
        // Cross-tenant ids inside A's own routes are not found either.
        denied(api.get("${a.base}/bookings/$bBooking", t))
        denied(api.get("${a.base}/customers/$bCustomer", t))
        denied(api.patch("${a.base}/resources/${b.resource("Alex")}", jsonOf("name" to "Renamed"), t))
        val svc = api.post(
            "${a.base}/services",
            jsonOf(
                "name" to "Sneaky", "durationMinutes" to 30,
                "requirements" to listOf(mapOf("label" to "X", "resourceIds" to listOf(b.resource("Alex")))),
            ),
            t,
        )
        assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", svc)
        // B is untouched.
        assertEquals("Alex", api.get("${b.base}/resources", b.owner.token).arr().first { it.s("id") == b.resource("Alex") }.s("name"))
        assertEquals("confirmed", api.get("${b.base}/bookings/$bBooking", b.owner.token).obj().s("status"))
    }

    @Test
    fun `signed-out users and non-members get no dashboard access`() = withApp { api ->
        val a = Fixtures.clinic(api)
        assertError(HttpStatusCode.Unauthorized, "UNAUTHENTICATED", api.get(a.base))
        assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.get(a.base, TestUser.create("stranger").token))
        assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.get("/v1/businesses/${UUID.randomUUID()}", a.owner.token))
    }

    @Test
    fun `row level security hides other tenants for a non-superuser role`() = withApp { api ->
        val a = Fixtures.clinic(api)
        val b = Fixtures.clinic(api)
        book(api, a, "Consult", "2026-10-07T10:00:00+01:00")
        book(api, b, "Consult", "2026-10-07T10:00:00+01:00")
        TestDatabase.dataSource.connection.use { c ->
            c.createStatement().use { st ->
                st.execute(
                    "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rls_probe') THEN CREATE ROLE rls_probe NOLOGIN; " +
                        "END IF; END $$",
                )
                st.execute("GRANT SELECT ON ALL TABLES IN SCHEMA public TO rls_probe")
            }
            c.autoCommit = false
            c.createStatement().use { st ->
                st.execute("SET LOCAL ROLE rls_probe")
                st.execute("SELECT set_config('app.business_id', '${a.id}', true)")
                st.executeQuery("SELECT DISTINCT business_id::text FROM bookings").use { rs ->
                    val seen = generateSequence { if (rs.next()) rs.getString(1) else null }.toList()
                    assertEquals(listOf(a.id), seen)
                }
                st.executeQuery(
                    "SELECT count(*) FROM resources WHERE business_id = '${b.id}'",
                ).use { rs -> rs.next(); assertEquals(0, rs.getInt(1)) }
            }
            c.rollback()
            c.autoCommit = true
        }
    }
}

class StaffScopingTest {
    private data class Setup(val clinic: Clinic, val staff: TestUser, val alexBooking: String, val blakeBooking: String)

    private suspend fun setup(api: Api): Setup {
        val clinic = Fixtures.clinic(api)
        val staff = TestUser.create("staff", "Sam Staff")
        val invite = api.post(
            "${clinic.base}/team/invitations",
            jsonOf("email" to staff.email, "role" to "staff", "resourceId" to clinic.resource("Alex")), clinic.owner.token,
        )
        assertStatus(HttpStatusCode.Created, invite)
        val me = api.get("/v1/me", staff.token).obj()
        assertEquals(listOf(clinic.id), me["memberships"]!!.jsonArray.map { it.s("businessId") })
        val alex = book(api, clinic, "Paid consult", "2026-10-07T10:00:00+01:00", resourceId = clinic.resource("Alex"))
        val blake = book(api, clinic, "Paid consult", "2026-10-07T14:00:00+01:00", resourceId = clinic.resource("Blake"))
        return Setup(clinic, staff, alex["booking"]!!.s("id"), blake["booking"]!!.s("id"))
    }

    @Test
    fun `staff see only bookings, customers and calendars of their linked resources`() = withApp { api ->
        val (clinic, staff, alexBooking, blakeBooking) = setup(api)
        val t = staff.token
        val list = api.get(
            "${clinic.base}/bookings?from=2026-10-01&to=2026-10-31&status=held", t,
        ).obj()["items"]!!.jsonArray.map { it.s("id") }
        assertEquals(listOf(alexBooking), list)
        val ownerList = api.get(
            "${clinic.base}/bookings?from=2026-10-01&to=2026-10-31&status=held", clinic.owner.token,
        ).obj()["items"]!!.jsonArray
        assertEquals(2, ownerList.size)
        assertStatus(HttpStatusCode.OK, api.get("${clinic.base}/bookings/$alexBooking", t))
        assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.get("${clinic.base}/bookings/$blakeBooking", t))
        assertError(
            HttpStatusCode.NotFound, "NOT_FOUND", api.post("${clinic.base}/bookings/$blakeBooking/cancel", jsonOf("refund" to "none"), t),
        )
        assertEquals(listOf(clinic.resource("Alex")), api.get("${clinic.base}/resources", t).arr().map { it.s("id") })
        val blakeCustomer = api.get("${clinic.base}/bookings/$blakeBooking", clinic.owner.token).obj()["customer"]!!.s("id")
        assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.get("${clinic.base}/customers/$blakeCustomer", t))
        assertTrue(api.get("${clinic.base}/customers", t).obj()["items"]!!.jsonArray.none { it.s("id") == blakeCustomer })

        // Own calendar: allowed. Someone else's: forbidden.
        assertStatus(HttpStatusCode.OK, api.get("${clinic.base}/resources/${clinic.resource("Alex")}/availability", t))
        assertError(HttpStatusCode.Forbidden, "FORBIDDEN", api.get("${clinic.base}/resources/${clinic.resource("Blake")}/availability", t))
        assertError(
            HttpStatusCode.Forbidden, "FORBIDDEN",
            api.post(
                "${clinic.base}/resources/${clinic.resource("Blake")}/overrides",
                jsonOf("date" to "2026-10-09", "isAvailable" to false), t,
            ),
        )
        val own = api.post(
            "${clinic.base}/resources/${clinic.resource("Alex")}/overrides",
            jsonOf("date" to "2026-10-09", "isAvailable" to false, "reason" to "Course"), t,
        )
        assertStatus(HttpStatusCode.Created, own)
        assertStatus(HttpStatusCode.NoContent, api.delete("${clinic.base}/overrides/${own.obj().s("id")}", t))

        // Admin-only areas.
        assertError(HttpStatusCode.Forbidden, "FORBIDDEN", api.get("${clinic.base}/reports/summary?from=2026-10-01&to=2026-10-31", t))
        assertError(
            HttpStatusCode.Forbidden, "FORBIDDEN", api.post("${clinic.base}/services", jsonOf("name" to "X", "durationMinutes" to 30), t),
        )
        assertError(HttpStatusCode.Forbidden, "FORBIDDEN", api.patch(clinic.base, jsonOf("name" to "Staff rename"), t))
        assertError(
            HttpStatusCode.Forbidden, "FORBIDDEN",
            api.post("${clinic.base}/closures", jsonOf("date" to "2026-12-25", "isAvailable" to false), t),
        )
        assertError(HttpStatusCode.Forbidden, "FORBIDDEN", api.get("${clinic.base}/payments/status", t))
    }

    @Test
    fun `staff cannot book a customer they cannot see`() = withApp { api ->
        val (clinic, staff, _, blakeBooking) = setup(api)
        val blakeCustomer = api.get("${clinic.base}/bookings/$blakeBooking", clinic.owner.token).obj()["customer"]!!.s("id")
        assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.get("${clinic.base}/customers/$blakeCustomer", staff.token))
        val body = jsonOf(
            "serviceId" to clinic.service("Paid consult"), "start" to "2026-10-08T09:00:00+01:00", "customerId" to blakeCustomer,
            "answers" to emptyMap<String, String>(), "paymentMode" to "at_venue", "notifyCustomer" to false,
        )
        assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.post("${clinic.base}/bookings", body, staff.token))
        // Booking them would have made them (notes included) the staff member's customer.
        assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.get("${clinic.base}/customers/$blakeCustomer", staff.token))

        // "New" customer details with that customer's email would book them too (customers are reused by email).
        val blakeEmail = api.get("${clinic.base}/bookings/$blakeBooking", clinic.owner.token).obj()["customer"]!!.s("email")
        fun newCustomer(email: String) = jsonOf(
            "serviceId" to clinic.service("Paid consult"), "start" to "2026-10-08T11:00:00+01:00",
            "customer" to mapOf("name" to "Someone New", "email" to email.uppercase()), "answers" to emptyMap<String, String>(),
            "paymentMode" to "at_venue", "notifyCustomer" to false,
        )
        val sameEmail = api.post("${clinic.base}/bookings", newCustomer(blakeEmail), staff.token)
        assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", sameEmail)
        assertTrue("customer.email" in sameEmail.obj()["error"]!!.o["fields"]!!.o)
        assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.get("${clinic.base}/customers/$blakeCustomer", staff.token))
        // A customer the staff member can see (here, one with no bookings yet) may be booked by email.
        val fresh = api.post(
            "${clinic.base}/customers", jsonOf("name" to "Fresh Customer", "email" to "fresh.customer@example.test"), clinic.owner.token,
        )
        assertStatus(HttpStatusCode.Created, fresh)
        val byEmail = api.post("${clinic.base}/bookings", newCustomer("fresh.customer@example.test"), staff.token)
        assertStatus(HttpStatusCode.Created, byEmail)
        assertEquals(fresh.obj().s("id"), byEmail.obj()["customer"]!!.s("id"))

        // Owners and admins book any customer.
        assertStatus(HttpStatusCode.Created, api.post("${clinic.base}/bookings", body, clinic.owner.token))
    }

    @Test
    fun `staff with other linked resources see and book a service on the ones it can use`() = withApp { api ->
        val (clinic, staff, _, _) = setup(api)
        val owner = clinic.owner.token
        val memberId = api.get("${clinic.base}/resources", owner).arr().first { it.s("id") == clinic.resource("Alex") }.s("memberId")
        // The studio (only used by classes) and a deactivated room are also the staff member's.
        val studio = clinic.resource("Studio")
        assertStatus(HttpStatusCode.OK, api.patch("${clinic.base}/resources/$studio", jsonOf("memberId" to memberId), owner))
        val oldRoom = api.post("${clinic.base}/resources", jsonOf("kind" to "space", "name" to "Old room", "memberId" to memberId), owner)
        assertStatus(HttpStatusCode.Created, oldRoom)
        val oldRoomId = oldRoom.obj().s("id")
        assertStatus(HttpStatusCode.OK, api.patch("${clinic.base}/resources/$oldRoomId", jsonOf("isActive" to false), owner))
        val mine = api.get("${clinic.base}/resources", staff.token).arr().map { it.s("id") }.toSet()
        assertEquals(setOf(clinic.resource("Alex"), studio), mine, "a deactivated resource is no longer anyone's calendar")

        val paidConsult = clinic.service("Paid consult")
        val free = api.get("${clinic.base}/availability?serviceId=$paidConsult&from=2026-10-08&to=2026-10-08", staff.token)
        assertStatus(HttpStatusCode.OK, free)
        val slots = free.obj()["days"]!!.jsonArray.flatMap { d -> d.o["slots"]!!.jsonArray }
        val alexOnly = listOf(clinic.resource("Alex"))
        assertTrue(slots.isNotEmpty() && slots.all { s -> s.o["resourceIds"]!!.jsonArray.map { it.jsonPrimitive.content } == alexOnly })
        val body = jsonOf(
            "serviceId" to paidConsult, "start" to "2026-10-08T09:00:00+01:00",
            "customer" to mapOf("name" to "Walk In"), "answers" to emptyMap<String, String>(), "paymentMode" to "at_venue",
        )
        val created = api.post("${clinic.base}/bookings", body, staff.token)
        assertStatus(HttpStatusCode.Created, created)
        assertEquals(listOf(clinic.resource("Alex")), created.obj()["resources"]!!.jsonArray.map { it.s("id") })
        // A service none of their resources can serve is still refused.
        val buffered = clinic.service("Buffered")
        assertError(
            HttpStatusCode.Forbidden, "FORBIDDEN",
            api.get("${clinic.base}/availability?serviceId=$buffered&from=2026-10-08&to=2026-10-08", staff.token),
        )
        val blakeOnly = body.replace(paidConsult, buffered).replace("09:00:00", "14:00:00")
        assertError(HttpStatusCode.Forbidden, "FORBIDDEN", api.post("${clinic.base}/bookings", blakeOnly, staff.token))
    }

    @Test
    fun `staff can create bookings only on their own resources`() = withApp { api ->
        val (clinic, staff, _, _) = setup(api)
        fun body(resourceIds: List<String>?, start: String) = jsonOf(
            "serviceId" to clinic.service("Paid consult"), "optionId" to null, "addonIds" to emptyList<String>(), "groupId" to null,
            "resourceIds" to resourceIds, "start" to start, "customerId" to null,
            "customer" to mapOf("name" to "Walk In", "email" to null, "phone" to null), "answers" to emptyMap<String, String>(),
            "internalNotes" to "Phoned in", "paymentMode" to "at_venue", "notifyCustomer" to false,
        )
        val ok = api.post("${clinic.base}/bookings", body(null, "2026-10-08T09:00:00+01:00"), staff.token)
        assertStatus(HttpStatusCode.Created, ok)
        val created = ok.obj()
        assertEquals("confirmed", created.s("status"))
        assertEquals("pay_at_venue", created.s("paymentStatus"))
        assertEquals("dashboard", created.s("source"))
        assertEquals(listOf(clinic.resource("Alex")), created["resources"]!!.jsonArray.map { it.s("id") })
        assertError(
            HttpStatusCode.Forbidden, "FORBIDDEN",
            api.post("${clinic.base}/bookings", body(listOf(clinic.resource("Blake")), "2026-10-08T14:00:00+01:00"), staff.token),
        )
        // Staff (dashboard) bookings may be made at short notice: 30 minutes from now is fine.
        val soon = api.post("${clinic.base}/bookings", body(null, "2026-10-05T10:00:00+01:00"), staff.token)
        assertStatus(HttpStatusCode.Created, soon)
        // Status changes only once started.
        assertError(
            HttpStatusCode.Conflict, "POLICY_VIOLATION",
            api.post("${clinic.base}/bookings/${created.s("id")}/status", jsonOf("status" to "no_show"), staff.token),
        )
        assertError(
            HttpStatusCode.BadRequest, "INVALID_REQUEST",
            api.post("${clinic.base}/bookings/${created.s("id")}/status", jsonOf("status" to "confirmed"), staff.token),
        )
        val patched = api.patch(
            "${clinic.base}/bookings/${created.s("id")}", jsonOf("internalNotes" to "Bring referral letter"), staff.token,
        ).obj()
        assertEquals("Bring referral letter", patched.sOrNull("internalNotes"))
        // Staff reschedule keeps the booking on their own calendar.
        val moved = api.post(
            "${clinic.base}/bookings/${created.s("id")}/reschedule", jsonOf("start" to "2026-10-08T11:00:00+01:00"), staff.token,
        )
        assertStatus(HttpStatusCode.OK, moved)
        assertEquals(listOf(clinic.resource("Alex")), moved.obj()["resources"]!!.jsonArray.map { it.o.s("id") })
        // An empty resource list is no way onto someone else's calendar: Alex is busy at 14:00, Blake is free.
        val alexBusy = api.post(
            "${clinic.base}/bookings", body(listOf(clinic.resource("Alex")), "2026-10-08T14:00:00+01:00"), clinic.owner.token,
        )
        assertStatus(HttpStatusCode.Created, alexBusy)
        val ontoBlake = api.post(
            "${clinic.base}/bookings/${created.s("id")}/reschedule",
            jsonOf("start" to "2026-10-08T14:00:00+01:00", "resourceIds" to emptyList<String>()), staff.token,
        )
        assertError(HttpStatusCode.Conflict, "SLOT_UNAVAILABLE", ontoBlake)
        val after = api.get("${clinic.base}/bookings/${created.s("id")}", clinic.owner.token).obj()
        assertEquals(listOf(clinic.resource("Alex")), after["resources"]!!.jsonArray.map { it.o.s("id") })
    }
}
