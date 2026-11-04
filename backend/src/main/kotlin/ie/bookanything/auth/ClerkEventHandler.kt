package ie.bookanything.auth

import ie.bookanything.audit.Actor
import ie.bookanything.audit.Audit
import ie.bookanything.business.BusinessRepository
import ie.bookanything.customers.CustomerRepository
import ie.bookanything.mcp.customer.CustomerRequests
import ie.bookanything.notifications.inbox.InboxRepository
import ie.bookanything.notifications.push.PushDeviceRepository
import ie.bookanything.oauth.PgTokenStore
import ie.bookanything.team.TeamRepository
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.slf4j.LoggerFactory
import java.sql.Connection

/** Applies Clerk user events to `users`, `customers` and `business_members`. */
class ClerkEventHandler {
    private val log = LoggerFactory.getLogger(ClerkEventHandler::class.java)

    fun handle(conn: Connection, type: String, data: JsonObject) {
        when (type) {
            "user.created", "user.updated" -> upsert(conn, data)
            "user.deleted" -> data.str("id")?.let { delete(conn, it) }
        }
    }

    private fun upsert(conn: Connection, data: JsonObject) {
        val id = data.str("id") ?: return
        // Svix may deliver an older user.created/updated after user.deleted: it must not undo the anonymisation.
        if (UserRepository.isDeleted(conn, id)) {
            log.info("ignored a stale event for deleted clerk user {}", id)
            return
        }
        val primaryId = data.str("primary_email_address_id")
        val emails = (data["email_addresses"] as? JsonArray).orEmpty().mapNotNull { it as? JsonObject }
        val primary = emails.firstOrNull { it.str("id") == primaryId } ?: emails.firstOrNull()
        val email = primary?.str("email_address")?.lowercase()
        val verified = (primary?.get("verification") as? JsonObject)?.str("status") == "verified"
        val name = listOfNotNull(data.str("first_name"), data.str("last_name")).joinToString(" ").trim().ifEmpty { null }
            ?: data.str("username")
        UserAccounts.upsert(conn, VerifiedIdentity(id, email, verified, name))
    }

    /**
     * Anonymises the user, disconnects their AI apps (every OAuth grant and token), forgets their notifications and the
     * phones they got them on, unlinks their customer records (the business keeps its own booking history) and removes
     * memberships. A business whose last owner is deleted is kept
     * but suspended so it can be recovered by support.
     */
    fun delete(conn: Connection, clerkUserId: String) {
        val userId = UserRepository.lockByClerkId(conn, clerkUserId) ?: return
        UserRepository.anonymise(conn, userId)
        PgTokenStore.revokeAllForUser(conn, userId)
        CustomerRepository.unlinkUser(conn, userId)
        InboxRepository.forgetUser(conn, userId)
        PushDeviceRepository.forgetUser(conn, userId)
        CustomerRequests.forgetUser(conn, userId)
        val memberships = TeamRepository.activeMembershipsForUpdate(conn, userId)
        for ((businessId, role) in memberships) {
            TeamRepository.markRemovedByUser(conn, businessId, userId)
            Audit.record(
                conn, businessId, Actor.SYSTEM, "member.removed", "business", businessId,
                mapOf("reason" to "user_deleted", "role" to role.value),
            )
            if (role == Role.OWNER && TeamRepository.ownerCount(conn, businessId) == 0L) {
                BusinessRepository.suspend(conn, businessId)
                Audit.record(
                    conn, businessId, Actor.SYSTEM, "business.suspended", "business", businessId, mapOf("reason" to "last_owner_deleted"),
                )
                log.warn("business {} suspended: its last owner (user {}) was deleted in Clerk", businessId, userId)
            }
        }
        log.info("clerk user {} deleted: anonymised user {}, removed {} memberships", clerkUserId, userId, memberships.size)
    }

    private fun JsonObject.str(key: String): String? = (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content
}
