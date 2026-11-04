package ie.bookanything.db

import ie.bookanything.auth.CurrentUser
import ie.bookanything.availability.SlotDataRepository
import ie.bookanything.business.BusinessRepository
import ie.bookanything.business.BusinessRow
import ie.bookanything.customers.CustomerRepository
import ie.bookanything.jobs.JobQueue
import ie.bookanything.jobs.Retention
import ie.bookanything.me.MeRepository
import ie.bookanything.oauth.PgTokenStore
import ie.bookanything.payments.PaymentRepository
import ie.bookanything.payments.ProviderEventRepository
import ie.bookanything.reports.ReportRepository
import ie.bookanything.support.QueryPlans
import ie.bookanything.support.of
import ie.bookanything.team.TeamRepository
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import kotlin.test.Test

/**
 * The key queries can use their indexes in production, where they run under row-level security as an ordinary role
 * ([QueryPlans]). Development and the other tests connect as a superuser, which skips the tenant policies, so a query
 * whose only selective condition is a non-leakproof operator passes them and scans the table in production.
 */
class PlanTest {
    private val now = Instant.parse("2026-10-05T08:00:00Z")

    private val business: BusinessRow by lazy {
        QueryPlans.read { conn -> BusinessRepository.findBySlug(conn, "plan-3")!! }
    }

    /** A user with customer records (and bookings) at several businesses. */
    private val userId: UUID by lazy {
        QueryPlans.read { conn ->
            conn.queryOne("SELECT user_id FROM customers WHERE user_id IS NOT NULL LIMIT 1") { it.uuid("user_id") }!!
        }
    }

    @Test
    fun `report booked minutes start from the period's bookings`() {
        val plans = QueryPlans.explain(business.id) { conn ->
            ReportRepository.summary(conn, business, LocalDate.parse("2026-10-01"), LocalDate.parse("2026-10-31"))
        }
        plans.of("booking_allocations a").assertIndexCond("bookings_business_start_idx", "start_at")
    }

    /** Some bookings of different businesses. */
    private val bookingIds: List<UUID> by lazy {
        QueryPlans.read { conn ->
            conn.query("SELECT DISTINCT ON (business_id) id FROM bookings ORDER BY business_id, id") { it.uuid("id") }
        }
    }

    @Test
    fun `expired holds' pending charges are found by booking`() {
        val plans = QueryPlans.explain(null) { conn -> PaymentRepository.cancelPendingCharges(conn, bookingIds) }
        plans.of("UPDATE payments").assertIndexCond("payments_pending_charge_idx", "booking_id")
    }

    /** Two of the business's resources. */
    private val resourceIds: Set<UUID> by lazy {
        QueryPlans.read { conn ->
            conn.query("SELECT id FROM resources WHERE business_id = ? ORDER BY id LIMIT 2", business.id) { it.uuid("id") }.toSet()
        }
    }

    @Test
    fun `availability reads the active allocations of its resources`() {
        val window = Instant.parse("2026-10-12T00:00:00Z") to Instant.parse("2026-10-19T00:00:00Z")
        val plans = QueryPlans.explain(business.id) { conn ->
            SlotDataRepository.busy(conn, setOf(business.id), resourceIds, window.first, window.second, now)
        }
        plans.of("booking_allocations a").assertIndexCond("booking_allocations_resource_active_idx", "resource_id")
    }

    @Test
    fun `signing in links guest bookings found by email`() {
        val user = CurrentUser(userId, "plan_signin", "Customer7-Plan-3@example.test", emailVerified = true, name = null)
        val plans = QueryPlans.explain(null) { conn -> CustomerRepository.linkByVerifiedEmail(conn, user) }
        plans.of("UPDATE customers").assertIndexCond("customers_unlinked_email_idx", "email")
    }

    @Test
    fun `a business finds its customer by email`() {
        val plans = QueryPlans.explain(business.id) { conn ->
            CustomerRepository.findByEmail(conn, business.id, "customer7-plan-3@example.test")
            CustomerRepository.emailTaken(conn, business.id, "customer7-plan-3@example.test", null)
        }
        plans.of("c.email::text").assertIndexCond("customers_business_email_idx", "email")
        plans.of("SELECT 1 FROM customers").assertIndexCond("customers_business_email_idx", "email")
    }

    @Test
    fun `the customer list starts each page at its cursor in the name index`() {
        // plan-1 has thousands of customers: a page must not read them all and sort them.
        val big = QueryPlans.read { conn -> BusinessRepository.findBySlug(conn, "plan-1")!! }
        val plans = QueryPlans.explain(big.id) { conn ->
            CustomerRepository.list(conn, big.id, null, null, "guest 2500" to UUID(0, 0), 25)
        }
        plans.of("FROM customers c").assertIndexCond("customers_business_sort_name_idx", "sort_name")
    }

    @Test
    fun `invitations are found by the invited email`() {
        val plans = QueryPlans.explain(null) { conn -> TeamRepository.pendingInvitationsFor(conn, "invite7-plan-3@example.test") }
        plans.of("business_members m").assertIndexCond("business_members_invited_email_text_idx", "invited_email")
    }

    @Test
    fun `the daily purge finds what is due by age`() {
        val plans = QueryPlans.explain(null) { conn ->
            PgTokenStore.purgeExpired(conn, now.minus(Retention.EXPIRED_GRACE), Retention.BATCH)
            ProviderEventRepository.purgeProcessed(conn, now.minus(Retention.PROCESSED_EVENTS), Retention.BATCH)
            JobQueue.purgeFailed(conn, now.minus(Retention.FAILED_JOBS), Retention.BATCH)
            JobQueue.purgeFinished(conn)
        }
        plans.of("DELETE FROM oauth_codes").assertIndexCond("oauth_codes_expiry_idx", "expires_at")
        plans.of("DELETE FROM oauth_tokens").assertIndexCond("oauth_tokens_expiry_idx", "expires_at")
        plans.of("DELETE FROM provider_events").assertIndexCond("provider_events_processed_idx", "received_at")
        plans.of("status = 'failed'").assertIndexCond("jobs_finished_idx", "created_at")
        plans.of("status = 'done'").assertIndexCond("jobs_finished_idx", "created_at")
    }

    @Test
    fun `my bookings find the user's customer records by user`() {
        val plans = QueryPlans.explain(null) { conn ->
            MeRepository.upcomingBookings(conn, userId, now)
            MeRepository.pastBookings(conn, userId, now, 100)
            MeRepository.hasBookings(conn, userId)
        }
        val mine = plans.filter { "c.user_id" in it.sql }
        check(mine.size == 3) { mine }
        mine.forEach { it.assertIndexCond("customers_user_idx", "user_id") }
    }
}
