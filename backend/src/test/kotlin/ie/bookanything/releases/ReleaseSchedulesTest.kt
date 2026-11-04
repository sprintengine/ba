package ie.bookanything.releases

import ie.bookanything.support.Api
import ie.bookanything.support.Clinic
import ie.bookanything.support.DEFAULT_NOW
import ie.bookanything.support.Fixtures
import ie.bookanything.support.TestEnv
import ie.bookanything.support.a
import ie.bookanything.support.arr
import ie.bookanything.support.assertError
import ie.bookanything.support.assertStatus
import ie.bookanything.support.createBusiness
import ie.bookanything.support.jsonOf
import ie.bookanything.support.o
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.testBusiness
import ie.bookanything.support.weekdays
import ie.bookanything.support.withApp
import io.ktor.client.statement.HttpResponse
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonPrimitive
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Release schedules end to end (docs/architecture.md section 21). The clock starts on Monday 5 October 2026 at 09:00 in
 * Dublin; the practice's doctor works weekday mornings for private and GMS patients.
 */
class ReleaseSchedulesTest {
    private val env = TestEnv()

    /** A fresh setup each time (its own web address). */
    private fun practice() = testBusiness("Oakfield Practice") {
        val gms = group("GMS", restricted = true)
        val private = group("Private")
        val doctor = person("Dr Morgan", weekdays("09:00", "13:00", listOf(private, gms)))
        service("GP consultation", 15) { needs("Doctor", doctor) }
        service("Blood test", 15) { needs("Doctor", doctor) }
    }

    private fun scheduleBody(
        clinic: Clinic, name: String = "GMS next-day", services: List<String> = listOf("GP consultation"),
        groups: List<String>? = listOf("GMS"),
        cadence: String = "daily", time: String = "17:00", daysBefore: Int? = 1, weekdaysOnly: Boolean = false, weekday: Int? = null,
        weeksAhead: Int? = null, active: Boolean = true,
    ) = jsonOf(
        "name" to name, "serviceIds" to services.map { clinic.service(it) }, "everyone" to (groups == null),
        "groupIds" to groups.orEmpty().map { clinic.groups.getValue(it) }, "cadence" to cadence, "time" to time,
        "daysBefore" to daysBefore, "weekdaysOnly" to weekdaysOnly, "weekday" to weekday, "weeksAhead" to weeksAhead, "active" to active,
    )

    private suspend fun create(api: Api, clinic: Clinic, body: String = scheduleBody(clinic)): JsonObject {
        val res = api.post("${clinic.base}/release-schedules", body, clinic.owner.token)
        assertStatus(HttpStatusCode.Created, res)
        return res.obj()
    }

    /** The public availability days for [service] as [group], by date. */
    private suspend fun days(
        api: Api, clinic: Clinic, service: String, group: String?, from: String, to: String = from,
    ): Map<String, JsonObject> {
        val groupParam = group?.let { "&groupId=${clinic.groups.getValue(it)}" }.orEmpty()
        val res = api.get("${clinic.public}/availability?serviceId=${clinic.service(service)}&from=$from&to=$to$groupParam")
        assertStatus(HttpStatusCode.OK, res)
        return res.obj()["days"]!!.a.associate { it.o.s("date") to it.o }
    }

    /** One day of GP consultations as a GMS patient sees it. */
    private suspend fun gpGms(api: Api, clinic: Clinic, date: String) = days(api, clinic, "GP consultation", "GMS", date).getValue(date)

    private suspend fun fieldError(res: HttpResponse, field: String) =
        res.obj()["error"]!!.o["fields"]!!.o.s(field)

    private fun JsonObject.slotCount() = this["slots"]!!.a.size
    private fun JsonObject.opensAt() = this["opensAt"].takeIf { it != JsonNull }?.jsonPrimitive?.content
    private fun JsonObject.held() = this["held"]!!.jsonPrimitive.boolean

    private suspend fun bookGms(api: Api, clinic: Clinic, start: String) = api.post(
        "${clinic.public}/bookings", Fixtures.bookingBody(clinic, "GP consultation", start, groupId = clinic.groups.getValue("GMS")),
    )

