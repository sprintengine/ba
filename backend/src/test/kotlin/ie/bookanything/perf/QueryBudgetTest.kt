package ie.bookanything.perf

import ie.bookanything.geo.GeoPoint
import ie.bookanything.support.Api
import ie.bookanything.support.Clinic
import ie.bookanything.support.CountingDataSource
import ie.bookanything.support.Fixtures
import ie.bookanything.support.MarketplaceFixtures
import ie.bookanything.support.MarketplaceFixtures.north
import ie.bookanything.support.TestDatabase
import ie.bookanything.support.TestEnv
import ie.bookanything.support.a
import ie.bookanything.support.assertStatus
import ie.bookanything.support.jsonOf
import ie.bookanything.support.o
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.withApp
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.fail

/**
 * Query-count budgets for the hot endpoints ([QueryBudgets]): each request runs against its own app whose
 * [CountingDataSource] sees only that request's statements, so the counts are exact and deterministic.
 */
class QueryBudgetTest {
    private val counter = CountingDataSource(TestDatabase.dataSource)
    private val env = TestEnv(dataSource = counter)
    private val overruns = mutableListOf<String>()

    /** Runs [call], checks its status and returns the statements it executed. */
    private suspend fun statements(
        expected: HttpStatusCode = HttpStatusCode.OK, call: suspend () -> HttpResponse,
    ): Pair<HttpResponse, List<String>> {
        val (res, sql) = counter.recording(call)
        if (res.status != expected) fail("Expected $expected but got ${res.status}: ${res.bodyAsText()}")
        return res to sql
    }

    /** Runs [call] and records it when it didn't execute exactly its budget of statements (see [checkBudgets]). */
    private suspend fun budget(
        endpoint: String, expected: HttpStatusCode = HttpStatusCode.OK, call: suspend () -> HttpResponse,
    ): HttpResponse {
        val (res, sql) = statements(expected, call)
        val allowed = QueryBudgets.BUDGETS[endpoint] ?: fail("No budget for '$endpoint' in QueryBudgets")
        if (sql.size != allowed) {
            val verb = if (sql.size > allowed) "over" else "under (lower the budget)"
            overruns += "'$endpoint' ran ${sql.size} SQL statements, $verb its budget of $allowed in QueryBudgets:\n" +
                sql.mapIndexed { i, s -> "  ${i + 1}. ${s.take(SQL_PREVIEW)}" }.joinToString("\n")
        }
        return res
    }

    /** Fails with every endpoint that missed its budget, so one run shows them all. */
    private fun checkBudgets() {
        if (overruns.isNotEmpty()) fail(overruns.joinToString("\n\n"))
    }

    @Test
    fun `public site and booking flow stay within budget`() = withApp(env) { api ->
        val c = Fixtures.clinic(api)
        budget("public business, default site") { api.get(c.public) }
        assertStatus(HttpStatusCode.OK, api.post("${c.base}/site/publish", null, c.owner.token))
        val consult = c.service("Consult")

        budget("public business") { api.get(c.public) }
        budget("public services") { api.get("${c.public}/services") }
        budget("public availability") { api.get("${c.public}/availability?serviceId=$consult&from=2026-10-12&to=2026-10-18") }
        val booked = budget("public booking", HttpStatusCode.Created) {
            api.post("${c.public}/bookings", Fixtures.bookingBody(c, "Consult", "2026-10-13T10:00:00+01:00"))
        }.obj()
        budget("manage booking") { api.get("/v1/public/manage/${booked.s("manageToken")}") }
        budget("templates") { api.get("/v1/public/templates") }
        checkBudgets()
    }

    @Test
    fun `marketplace search stays within budget whatever the number of listings`() = withApp(env) { api ->
        fun search(p: GeoPoint) = "/v1/public/marketplace/search?lat=${p.latitude}&lng=${p.longitude}&radiusKm=50&available=today"
        val alone = MarketplaceFixtures.isolatedPoint()
        MarketplaceFixtures.listedClinic(api, alone)
        val p = MarketplaceFixtures.isolatedPoint()
        repeat(LISTINGS) { i -> MarketplaceFixtures.listedClinic(api, north(p, i * 5.0)) }

        val (_, one) = statements { api.get(search(alone)) }
        val found = budget("marketplace search") { api.get(search(p)) }.obj()
        assertEquals(LISTINGS, found["items"]!!.a.size)
        assertEquals(one.size, counter.statements.size, "a search runs the same statements for 1 and $LISTINGS listings")
        // Within the next-times cache's 30 seconds the cards skip the availability queries.
        budget("marketplace search, cached times") { api.get(search(p)) }
        budget("marketplace meta") { api.get("/v1/public/marketplace/meta") }
        checkBudgets()
    }

