package ie.bookanything.auth

import ie.bookanything.db.UuidArray
import ie.bookanything.db.query
import ie.bookanything.db.queryOne
import ie.bookanything.db.uuid
import java.sql.Connection
import java.util.UUID

/**
 * Which businesses are the reliability simulation's beyond doubt (docs/simulation.md, "On staging"): a slug starting
 * with `sim-`, an owner who is a simulation user, and no member who isn't one ([SimulationIdentity]: both the subject
 * and the email in the reserved namespace), a pending invitation included (it must be to an address on the
 * simulation's domain). A real tester invited into a simulated business makes it theirs too, and then nothing that is
 * only for the simulation's businesses applies to it: the purge keeps it, and it gets no simulation Stripe account.
 */
object SimulationBusinesses {
    /** A simulation user, `u` in the query (both namespace checks, as [SimulationIdentity.isUser]); never null. */
    val SIM_USER = """
        coalesce(left(u.clerk_user_id, ${SimulationIdentity.SUBJECT_PREFIX.length}) = '${SimulationIdentity.SUBJECT_PREFIX}'
         AND lower(split_part(u.email::text, '@', 2)) = '${SimulationIdentity.EMAIL_DOMAIN}', false)
    """.trimIndent()

    /** A membership, `m` with its user `u` (left-joined), that is the simulation's: its user's, or its invitation's. */
    private val SIM_MEMBER = """
        CASE WHEN m.user_id IS NULL
            THEN coalesce(lower(split_part(m.invited_email::text, '@', 2)) = '${SimulationIdentity.EMAIL_DOMAIN}', false)
            ELSE $SIM_USER END
    """.trimIndent()

    /** A simulation business, `b` in the query. */
    val SIM_BUSINESS = """
        left(b.slug, 4) = 'sim-'
          AND EXISTS (
            SELECT 1 FROM business_members m JOIN users u ON u.id = m.user_id
            WHERE m.business_id = b.id AND m.role = 'owner' AND $SIM_USER)
          AND NOT EXISTS (
            SELECT 1 FROM business_members m LEFT JOIN users u ON u.id = m.user_id
            WHERE m.business_id = b.id AND NOT ($SIM_MEMBER))
    """.trimIndent()

    /**
     * Locks [businessIds] and their memberships for the rest of the transaction, so the answer of a [SIM_BUSINESS] check
     * made after it holds until the transaction ends: adding a member takes a key-share lock on the business, accepting
     * an invitation updates the membership, and each waits for the lock (or, already under way, is waited for and then
     * seen by the check's fresh snapshot).
     */
    fun lock(conn: Connection, businessIds: List<UUID>) {
        conn.query("SELECT id FROM businesses WHERE id = ANY(?) ORDER BY id FOR UPDATE", UuidArray(businessIds)) { it.uuid("id") }
        conn.query("SELECT id FROM business_members WHERE business_id = ANY(?) ORDER BY id FOR UPDATE", UuidArray(businessIds)) {
            it.uuid("id")
        }
    }

    /** Whether [businessId] is a simulation business now; [lock] it first to act on the answer. */
    fun isSimulation(conn: Connection, businessId: UUID): Boolean =
        conn.queryOne("SELECT EXISTS (SELECT 1 FROM businesses b WHERE b.id = ? AND $SIM_BUSINESS)", businessId) { it.getBoolean(1) }
            ?: false
}
