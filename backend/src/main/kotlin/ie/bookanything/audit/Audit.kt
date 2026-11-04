package ie.bookanything.audit

import ie.bookanything.auth.Role
import ie.bookanything.db.Jsonb
import ie.bookanything.db.update
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.sql.Connection
import java.util.UUID

/**
 * Who performed a mutation. [via] names the client that acted for the user (e.g. the OAuth client id of an AI
 * assistant using the customer MCP); it is recorded in the summary.
 */
data class Actor(val type: ActorType, val userId: UUID? = null, val via: String? = null) {
    companion object {
        val SYSTEM = Actor(ActorType.SYSTEM)
        val GUEST = Actor(ActorType.GUEST)
        fun customer(userId: UUID?) = if (userId != null) Actor(ActorType.CUSTOMER, userId) else GUEST

        /** A member of the business acting in the dashboard: owners are recorded as `owner`, admins and staff as `member`. */
        fun member(role: Role, userId: UUID) = Actor(if (role == Role.OWNER) ActorType.OWNER else ActorType.MEMBER, userId)

        /** An AI feature acting for a signed-in member: Bo's confirmed actions, the site builder (sections 15 and 17). */
        fun ai(memberUserId: UUID) = Actor(ActorType.AI, memberUserId)

        /**
         * A member's own AI app (an OAuth client on the business MCP, section 20.7) acting for them: recorded as `ai`, like
         * Bo, with the client in [via].
         */
        fun agent(memberUserId: UUID, clientId: String) = Actor(ActorType.AI, memberUserId, via = "oauth:$clientId")

        /** An OAuth client (e.g. an AI assistant on the customer MCP) acting for a signed-in customer (section 20). */
        fun oauthClient(customerUserId: UUID, clientId: String) = Actor(ActorType.API, customerUserId, via = "oauth:$clientId")
    }
}

object Audit {
    fun record(
        conn: Connection,
        businessId: UUID,
        actor: Actor,
        action: String,
        entityType: String,
        entityId: UUID,
        summary: Map<String, Any?> = emptyMap(),
    ) {
        conn.update(
            """
            INSERT INTO audit_events (business_id, actor_type, actor_user_id, action, entity_type, entity_id, summary)
            VALUES (?, ?::actor_type, ?, ?, ?, ?, ?)
            """.trimIndent(),
            businessId, actor.type, actor.userId, action, entityType, entityId,
            Jsonb(toJson(if (actor.via != null) summary + ("via" to actor.via) else summary)),
        )
    }

    private fun toJson(map: Map<String, Any?>): JsonObject = JsonObject(map.mapValues { (_, v) -> toElement(v) })

    private fun toElement(v: Any?): JsonElement = when (v) {
        null -> JsonNull
        is JsonElement -> v
        is String -> JsonPrimitive(v)
        is Number -> JsonPrimitive(v)
        is Boolean -> JsonPrimitive(v)
        is Enum<*> -> JsonPrimitive(v.name.lowercase()) // As db/Sql binds it: the wire value of our status enums.
        is Map<*, *> -> JsonObject(v.entries.associate { (k, value) -> (k?.toString() ?: "null") to toElement(value) })
        is Collection<*> -> kotlinx.serialization.json.JsonArray(v.map(::toElement))
        else -> JsonPrimitive(v.toString())
    }
}
