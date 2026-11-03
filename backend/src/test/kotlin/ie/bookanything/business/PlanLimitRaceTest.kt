package ie.bookanything.business

import ie.bookanything.support.Fixtures
import ie.bookanything.support.Money
import ie.bookanything.support.Roles
import ie.bookanything.support.TestUser
import ie.bookanything.support.arr
import ie.bookanything.support.assertError
import ie.bookanything.support.assertStatus
import ie.bookanything.support.createBusiness
import ie.bookanything.support.i
import ie.bookanything.support.jsonOf
import ie.bookanything.support.o
import ie.bookanything.support.obj
import ie.bookanything.support.parse
import ie.bookanything.support.race
import ie.bookanything.support.s
import ie.bookanything.support.testBusiness
import ie.bookanything.support.unique
import ie.bookanything.support.withApp
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.JsonObject
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The Free plan's limits under simultaneous requests: bookings racing for the month's last places, a retried booking
 * racing its own first request for the last one, and invitations and acceptances racing for the team's last seats.
 * Each request alone was checked; at once, every one of them counted the same free place. Wednesday 7 October 2026,
 * everyone works 09:00-17:00 Dublin time.
 */
class PlanLimitRaceTest {
    private val wed = "2026-10-07"
    private fun at(time: String) = "${wed}T$time:00+01:00"

    private val studio = testBusiness("Limit Studio") {
        val pat = person("Pat")
        val sam = person("Sam")
        val lee = person("Lee")
        service("Session", 30) { needs("Therapist", pat, sam, lee); every(30) }
    }

    /** [count] more bookings this month like [booking] (cancelled ones count towards the limit too). */
    private fun copies(booking: JsonObject, count: Int) = Fixtures.sql(
        """
        INSERT INTO bookings (business_id, reference, customer_id, service_id, start_at, end_at, status, currency, created_at)
        SELECT b.business_id, 'BA-R' || lpad(g::text, 5, '0'), b.customer_id, b.service_id, b.start_at, b.end_at,
               'cancelled', 'EUR', b.created_at
        FROM bookings b, generate_series(1, ?) g WHERE b.id = ?
        """.trimIndent(),
        count, UUID.fromString(Money.bookingId(booking)),
    )

    @Test
    fun `bookings racing for a Free business's last places in the month - only as many as are left get one`() = withApp { api ->
        val shop = api.createBusiness(studio)
        copies(Money.book(api, shop, "Session", at("09:00")), 96) // 97 taken, 3 places left
        // Six customers at six different times: they queue only for the shared therapists, after counting.
        val times = listOf("10:00", "10:30", "11:00", "11:30", "12:00", "12:30")
        val outcomes = race(times.size) { n -> api.post("${shop.public}/bookings", Money.bookingBody(shop, "Session", at(times[n]))) }
        assertEquals(3, outcomes.count { it.status == HttpStatusCode.Created }, outcomes.toString())
        val refused = outcomes.filter { it.status != HttpStatusCode.Created }
        assertTrue(refused.all { it.errorCode == "PLAN_LIMIT_REACHED" }, outcomes.toString())
        val usage = api.get("${shop.base}/billing", shop.owner.token).obj()["usage"]!!
        assertEquals(100, usage.i("bookingsThisMonth"))
        assertError(
            HttpStatusCode.Conflict, "PLAN_LIMIT_REACHED",
            api.post("${shop.public}/bookings", Money.bookingBody(shop, "Session", at("15:00"))),
        )
    }

    @Test
    fun `a booking retried while its first request takes the month's last place gets that booking`() = withApp { api ->
        val shop = api.createBusiness(studio)
        copies(Money.book(api, shop, "Session", at("09:00")), 98) // 99 taken, 1 place left
        val key = unique("last-place")
        val body = Money.bookingBody(shop, "Session", at("10:00"))
        val outcomes = race(4) { api.post("${shop.public}/bookings", body, headers = mapOf("Idempotency-Key" to key)) }
        assertEquals(1, outcomes.count { it.status == HttpStatusCode.Created }, outcomes.toString())
        assertEquals(3, outcomes.count { it.status == HttpStatusCode.OK }, outcomes.toString())
        val ids = outcomes.map { parse(it.body).o["booking"]!!.s("id") }.toSet()
        assertEquals(1, ids.size, outcomes.toString())
        assertEquals(100, api.get("${shop.base}/billing", shop.owner.token).obj()["usage"]!!.i("bookingsThisMonth"))
    }

    @Test
    fun `invitations racing for a Free team's last seats - only as many as are free are sent`() = withApp { api ->
        val shop = api.createBusiness(studio)
        // The owner holds one of three seats: two are free.
        val outcomes = race(4) { n ->
            api.post(
                "${shop.base}/team/invitations", jsonOf("email" to "${unique("seat$n")}@example.test", "role" to "staff"), shop.owner.token,
            )
        }
        assertEquals(2, outcomes.count { it.status == HttpStatusCode.Created }, outcomes.toString())
        val refused = outcomes.filter { it.status != HttpStatusCode.Created }
        assertTrue(refused.all { it.errorCode == "PLAN_LIMIT_REACHED" }, outcomes.toString())
        assertEquals(3, api.get("${shop.base}/team", shop.owner.token).arr().size)
    }

    @Test
    fun `invited people signing in at once take only the seats that are free`() = withApp { api ->
        val shop = api.createBusiness(studio)
        Roles.member(api, shop, "staff") // owner and staff: one seat free
        val invited = List(2) { TestUser.create("late", "Late Joiner") }
        val invitation = jsonOf("email" to invited[0].email, "role" to "staff")
        assertStatus(HttpStatusCode.Created, api.post("${shop.base}/team/invitations", invitation, shop.owner.token))
        // A second invitation past the seats, as a team keeps after moving down to the Free plan.
        Fixtures.sql(
            "INSERT INTO business_members (business_id, role, invited_email, status) VALUES (?, 'staff', ?, 'invited')",
            UUID.fromString(shop.id), invited[1].email,
        )
        race(2) { n -> api.get("/v1/me", invited[n].token) }
        val active = Fixtures.sqlOne(
            "SELECT count(*) FROM business_members WHERE business_id = ? AND status = 'active'", UUID.fromString(shop.id),
        ) { it.getInt(1) }
        assertEquals(3, active)
    }
}
