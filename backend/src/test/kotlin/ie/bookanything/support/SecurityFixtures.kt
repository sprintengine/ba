package ie.bookanything.support

import io.ktor.client.statement.HttpResponse
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.JsonObject
import java.time.Duration
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** Helpers shared by the `security/` tests. */
object SecurityFixtures {
    private val DUBLIN: ZoneId = ZoneId.of("Europe/Dublin")

    /**
     * A clock [weeks] after [DEFAULT_NOW] (still a Monday morning). Rate-limit buckets live in the shared test database and
     * every test client has the same address, so each rate-limited test picks its own week to get fresh windows.
     */
    fun isolatedClock(weeks: Long): MutableClock = MutableClock(DEFAULT_NOW.plus(Duration.ofDays(7 * weeks)))

    /** [time] in Dublin, [days] after the clock's date, as an ISO offset date-time (what the public API takes). */
    fun dublin(clock: MutableClock, days: Long, time: String): String =
        clock.instant.atZone(DUBLIN).toLocalDate().plusDays(days).atTime(LocalTime.parse(time)).atZone(DUBLIN)
            .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)

    /** A public booking body for [service] of [shop]. */
    fun bookingBody(
        shop: Clinic, service: String, start: String, email: String = "${unique("guest")}@example.test", name: String = "Jordan Casey",
        answers: Map<String, String> = emptyMap(), notes: String? = null,
    ): String = jsonOf(
        "serviceId" to shop.service(service), "optionId" to null, "addonIds" to emptyList<String>(), "groupId" to null,
        "resourceId" to null, "start" to start, "customer" to mapOf("name" to name, "email" to email, "phone" to null),
        "answers" to answers, "customerNotes" to notes,
    )

    /** Books through the public API and returns the `BookingResult` (booking, manageToken, next). */
    suspend fun book(
        api: Api, shop: Clinic, service: String, start: String, email: String = "${unique("guest")}@example.test",
        name: String = "Jordan Casey", answers: Map<String, String> = emptyMap(), notes: String? = null, token: String? = null,
    ): JsonObject {
        val res: HttpResponse = api.post("${shop.public}/bookings", bookingBody(shop, service, start, email, name, answers, notes), token)
        assertStatus(HttpStatusCode.Created, res)
        return res.obj()
    }
}