    @Test
    fun `customers can't see or book a day before it opens, and staff still can`() = withApp(env) { api ->
        val clinic = api.createBusiness(practice())
        create(api, clinic)

        val gms = days(api, clinic, "GP consultation", "GMS", "2026-10-05", "2026-10-07")
        assertTrue(gms.getValue("2026-10-05").slotCount() > 0, "today opened yesterday")
        assertEquals(null, gms.getValue("2026-10-05").opensAt())
        assertEquals(0, gms.getValue("2026-10-06").slotCount())
        assertEquals("2026-10-05T17:00:00+01:00", gms.getValue("2026-10-06").opensAt())
        assertEquals(false, gms.getValue("2026-10-06").held())
        assertEquals("2026-10-06T17:00:00+01:00", gms.getValue("2026-10-07").opensAt())
        // Saturday has no hours: nothing to open, so no time is given.
        assertEquals(null, days(api, clinic, "GP consultation", "GMS", "2026-10-10").getValue("2026-10-10").opensAt())

        // Private patients and blood tests aren't in the schedule.
        assertTrue(days(api, clinic, "GP consultation", "Private", "2026-10-06").getValue("2026-10-06").slotCount() > 0)
        assertTrue(days(api, clinic, "Blood test", "GMS", "2026-10-06").getValue("2026-10-06").slotCount() > 0)

        // Booking a locked time through the API is refused; the dashboard can book it.
        assertError(HttpStatusCode.Conflict, "SLOT_UNAVAILABLE", bookGms(api, clinic, "2026-10-06T10:00:00+01:00"))
        val staffSlots = api.get(
            "${clinic.base}/availability?serviceId=${clinic.service("GP consultation")}&from=2026-10-06&to=2026-10-06" +
                "&groupId=${clinic.groups.getValue("GMS")}",
            clinic.owner.token,
        ).obj()["days"]!!.a.single().o
        assertTrue(staffSlots.slotCount() > 0)
        assertEquals(null, staffSlots.opensAt())

        // At 17:00 Tuesday opens.
        env.clock.instant = Instant.parse("2026-10-05T16:00:00Z")
        assertTrue(days(api, clinic, "GP consultation", "GMS", "2026-10-06").getValue("2026-10-06").slotCount() > 0)
        assertStatus(HttpStatusCode.Created, bookGms(api, clinic, "2026-10-06T10:00:00+01:00"))
    }

    @Test
    fun `one release can be moved, held, opened now and put back`() = withApp(env) { api ->
        val clinic = api.createBusiness(practice())
        val id = create(api, clinic).s("id")
        val tuesday = "${clinic.base}/release-schedules/$id/changes/2026-10-06"

        val moved = api.put(tuesday, jsonOf("action" to "move", "opensAt" to "2026-10-05T22:00:00+01:00"), clinic.owner.token)
        assertStatus(HttpStatusCode.OK, moved)
        val day = moved.obj()["schedules"]!!.a.single().o["days"]!!.a.single().o
        assertEquals("moved", day.s("state"))
        assertEquals("2026-10-05T17:00:00+01:00", day.s("scheduledAt"))
        assertEquals("2026-10-05T22:00:00+01:00", day.s("opensAt"))
        assertEquals("Olive Owner", day.s("changedBy"))
        assertEquals("2026-10-05T22:00:00+01:00", gpGms(api, clinic, "2026-10-06").opensAt())

        assertStatus(HttpStatusCode.OK, api.put(tuesday, jsonOf("action" to "hold"), clinic.owner.token))
        val held = days(api, clinic, "GP consultation", "GMS", "2026-10-06").getValue("2026-10-06")
        assertEquals(true, held.held())
        assertEquals(null, held.opensAt())
        assertEquals(0, held.slotCount())

        val opened = api.put(tuesday, jsonOf("action" to "open_now"), clinic.owner.token).obj()
        assertEquals("open", opened["schedules"]!!.a.single().o["days"]!!.a.single().o.s("state"))
        assertTrue(days(api, clinic, "GP consultation", "GMS", "2026-10-06").getValue("2026-10-06").slotCount() > 0)

        val reset = api.delete(tuesday, clinic.owner.token)
        assertStatus(HttpStatusCode.OK, reset)
        assertEquals("scheduled", reset.obj()["schedules"]!!.a.single().o["days"]!!.a.single().o.s("state"))
        assertEquals("2026-10-05T17:00:00+01:00", gpGms(api, clinic, "2026-10-06").opensAt())

        val audit = Fixtures.sqlAll("SELECT action FROM audit_events WHERE entity_id = ?::uuid ORDER BY occurred_at, action", id)
        assertEquals(
            listOf("release.hold", "release.move", "release.open_now", "release.reset", "release_schedule.created"), audit.sorted(),
        )
    }

