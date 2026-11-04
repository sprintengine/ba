package ie.bookanything.db

import ie.bookanything.availability.Assignment
import ie.bookanything.booking.AllocationRepository
import ie.bookanything.http.ApiException
import ie.bookanything.support.Fixtures
import ie.bookanything.support.TestEnv
import ie.bookanything.support.access
import ie.bookanything.support.s
import ie.bookanything.support.unique
import ie.bookanything.support.withApp
import ie.bookanything.team.InvitationInput
import ie.bookanything.team.TeamCommands
import io.ktor.http.HttpStatusCode
import java.sql.SQLException
import java.time.Instant
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/** Rules the schema enforces whatever the code does (changeset 0024). */
class ConstraintsTest {
    @Test
    fun `money paid in person can't exceed what was paid`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val booking = Fixtures.book(api, clinic, "Consult", "2026-10-07T09:00:00+01:00")["booking"]!!.s("id")
        val e = assertFailsWith<SQLException> {
            Fixtures.sql(
                "UPDATE bookings SET amount_paid_in_person_cents = amount_paid_cents + 1 WHERE id = ?", UUID.fromString(booking),
            )
        }
        assertEquals(PgState.CHECK_VIOLATION, e.sqlState)
    }

    @Test
    fun `an allocation overlapping another booking is SLOT_UNAVAILABLE where it is inserted`() {
        val env = TestEnv()
        withApp(env) { api ->
            val clinic = Fixtures.clinic(api)
            val businessId = UUID.fromString(clinic.id)
            val alex = UUID.fromString(clinic.resource("Alex"))
            Fixtures.book(api, clinic, "Consult", "2026-10-07T09:00:00+01:00", resourceId = alex.toString())
            val laterBooking = Fixtures.book(api, clinic, "Consult", "2026-10-07T11:00:00+01:00", resourceId = alex.toString())
            val later = UUID.fromString(laterBooking["booking"]!!.s("id"))
            // The later booking's allocation moved onto the earlier one's time, past every availability check.
            val overlap = TstzRange(Instant.parse("2026-10-07T08:00:00Z"), Instant.parse("2026-10-07T08:30:00Z"))
            val e = assertFailsWith<ApiException> {
                env.db.txBlocking(businessId) { conn ->
                    AllocationRepository.insert(conn, businessId, later, listOf(Assignment(null, alex)), overlap, exclusive = true)
                }
            }
            assertEquals("SLOT_UNAVAILABLE", e.code)
            assertEquals(HttpStatusCode.Conflict, e.status)
        }
    }

    @Test
    fun `an address has one pending invitation per business, even when invited twice at once`() {
        val env = TestEnv()
        withApp(env) { api ->
            val clinic = Fixtures.clinic(api)
            val owner = env.access(clinic.owner, clinic.id)
            val businessId = UUID.fromString(clinic.id)
            val email = "${unique("twice")}@example.test"
            val commands = TeamCommands(env.ctx.tokens)
            val invite = InvitationInput(email, "staff")
            // The first invitation is made but not committed while the second checks, finds nothing and inserts: its
            // insert waits on the unique index, then fails once the first commits.
            val firstInserted = CountDownLatch(1)
            val first = thread {
                env.db.txBlocking(businessId) { conn ->
                    commands.invite(conn, owner, invite)
                    firstInserted.countDown()
                    awaitTrue { waitingOnALock(env) }
                }
            }
            assertTrue(firstInserted.await(20, TimeUnit.SECONDS))
            val second = assertFailsWith<ApiException> { env.db.txBlocking(businessId) { conn -> commands.invite(conn, owner, invite) } }
            first.join()
            assertEquals("$email is already a member or has a pending invitation.", second.message)
            assertEquals(
                1L,
                Fixtures.sqlOne(
                    "SELECT count(*) FROM business_members WHERE business_id = ? AND invited_email = ? AND status = 'invited'", businessId,
                    email,
                ) { it.getLong(1) },
            )
        }
    }

    private fun waitingOnALock(env: TestEnv): Boolean = env.db.txBlocking(readOnly = true) { conn ->
        conn.prepareStatement(
            "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' " +
                "AND query ILIKE '%business_members%'",
        ).use { st -> st.executeQuery().use { rs -> rs.next() && rs.getLong(1) > 0 } }
    }

    private fun awaitTrue(condition: () -> Boolean) {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(20)
        while (!condition()) {
            check(System.nanoTime() < deadline) { "timed out" }
            Thread.onSpinWait()
        }
    }
}
