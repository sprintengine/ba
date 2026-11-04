package ie.bookanything.jobs

import ie.bookanything.auth.SimulationIdentity
import ie.bookanything.config.AppConfig
import ie.bookanything.db.Db
import ie.bookanything.db.UuidArray
import ie.bookanything.db.count
import ie.bookanything.db.query
import ie.bookanything.db.update
import ie.bookanything.db.uuid
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
 *   simulation's ([SimulationIdentity]), who belong to no business and are no business's customer any more.
 *
 * The cutoff must be older than any run still going: a run's checker reads every business it opened until it ends.
 */
object SimulationPurge {
    data class Result(val businesses: Int, val users: Int)

    const val DEFAULT_DAYS = 7L
    private const val BATCH = 20

    /** A simulation user, `u` in the query (both namespace checks, as [SimulationIdentity.isUser]). */
    private val SIM_USER = """
        (left(u.clerk_user_id, ${SimulationIdentity.SUBJECT_PREFIX.length}) = '${SimulationIdentity.SUBJECT_PREFIX}'
         AND lower(split_part(u.email::text, '@', 2)) = '${SimulationIdentity.EMAIL_DOMAIN}')
    """.trimIndent()

    private val BUSINESSES = """
        SELECT b.id FROM businesses b
        WHERE b.created_at < ? AND left(b.slug, 4) = 'sim-'
          AND EXISTS (
            SELECT 1 FROM business_members m JOIN users u ON u.id = m.user_id
            WHERE m.business_id = b.id AND m.role = 'owner' AND $SIM_USER)
          AND NOT EXISTS (
            SELECT 1 FROM business_members m JOIN users u ON u.id = m.user_id
            WHERE m.business_id = b.id AND NOT $SIM_USER)
        ORDER BY b.created_at
    """.trimIndent()

    private val USERS_WHERE = """
        u.created_at < ? AND $SIM_USER
          AND NOT EXISTS (SELECT 1 FROM business_members m WHERE m.user_id = u.id)
          AND NOT EXISTS (SELECT 1 FROM customers c WHERE c.user_id = u.id)
    """.trimIndent()

    /** Deletes (or with [dryRun] only counts) the simulation's businesses and users created before [before]. */
    fun purge(db: Db, before: Instant, dryRun: Boolean = false): Result {
        val businesses = db.txBlocking(readOnly = true) { conn -> conn.query(BUSINESSES, before) { it.uuid("id") } }
        if (dryRun) {
            // Users that would go once those businesses have: count them as if they had.
            val users = db.txBlocking(readOnly = true) { conn -> countUsersAfter(conn, before, businesses) }
            return Result(businesses.size, users)
        }
        businesses.chunked(BATCH).forEach { chunk ->
            db.txBlocking { conn ->
                // email_log keeps its rows when a business goes (business_id is set null): these are the simulation's.
                conn.update("DELETE FROM email_log WHERE business_id = ANY(?)", UuidArray(chunk))
                conn.update("DELETE FROM businesses WHERE id = ANY(?)", UuidArray(chunk))
            }
        }
        val users = db.txBlocking { conn -> conn.update("DELETE FROM users u WHERE $USERS_WHERE", before) }
        return Result(businesses.size, users)
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
            purge(Db(ds), before, options.dryRun)
        } finally {
            (ds as? AutoCloseable)?.close()
        }
        val verb = if (options.dryRun) "would delete" else "deleted"
        out.println("purge-simulation: $verb ${result.businesses} businesses and ${result.users} users created before $before")
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