    @Test
    fun `changes are refused for past days, without a time, or after the day ends`() = withApp(env) { api ->
        val clinic = api.createBusiness(practice())
        val id = create(api, clinic).s("id")
        val base = "${clinic.base}/release-schedules/$id/changes"
        assertError(
            HttpStatusCode.BadRequest, "INVALID_REQUEST",
            api.put("$base/2026-10-02", jsonOf("action" to "open_now"), clinic.owner.token),
        )
        val noTime = api.put("$base/2026-10-06", jsonOf("action" to "move"), clinic.owner.token)
        assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", noTime)
        assertError(
            HttpStatusCode.BadRequest, "INVALID_REQUEST",
            api.put("$base/2026-10-06", jsonOf("action" to "move", "opensAt" to "2026-10-07T00:00:00+01:00"), clinic.owner.token),
        )
        val badAction = api.put("$base/2026-10-06", jsonOf("action" to "wait"), clinic.owner.token)
        assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", badAction)
        assertError(
            HttpStatusCode.BadRequest, "INVALID_REQUEST",
            api.put("$base/2026-10-06", jsonOf("action" to "hold", "scope" to "month"), clinic.owner.token),
        )
        val badDate = api.put("$base/tomorrow", jsonOf("action" to "hold"), clinic.owner.token)
        assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", badDate)
        assertError(
            HttpStatusCode.NotFound, "NOT_FOUND",
            api.put(
                "${clinic.base}/release-schedules/00000000-0000-0000-0000-000000000000/changes/2026-10-06", jsonOf("action" to "hold"),
                clinic.owner.token,
            ),
        )
    }

    @Test
    fun `a week-by-week schedule opens the whole week, and a change covers the release or one day`() = withApp(env) { api ->
        val clinic = api.createBusiness(practice())
        val weekly = scheduleBody(clinic, cadence = "weekly", daysBefore = null, weekday = 5, time = "22:00", weeksAhead = 1)
        val id = create(api, clinic, weekly).s("id")
        val next = days(api, clinic, "GP consultation", "GMS", "2026-10-12", "2026-10-16")
        next.values.forEach { assertEquals("2026-10-09T22:00:00+01:00", it.opensAt()) }
        assertTrue(gpGms(api, clinic, "2026-10-07").slotCount() > 0, "this week is open")

        // Opening the release opens all seven days; one day can be held on its own.
        val changes = "${clinic.base}/release-schedules/$id/changes"
        val week = api.put("$changes/2026-10-14", jsonOf("action" to "open_now"), clinic.owner.token).obj()
        assertEquals((12..18).map { "2026-10-$it" }, week["schedules"]!!.a.single().o["days"]!!.a.map { it.o.s("date") })
        api.put("$changes/2026-10-15", jsonOf("action" to "hold", "scope" to "day"), clinic.owner.token)
        val after = days(api, clinic, "GP consultation", "GMS", "2026-10-12", "2026-10-16")
        assertTrue(after.getValue("2026-10-14").slotCount() > 0)
        assertEquals(true, after.getValue("2026-10-15").held())
        assertTrue(after.getValue("2026-10-16").slotCount() > 0)
    }

