package ie.bookanything.assistant.nudges

import ie.bookanything.ai.usage.AiPeriod
import ie.bookanything.ai.usage.CreditStatus
import ie.bookanything.support.FakeModelClient
import ie.bookanything.support.Fixtures
import ie.bookanything.support.MutableClock
import ie.bookanything.support.SiteFixtures
import ie.bookanything.support.TestCredits
import ie.bookanything.support.TestEnv
import ie.bookanything.support.a
import ie.bookanything.support.assertStatus
import ie.bookanything.support.o
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.withApp
import io.ktor.http.HttpStatusCode
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class NudgesTest {
    private val today = LocalDate.parse("2026-10-05")
    private val period = AiPeriod.of(Instant.parse("2026-10-05T08:00:00Z"), ZoneId.of("Europe/Dublin"))

    /** Facts with nothing worth a nudge; each test changes one thing. */
    private fun calm() = NudgeFacts(
        business = SiteFixtures.business(), today = today, pendingApprovals = 0, noShows30d = 0, noShowServicesWithoutDeposit = emptyList(),
        tomorrowBookedMinutes = 600, tomorrowAvailableMinutes = 1_000, needsOnlinePayments = true, paymentsReady = true,
        sitePublished = true, sitesEnabled = true,
        credits = credits(used = 10), overage = false,
        modelConfigured = true,
    )

    /** A Free business with 100 credits a month, [used] of them used. */
    private fun credits(used: Long) =
        CreditStatus("free", period, TestCredits.micro(100), TestCredits.micro(used), 0, TestCredits.value)

    private fun kinds(f: NudgeFacts) = NudgeRules.evaluate(f).map { it.kind }

    @Test
    fun `nothing to say on a calm day`() = assertEquals(emptyList(), kinds(calm()))

    @Test
    fun `each rule fires on its own facts, with a fingerprinted key`() {
        val approvals = NudgeRules.evaluate(calm().copy(pendingApprovals = 3)).single()
        assertEquals(
            listOf("pending_approvals:3", "3 appointments waiting for approval", "bookings?status=pending_approval"),
            listOf(approvals.key, approvals.title, approvals.action!!.path),
        )
        assertEquals("1 appointment waiting for approval", NudgeRules.evaluate(calm().copy(pendingApprovals = 1)).single().title)

        val noShows = calm().copy(noShows30d = 3, noShowServicesWithoutDeposit = listOf("Consult", "Massage"))
        assertEquals("no_show_streak:2026-10-01", NudgeRules.evaluate(noShows).single().key)
        assertTrue(NudgeRules.evaluate(noShows).single().body.contains("Consult, Massage"))
        assertEquals(emptyList(), kinds(noShows.copy(noShows30d = 2)))
        assertEquals(emptyList(), kinds(noShows.copy(noShowServicesWithoutDeposit = emptyList())), "deposits already taken")

        val quiet = NudgeRules.evaluate(calm().copy(tomorrowBookedMinutes = 120)).single()
        assertEquals(
            listOf("quiet_tomorrow:2026-10-06", "About 12% of tomorrow is booked.", "calendar?date=2026-10-06"),
            listOf(quiet.key, quiet.body, quiet.action!!.path),
        )
        assertEquals(
            emptyList(), kinds(calm().copy(tomorrowBookedMinutes = 0, tomorrowAvailableMinutes = 180)), "closed or nearly closed tomorrow",
        )

        assertEquals(listOf(NudgeKind.PAYMENTS_NOT_SET_UP), kinds(calm().copy(paymentsReady = false)))
        assertEquals(emptyList(), kinds(calm().copy(paymentsReady = false, needsOnlinePayments = false)))
        assertEquals(listOf(NudgeKind.SITE_NOT_PUBLISHED), kinds(calm().copy(sitePublished = false)))
        assertEquals(emptyList(), kinds(calm().copy(sitePublished = false, sitesEnabled = false)), "no websites, nothing to publish")

        val low = calm().copy(credits = credits(used = 85))
        assertEquals(
            listOf("ai_credits_low:2026-10-01", "Running low on AI credits", "15 credits left until 2026-11-01."),
            NudgeRules.evaluate(low).single().let { listOf(it.key, it.title, it.body) },
        )
        val out = low.copy(credits = credits(used = 100))
        assertEquals(
            listOf("AI credits used up", "warning"),
            NudgeRules.evaluate(out).single().let { listOf(it.title, it.severity.name.lowercase()) },
        )
        // With overage billing, AI keeps working past the allowance: an informational nudge, not "paused".
        val billed = NudgeRules.evaluate(out.copy(overage = true)).single()
        assertEquals(
            listOf("ai_credits_low:2026-10-01:overage", "Monthly AI credits used", "info"),
            listOf(billed.key, billed.title, billed.severity.name.lowercase()),
        )
        assertTrue("paused" !in billed.body, billed.body)
        assertEquals(
            listOf("Bo and the AI site builder are paused until 2026-11-01.", "Bo is paused until 2026-11-01."),
            listOf(out, out.copy(sitesEnabled = false)).map { NudgeRules.evaluate(it).single().body },
            "the site builder is only mentioned where it exists",
        )
        assertEquals(emptyList(), kinds(low.copy(modelConfigured = false)), "no model, nothing to spend credits on")
    }

    @Test
    fun `the periodic refresh skips quiet businesses and goes on past one that fails`() {
        val env = TestEnv(clock = MutableClock(ie.bookanything.support.DEFAULT_NOW))
        withApp(env) { api ->
            val (good, bad, quiet) = List(3) { Fixtures.clinic(api) }.map { UUID.fromString(it.id) }
            // Nothing happened at the quiet one for a month, by the test clock (not the database's now()).
            val monthAgo = OffsetDateTime.ofInstant(env.clock.instant().minus(Duration.ofDays(30)), ZoneOffset.UTC)
            Fixtures.sql("UPDATE audit_events SET occurred_at = ? WHERE business_id = ?", monthAgo, quiet)
            Fixtures.sql("UPDATE bookings SET created_at = ? WHERE business_id = ?", monthAgo, quiet)
            val failing = NudgeRule { f -> if (f.business.id == bad) error("a broken rule") else null }
            val service = NudgeService(
                env.db, env.clock, env.ctx.payments, env.ctx.ai.meter, modelConfigured = false, sitesEnabled = true,
                rules = listOf(failing, NudgeRules.SiteNotPublished),
            )
            service.refreshAll()
            fun kinds(id: UUID) = Fixtures.sqlAll("SELECT kind FROM assistant_nudges WHERE business_id = ?", id)
            assertEquals(listOf("site_not_published"), kinds(good), "refreshed although another business failed")
            assertEquals(emptyList(), kinds(bad))
            assertEquals(emptyList(), kinds(quiet), "no recent activity: left to when someone opens Bo")
        }
    }

    @Test
    fun `nudges are generated, dismissed, return when the facts change and resolve`() {
        val env = TestEnv(clock = MutableClock(ie.bookanything.support.DEFAULT_NOW), modelClient = FakeModelClient())
        withApp(env) { api ->
            val clinic = Fixtures.clinic(api)
            suspend fun nudges() = api.get(
                "${clinic.base}/assistant", clinic.owner.token,
            ).obj()["nudges"]!!.a.map { it.s("kind") to it.s("id") }
            // A new business: nothing published, and tomorrow is empty.
            assertEquals(listOf("quiet_tomorrow", "site_not_published"), nudges().map { it.first }.sorted())

            Fixtures.book(api, clinic, "Approval consult", "2026-10-07T10:00:00+01:00")
            // Opening Bo re-evaluates the nudges at most every five minutes.
            assertTrue(nudges().none { it.first == "pending_approvals" }, "not re-evaluated within five minutes")
            env.clock.advanceMinutes(5)
            val pending = nudges().single { it.first == "pending_approvals" }
            assertStatus(
                HttpStatusCode.NoContent, api.post("${clinic.base}/assistant/nudges/${pending.second}/dismiss", null, clinic.owner.token),
            )
            assertTrue(nudges().none { it.first == "pending_approvals" }, "dismissed")
            val second = Fixtures.book(api, clinic, "Approval consult", "2026-10-07T11:00:00+01:00")["booking"]!!.o.s("id")
            env.clock.advanceMinutes(5)
            assertTrue(nudges().any { it.first == "pending_approvals" }, "back: now 2 are waiting")
            for (id in Fixtures.sqlAll("SELECT id::text FROM bookings WHERE business_id = ? AND status = 'pending_approval'", clinic.id)) {
                assertStatus(HttpStatusCode.OK, api.post("${clinic.base}/bookings/$id/approve", null, clinic.owner.token))
            }
            env.clock.advanceMinutes(5)
            assertTrue(nudges().none { it.first == "pending_approvals" }, "resolved: nothing waiting ($second approved)")

            // The periodic job refreshes every active business.
            Fixtures.sql("DELETE FROM assistant_nudges WHERE business_id = ?", UUID.fromString(clinic.id))
            assertTrue(env.ctx.assistant.nudges.refreshAll() >= 1)
            assertTrue(
                Fixtures.sqlAll(
                    "SELECT kind FROM assistant_nudges WHERE business_id = ? AND resolved_at IS NULL",
                    clinic.id,
                ).contains("site_not_published"),
            )
        }
    }
}
