package ie.bookanything.assistant.memory

import ie.bookanything.audit.Actor
import ie.bookanything.audit.Audit
import ie.bookanything.auth.BusinessAccess
import ie.bookanything.auth.Role
import ie.bookanything.http.Errors
import ie.bookanything.http.Validator
import java.sql.Connection
import java.time.Instant
import java.util.UUID

/**
 * Business memory commands, shared by the owner's memory editor and the assistant's `update_memory` tool. Owners and
 * admins only; audited with the given actor. At most [MAX_ENTRIES] entries of [MAX_LENGTH] characters, so the
 * context stays small.
 */
object MemoryCommands {
    const val MAX_ENTRIES = 30
    const val MAX_LENGTH = 280

    fun text(raw: String?): String {
        val v = Validator()
        val text = v.requireText(raw, "text", MAX_LENGTH)
        v.throwIfInvalid()
        return text!!
    }

    fun add(conn: Connection, access: BusinessAccess, raw: String?, actor: Actor, now: Instant): MemoryRow {
        access.requireRole(Role.ADMIN)
        val text = text(raw)
        if (MemoryRepository.count(conn, access.businessId) >= MAX_ENTRIES) {
            throw Errors.conflict("Bo can remember up to $MAX_ENTRIES things. Remove one first.")
        }
        val id = MemoryRepository.insert(conn, access.businessId, text, access.user.id, now)
        Audit.record(conn, access.businessId, actor, "assistant.memory_added", "assistant_memory", id, mapOf("text" to text))
        return MemoryRepository.get(conn, access.businessId, id)!!
    }

    fun update(conn: Connection, access: BusinessAccess, id: UUID, raw: String?, actor: Actor, now: Instant): MemoryRow {
        access.requireRole(Role.ADMIN)
        val text = text(raw)
        if (!MemoryRepository.update(conn, access.businessId, id, text, now)) throw Errors.notFound("Memory")
        Audit.record(conn, access.businessId, actor, "assistant.memory_updated", "assistant_memory", id, mapOf("text" to text))
        return MemoryRepository.get(conn, access.businessId, id)!!
    }

    fun delete(conn: Connection, access: BusinessAccess, id: UUID, actor: Actor) {
        access.requireRole(Role.ADMIN)
        if (!MemoryRepository.delete(conn, access.businessId, id)) throw Errors.notFound("Memory")
        Audit.record(conn, access.businessId, actor, "assistant.memory_deleted", "assistant_memory", id)
    }
}
