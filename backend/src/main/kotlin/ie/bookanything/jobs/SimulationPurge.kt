package ie.bookanything.jobs

import ie.bookanything.auth.SimulationBusinesses
import ie.bookanything.config.AppConfig
import ie.bookanything.db.Db
import ie.bookanything.db.UuidArray
import ie.bookanything.db.count
import ie.bookanything.db.query
import ie.bookanything.db.update
import ie.bookanything.db.uuid
import ie.bookanything.payments.SimulationStripeAccounts
import ie.bookanything.payments.SimulationStripeAccounts.Deleted
import org.slf4j.LoggerFactory
import java.io.PrintStream
import java.sql.Connection
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.UUID
import javax.sql.DataSource

/**
 * `backend purge-simulation`: deletes what the reliability simulation left on staging (docs/simulation.md, "On
 * staging"), so a run of days doesn't grow the database for ever. Refused in production.
 *
 * Only data that is the simulation's beyond doubt:
 *
 * - **businesses** created before the cutoff whose slug starts with `sim-`, owned by a simulation user, and with no
 *   member who isn't one (a real tester invited into a simulated business keeps it). Deleting one deletes its
 *   bookings, customers, payments, audit trail and emails with it;
 * - **users** created before the cutoff whose subject (`sim_…`) and email (`…@sim.bookanything.test`) are both the
 *   simulation's ([ie.bookanything.auth.SimulationIdentity]), who belong to no business and are no business's customer
 *   any more;
 * - the deleted businesses' **Stripe test accounts** ([SimulationStripeAccounts]), once the businesses are gone: only
 *   accounts marked as the simulation's for that business, only with a test key, best effort (a failure is logged and
 *   counted, and the purge goes on).
 *
 * The cutoff must be older than any run still going: a run's checker reads every business it opened until it ends.
 */
object SimulationPurge {
    /**
     * What was deleted (or with a dry run, would be): businesses, users, and the businesses' Stripe accounts
     * ([stripeAccounts] deleted or gone already, [stripeAccountsLeft] not deleted: no test key, not the simulation's,
     * or Stripe failed).
     */
    data class Result(val businesses: Int, val users: Int, val stripeAccounts: Int = 0, val stripeAccountsLeft: Int = 0)

    private val log = LoggerFactory.getLogger(SimulationPurge::class.java)

    const val DEFAULT_DAYS = 7L
    private const val BATCH = 20

    private val SIM_USER = SimulationBusinesses.SIM_USER

    /** A simulation business, `b` in the query, created before the cutoff (the first parameter). */
    private val SIM_BUSINESS = "b.created_at < ? AND ${SimulationBusinesses.SIM_BUSINESS}"

    private val BUSINESSES = "SELECT b.id FROM businesses b WHERE $SIM_BUSINESS ORDER BY b.created_at"

    /**
     * The same check again, in the deleting transaction, after locking the rows: adding a member takes a key-share lock
     * on the business, so from the lock on none can be added, and this statement's fresh snapshot sees any added before.
     */
    private const val LOCK_BUSINESSES = "SELECT id FROM businesses WHERE id = ANY(?) ORDER BY id FOR UPDATE"
    private val STILL_SIM_BUSINESSES = "SELECT b.id FROM businesses b WHERE b.id = ANY(?) AND $SIM_BUSINESS"

    private val USERS_WHERE = """
        u.created_at < ? AND $SIM_USER
          AND NOT EXISTS (SELECT 1 FROM business_members m WHERE m.user_id = u.id)
          AND NOT EXISTS (SELECT 1 FROM customers c WHERE c.user_id = u.id)
    """.trimIndent()

