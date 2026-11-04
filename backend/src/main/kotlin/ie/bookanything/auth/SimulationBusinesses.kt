package ie.bookanything.auth

import ie.bookanything.db.queryOne
import java.sql.Connection
import java.util.UUID

/**
 * Which businesses are the reliability simulation's beyond doubt (docs/simulation.md, "On staging"): a slug starting
 * with `sim-`, an owner who is a simulation user, and no member who isn't one ([SimulationIdentity]: both the subject
 * and the email in the reserved namespace). A real tester invited into a simulated business makes it theirs too, and
 * then nothing that is only for the simulation's businesses applies to it: the purge keeps it, and it gets no
 * simulation Stripe account.
 */
object SimulationBusinesses {
    /** A simulation user, `u` in the query (both namespace checks, as [SimulationIdentity.isUser]). */
    val SIM_USER = """
        (left(u.clerk_user_id, ${SimulationIdentity.SUBJECT_PREFIX.length}) = '${SimulationIdentity.SUBJECT_PREFIX}'
         AND lower(split_part(u.email::text, '@', 2)) = '${SimulationIdentity.EMAIL_DOMAIN}')
    """.trimIndent()

    /** A simulation business, `b` in the query. */
    val SIM_BUSINESS = """
        left(b.slug, 4) = 'sim-'
          AND EXISTS (
            SELECT 1 FROM business_members m JOIN users u ON u.id = m.user_id
            WHERE m.business_id = b.id AND m.role = 'owner' AND $SIM_USER)
          AND NOT EXISTS (
            SELECT 1 FROM business_members m JOIN users u ON u.id = m.user_id
            WHERE m.business_id = b.id AND NOT $SIM_USER)
    """.trimIndent()

    /**
     * Whether [businessId] is a simulation business now. To act on the answer, lock the business row first (`FOR
     * UPDATE`) in the same transaction: adding a member takes a key-share lock on it, so from the lock on none can be
     * added, and this statement's fresh snapshot sees any added before.
     */
    fun isSimulation(conn: Connection, businessId: UUID): Boolean =
        conn.queryOne("SELECT EXISTS (SELECT 1 FROM businesses b WHERE b.id = ? AND $SIM_BUSINESS)", businessId) { it.getBoolean(1) }
            ?: false
}