    @Test
    fun `schedules can't overlap and must name the business's services and groups`() = withApp(env) { api ->
        val clinic = api.createBusiness(practice())
        create(api, clinic)
        val schedules = "${clinic.base}/release-schedules"
        val everyone = api.post(schedules, scheduleBody(clinic, "All", groups = null), clinic.owner.token)
        assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", everyone)
        assertEquals("GP consultation is already in “GMS next-day” for some groups", fieldError(everyone, "serviceIds"))
        val both = scheduleBody(clinic, "Both", services = listOf("Blood test", "GP consultation"))
        val sameGroup = api.post(schedules, both, clinic.owner.token)
        assertEquals("GP consultation for GMS is already in “GMS next-day”", fieldError(sameGroup, "serviceIds"))
        // Another group, or another service, is fine.
        val privateWeek = scheduleBody(
            clinic, "Private week", groups = listOf("Private"), cadence = "weekly", daysBefore = null, weekday = 5, weeksAhead = 1,
        )
        create(api, clinic, privateWeek)
        create(api, clinic, scheduleBody(clinic, "Bloods", services = listOf("Blood test"), groups = listOf("GMS")))
        // ...and an everyone schedule on a service with others is refused the other way round.
        val allBloodsBody = scheduleBody(clinic, "All bloods", services = listOf("Blood test"), groups = null)
        val allBloods = api.post(schedules, allBloodsBody, clinic.owner.token)
        assertEquals("Blood test is already in “Bloods” for some groups", fieldError(allBloods, "serviceIds"))

        val other = api.createBusiness(practice())
        val foreign = jsonOf(
            "name" to "Foreign", "serviceIds" to listOf(other.service("GP consultation")), "cadence" to "daily", "time" to "17:00",
            "daysBefore" to 1,
        )
        assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", api.post(schedules, foreign, clinic.owner.token))
        val fields = api.post(
            schedules,
            jsonOf("name" to "", "serviceIds" to emptyList<String>(), "everyone" to false, "cadence" to "weekly", "time" to "25:00"),
            clinic.owner.token,
        ).obj()["error"]!!.o["fields"]!!.o.keys
        assertEquals(setOf("name", "serviceIds", "groupIds", "time", "weekday", "weeksAhead"), fields)
        val late = scheduleBody(clinic, "Late", services = listOf("Blood test"), groups = listOf("Private"), daysBefore = 15)
        val daily = api.post(schedules, late, clinic.owner.token)
        assertEquals(setOf("daysBefore"), daily.obj()["error"]!!.o["fields"]!!.o.keys)
    }

    @Test
    fun `changing a schedule's time never closes a day that is already open`() = withApp(env) { api ->
        val clinic = api.createBusiness(practice())
        val id = create(api, clinic).s("id")
        // Monday 18:00: Tuesday opened at 17:00.
        env.clock.instant = Instant.parse("2026-10-05T17:00:00Z")
        assertTrue(days(api, clinic, "GP consultation", "GMS", "2026-10-06").getValue("2026-10-06").slotCount() > 0)

        val res = api.put("${clinic.base}/release-schedules/$id", scheduleBody(clinic, time = "22:00"), clinic.owner.token)
        assertStatus(HttpStatusCode.OK, res)
        assertEquals("22:00", res.obj().s("time"))
        val after = days(api, clinic, "GP consultation", "GMS", "2026-10-06", "2026-10-07")
        assertTrue(after.getValue("2026-10-06").slotCount() > 0, "Tuesday stays open")
        assertEquals("2026-10-06T22:00:00+01:00", after.getValue("2026-10-07").opensAt())

        val releases = api.get("${clinic.base}/releases?from=2026-10-06&to=2026-10-07", clinic.owner.token).obj()["schedules"]!!.a
            .single().o
        val (tuesday, wednesday) = releases["days"]!!.a.map { it.o }
        assertEquals("open", tuesday.s("state"))
        assertEquals(true, tuesday["changed"]!!.jsonPrimitive.boolean)
        assertEquals("2026-10-05T17:00:00+01:00", tuesday.s("opensAt"))
        assertEquals("scheduled", wednesday.s("state"))
    }

    @Test
    fun `the releases list says what each release opens`() = withApp(env) { api ->
        val clinic = api.createBusiness(practice())
        create(api, clinic)
        create(api, clinic, scheduleBody(clinic, "Paused", services = listOf("Blood test"), active = false))
        val res = api.get("${clinic.base}/releases?from=2026-10-05&to=2026-10-10", clinic.owner.token)
        assertStatus(HttpStatusCode.OK, res)
        val body = res.obj()
        assertEquals("Europe/Dublin", body.s("timezone"))
        val schedule = body["schedules"]!!.a.single().o
        assertEquals("GMS next-day", schedule.s("name"))
        val byDate = schedule["days"]!!.a.associate { it.o.s("date") to it.o }
        assertEquals("open", byDate.getValue("2026-10-05").s("state"))
        assertEquals("scheduled", byDate.getValue("2026-10-06").s("state"))
        // 09:00–13:00 in 15-minute steps: 16 times a day, counted whether the day has opened or not.
        assertEquals(16, byDate.getValue("2026-10-05")["times"]!!.jsonPrimitive.int)
        assertEquals(16, byDate.getValue("2026-10-06")["times"]!!.jsonPrimitive.int)
        assertEquals(0, byDate.getValue("2026-10-10")["times"]!!.jsonPrimitive.int, "Saturday")
        // A booked time is no longer free.
        env.clock.instant = Instant.parse("2026-10-05T16:00:00Z")
        assertStatus(HttpStatusCode.Created, bookGms(api, clinic, "2026-10-06T10:00:00+01:00"))
        val tuesday = api.get("${clinic.base}/releases?from=2026-10-06&to=2026-10-06", clinic.owner.token).obj()["schedules"]!!.a.single()
            .o["days"]!!.a.single().o
        assertEquals(15, tuesday["times"]!!.jsonPrimitive.int)
        val tooLong = api.get("${clinic.base}/releases?from=2026-10-05&to=2026-11-30", clinic.owner.token)
        assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", tooLong)
        val all = api.get("${clinic.base}/release-schedules", clinic.owner.token).arr()
        assertEquals(listOf("active", "paused"), all.map { it.s("status") })
    }