    /**
     * Deletes (or with [dryRun] only counts) the simulation's businesses and users created before [before], and with
     * [stripe] (a test key) the deleted businesses' Stripe test accounts.
     */
    fun purge(db: Db, before: Instant, dryRun: Boolean = false, stripe: SimulationStripeAccounts? = null): Result {
        val businesses = db.txBlocking(readOnly = true) { conn -> conn.query(BUSINESSES, before) { it.uuid("id") } }
        if (dryRun) {
            // Users that would go once those businesses have: count them as if they had.
            val (users, accounts) = db.txBlocking(readOnly = true) { conn ->
                countUsersAfter(conn, before, businesses) to conn.count(
                    "SELECT count(*) FROM businesses WHERE id = ANY(?) AND stripe_account_id IS NOT NULL", UuidArray(businesses),
                ).toInt()
            }
            // Linked accounts: deleted with a test key (unless Stripe says they aren't the simulation's), else left.
            return Result(businesses.size, users, if (stripe != null) accounts else 0, if (stripe != null) 0 else accounts)
        }
        val accounts = mutableListOf<Pair<UUID, String>>()
        val deleted = businesses.chunked(BATCH).sumOf { chunk ->
            db.txBlocking { conn ->
                conn.query(LOCK_BUSINESSES, UuidArray(chunk)) { it.uuid("id") }
                val still = UuidArray(conn.query(STILL_SIM_BUSINESSES, UuidArray(chunk), before) { it.uuid("id") })
                // email_log keeps its rows when a business goes (business_id is set null): these are the simulation's.
                conn.update("DELETE FROM email_log WHERE business_id = ANY(?)", still)
                val gone = conn.query("DELETE FROM businesses WHERE id = ANY(?) RETURNING id, stripe_account_id", still) {
                    it.uuid("id") to it.getString("stripe_account_id")
                }
                // Stripe is called once the deletion has committed, outside the transaction.
                gone.mapNotNullTo(accounts) { (id, account) -> account?.let { id to it } }
                gone.size
            }
        }
        val users = db.txBlocking { conn -> conn.update("DELETE FROM users u WHERE $USERS_WHERE", before) }
        val outcomes = accounts.map { (business, account) ->
            val outcome = stripe?.deleteIfOurs(account, business) ?: Deleted.FAILED
            if (outcome == Deleted.DELETED) log.info("simulation purge: deleted Stripe account {} of business {}", account, business)
            outcome
        }
        if (stripe == null && accounts.isNotEmpty()) {
            log.warn(
                "simulation purge: {} Stripe accounts of deleted businesses left at Stripe (no Stripe test key): {}",
                accounts.size, accounts.joinToString { it.second },
            )
        }
        val done = outcomes.count { it == Deleted.DELETED || it == Deleted.GONE }
        return Result(deleted, users, done, outcomes.size - done)
    }

    private fun countUsersAfter(conn: Connection, before: Instant, businesses: List<UUID>): Int = conn.count(
        """
        SELECT count(*) FROM users u
        WHERE u.created_at < ? AND $SIM_USER
          AND NOT EXISTS (SELECT 1 FROM business_members m WHERE m.user_id = u.id AND NOT (m.business_id = ANY(?)))
          AND NOT EXISTS (SELECT 1 FROM customers c WHERE c.user_id = u.id AND NOT (c.business_id = ANY(?)))
        """.trimIndent(),
        before, UuidArray(businesses), UuidArray(businesses),
    ).toInt()

    /**
     * The command: `purge-simulation [--older-than-days N] [--dry-run]` (N ≥ 1, default [DEFAULT_DAYS]). Returns the exit
     * code: 0 done, 2 refused (production, or bad arguments). [dataSource] is opened only once the command may run.
     */
    fun command(
        config: AppConfig,
        args: List<String>,
        out: PrintStream = System.out,
        err: PrintStream = System.err,
        clock: Clock = Clock.systemUTC(),
        /** The Stripe test accounts to delete with the businesses: none without a test key. */
        stripe: () -> SimulationStripeAccounts? = { SimulationStripeAccounts.forKey(config.stripe.secretKey) },
        dataSource: () -> DataSource,
    ): Int {
        if (!config.env.allowsSimulationAuth) {
            err.println("purge-simulation is refused in production: simulation data only exists on staging (APP_ENV=staging).")
            return 2
        }
        val options = parse(args) ?: run {
            err.println("Usage: backend purge-simulation [--older-than-days N] [--dry-run]   (N ≥ 1, default $DEFAULT_DAYS)")
            return 2
        }
        val before = clock.instant().minus(Duration.ofDays(options.days))
        val ds = dataSource()
        val result = try {
            purge(Db(ds), before, options.dryRun, stripe())
        } finally {
            (ds as? AutoCloseable)?.close()
        }
        val verb = if (options.dryRun) "would delete" else "deleted"
        out.println("purge-simulation: $verb ${result.businesses} businesses and ${result.users} users created before $before")
        if (result.stripeAccounts > 0 || result.stripeAccountsLeft > 0) {
            out.println(
                "purge-simulation: $verb ${result.stripeAccounts} Stripe test accounts" +
                    if (result.stripeAccountsLeft > 0) ", ${result.stripeAccountsLeft} left at Stripe (see the log)" else "",
            )
        }
        return 0
    }

    private data class Options(val days: Long, val dryRun: Boolean)

    private fun parse(args: List<String>): Options? {
        var days = DEFAULT_DAYS
        var dryRun = false
        val rest = args.iterator()
        while (rest.hasNext()) {
            when (rest.next()) {
                "--dry-run" -> dryRun = true
                "--older-than-days" -> days = rest.takeIf { it.hasNext() }?.next()?.toLongOrNull() ?: return null
                else -> return null
            }
        }
        return Options(days, dryRun).takeIf { days in 1..MAX_DAYS }
    }

    private const val MAX_DAYS = 3650L
}