    @Test
    fun `marketplace search runs the same statements when the availability filter rejects most listings`() = withApp(env) { api ->
        // Regression: groups shrank to what the page still needed, so with one result left to find every rejected
        // candidate cost its own round of card queries.
        fun search(p: GeoPoint) = "/v1/public/marketplace/search?lat=${p.latitude}&lng=${p.longitude}&radiusKm=50&available=today&limit=2"
        val allOpen = MarketplaceFixtures.isolatedPoint()
        repeat(2) { i -> MarketplaceFixtures.listedClinic(api, north(allOpen, i * 5.0)) }
        val mostlyClosed = MarketplaceFixtures.isolatedPoint()
        val listed = (0 until CLOSED + 2).map { i -> MarketplaceFixtures.listedClinic(api, north(mostlyClosed, i * 5.0)) }
        listed.subList(1, CLOSED + 1).forEach { c ->
            val closure = jsonOf("date" to "2026-10-05", "isAvailable" to false, "startTime" to null, "endTime" to null, "reason" to null)
            assertStatus(HttpStatusCode.Created, api.post("${c.base}/closures", closure, c.owner.token))
        }

        val (_, open) = statements { api.get(search(allOpen)) }
        val (res, filtered) = statements { api.get(search(mostlyClosed)) }
        assertEquals(listOf(listed.first().slug, listed.last().slug), res.obj()["items"]!!.a.map { it.o["business"]!!.s("slug") })
        assertEquals(open.size, filtered.size, "the same statements with $CLOSED rejected listings:\n$open\n$filtered")
    }

    @Test
    fun `signed-in pages stay within budget and the booking list doesn't grow with its bookings`() = withApp(env) { api ->
        val c = Fixtures.clinic(api)
        val owner = c.owner.token
        val first = book(api, c, "2026-10-06T10:00:00+01:00")

        budget("me") { api.get("/v1/me", owner) }
        budget("dashboard business") { api.get(c.base, owner) }
        budget("dashboard overview") { api.get("${c.base}/overview", owner) }
        val list = "${c.base}/bookings?from=2026-10-01&to=2026-10-31"
        val (_, one) = statements { api.get(list, owner) }
        listOf("2026-10-07T10:00:00+01:00", "2026-10-08T10:00:00+01:00", "2026-10-09T14:00:00+01:00").forEach { book(api, c, it) }
        val (_, four) = statements { api.get(list, owner) }
        assertEquals(one.size, four.size, "the booking list runs the same statements for 1 and 4 bookings:\n$one\n$four")
        budget("dashboard bookings") { api.get(list, owner) }
        budget("dashboard booking") { api.get("${c.base}/bookings/${first.o["booking"]!!.s("id")}", owner) }
        budget("dashboard availability") {
            api.get("${c.base}/availability?serviceId=${c.service("Consult")}&from=2026-10-12&to=2026-10-18", owner)
        }
        budget("dashboard reports") { api.get("${c.base}/reports/summary?from=2026-10-01&to=2026-10-31", owner) }
        budget("dashboard services") { api.get("${c.base}/services", owner) }
        budget("dashboard resources") { api.get("${c.base}/resources", owner) }
        budget("dashboard customers") { api.get("${c.base}/customers", owner) }
        budget("dashboard site") { api.get("${c.base}/site", owner) }
        // Opening Bo: the nudges are re-evaluated at most every five minutes, and the thread list reads only threads.
        budget("assistant panel, nudges re-evaluated") { api.get("${c.base}/assistant", owner) }
        budget("assistant panel") { api.get("${c.base}/assistant", owner) }
        budget("assistant threads") { api.get("${c.base}/assistant/threads", owner) }
        // Previewing a deal computes availability for each of its services, together.
        val deal = jsonOf(
            "name" to "Everyday 20%", "serviceIds" to listOf(c.service("Consult"), c.service("Paid consult"), c.service("Class")),
            "discount" to mapOf("type" to "percent", "percent" to 20),
        )
        val preview = jsonOf("offer" to Json.parseToJsonElement(deal), "from" to "2026-10-05", "days" to 7)
        budget("dashboard offer preview") { api.post("${c.base}/offers/preview", preview, owner) }
        // The owner's own bookings as a customer, upcoming and past, with their businesses read together.
        Fixtures.book(api, c, "Consult", "2026-10-09T10:00:00+01:00", token = owner, email = c.owner.email)
        budget("me bookings") { api.get("/v1/me/bookings", owner) }
        // The calendar's release row (last: the schedules close days to customers): one batched availability read however many schedules and services.
        fun schedule(service: String) = jsonOf(
            "name" to service, "serviceIds" to listOf(c.service(service)), "cadence" to "daily", "time" to "17:00", "daysBefore" to 1,
        )
        val releases = "${c.base}/releases?from=2026-10-12&to=2026-10-18"
        assertStatus(HttpStatusCode.Created, api.post("${c.base}/release-schedules", schedule("Consult"), owner))
        val (_, oneSchedule) = statements { api.get(releases, owner) }
        assertStatus(HttpStatusCode.Created, api.post("${c.base}/release-schedules", schedule("Paid consult"), owner))
        budget("dashboard releases") { api.get(releases, owner) }
        assertEquals(oneSchedule.size, counter.statements.size, "the releases run the same statements for 1 and 2 schedules")
        checkBudgets()
    }

    private suspend fun book(api: Api, c: Clinic, start: String) = Fixtures.book(api, c, "Consult", start)

    private companion object {
        const val LISTINGS = 3
        const val CLOSED = 5
        const val SQL_PREVIEW = 300
    }
}