    @Test
    fun `a group a schedule names is deactivated, not deleted, so the schedule keeps closing its days`() = withApp(env) { api ->
        val clinic = api.createBusiness(practice())
        create(api, clinic)
        val gms = clinic.groups.getValue("GMS")
        assertStatus(HttpStatusCode.NoContent, api.delete("${clinic.base}/customer-groups/$gms", clinic.owner.token))
        val group = api.get("${clinic.base}/customer-groups", clinic.owner.token).arr().single { it.s("id") == gms }
        assertEquals(false, group.o["isActive"]!!.jsonPrimitive.boolean)
        val schedule = api.get("${clinic.base}/release-schedules", clinic.owner.token).arr().single()
        assertEquals(listOf(gms), schedule.o["groupIds"]!!.a.map { it.jsonPrimitive.content })
    }

    @Test
    fun `paused and deleted schedules close nothing`() = withApp(env) { api ->
        val clinic = api.createBusiness(practice())
        val id = create(api, clinic, scheduleBody(clinic, active = false)).s("id")
        assertTrue(days(api, clinic, "GP consultation", "GMS", "2026-10-06").getValue("2026-10-06").slotCount() > 0)
        api.put("${clinic.base}/release-schedules/$id", scheduleBody(clinic), clinic.owner.token)
        assertEquals(0, days(api, clinic, "GP consultation", "GMS", "2026-10-06").getValue("2026-10-06").slotCount())
        assertStatus(HttpStatusCode.NoContent, api.delete("${clinic.base}/release-schedules/$id", clinic.owner.token))
        assertTrue(days(api, clinic, "GP consultation", "GMS", "2026-10-06").getValue("2026-10-06").slotCount() > 0)
        assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.delete("${clinic.base}/release-schedules/$id", clinic.owner.token))
    }

    @Test
    fun `customers can't move a booking into a day that hasn't opened`() = withApp(env) { api ->
        val clinic = api.createBusiness(practice())
        val booked = bookGms(api, clinic, "2026-10-07T10:00:00+01:00")
        assertStatus(HttpStatusCode.Created, booked)
        val token = booked.obj().s("manageToken")
        create(api, clinic)

        val thursday = api.get("/v1/public/manage/$token/availability?from=2026-10-08&to=2026-10-08").obj()["days"]!!.a.single().o
        assertEquals(0, thursday.slotCount())
        assertEquals("2026-10-07T17:00:00+01:00", thursday.opensAt())
        assertError(
            HttpStatusCode.Conflict, "SLOT_UNAVAILABLE",
            api.post("/v1/public/manage/$token/reschedule", jsonOf("start" to "2026-10-08T10:00:00+01:00")),
        )
    }

    @Test
    fun `with next available only the offered time skips closed days`() = withApp(env) { api ->
        val clinic = api.createBusiness(practice().let { it.copy(policies = it.policies.copy(nextAvailableOnly = true)) })
        create(api, clinic, scheduleBody(clinic, daysBefore = 0, time = "10:00"))
        env.clock.instant = DEFAULT_NOW.plusSeconds(3600) // 10:00: today opened just now.
        val res = days(api, clinic, "GP consultation", "GMS", "2026-10-05", "2026-10-07")
        assertEquals(listOf("2026-10-05T10:00:00+01:00"), res.getValue("2026-10-05")["slots"]!!.a.map { it.o.s("start") })
        assertEquals(0, res.getValue("2026-10-06").slotCount())
        assertEquals("2026-10-06T10:00:00+01:00", res.getValue("2026-10-06").opensAt())
        // Only the soonest opening is told: the others would say which days have times.
        assertEquals(null, res.getValue("2026-10-07").opensAt())
    }
}
