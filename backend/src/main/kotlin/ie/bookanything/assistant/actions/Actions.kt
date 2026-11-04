package ie.bookanything.assistant.actions

import ie.bookanything.assistant.tools.ActionResult
import ie.bookanything.assistant.tools.Proposal
import ie.bookanything.http.formatInstant
import ie.bookanything.http.formatInstantOrNull
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

@Serializable
enum class ActionStatus(val key: String) {
    @SerialName("pending") PENDING("pending"),
    @SerialName("confirmed") CONFIRMED("confirmed"),
    @SerialName("rejected") REJECTED("rejected"),
    @SerialName("expired") EXPIRED("expired"),
    @SerialName("failed") FAILED("failed"),
    ;

    companion object {
        fun parse(key: String) = entries.first { it.key == key }
    }
}

/**
 * A proposal from a write tool, pending until the member who asked confirms or rejects it. It came from Bo's chat
 * ([threadId] and the model's [toolUseId]) or from one of the member's connected apps ([oauthGrantId]), never both.
 */
data class ActionRow(
    val id: UUID,
    val threadId: UUID?,
    val userId: UUID,
    val tool: String,
    val toolUseId: String?,
    val input: JsonObject,
    val proposal: Proposal,
    val status: ActionStatus,
    val result: ActionResult?,
    val error: String?,
    val expiresAt: Instant,
    val createdAt: Instant,
    val decidedAt: Instant?,
    val oauthGrantId: UUID? = null,
    /** An app's proposal the member must approve on bookanything: the app can't confirm it itself (section 20.8). */
    val needsApproval: Boolean = false,
    /** The connected app that made it; null for Bo's. */
    val app: ActionApp? = null,
) {
    /** Pending past its expiry reads as expired (nothing needs to rewrite the row). */
    fun effectiveStatus(now: Instant) = if (status == ActionStatus.PENDING && !expiresAt.isAfter(now)) ActionStatus.EXPIRED else status

    fun toDto(zone: ZoneId, now: Instant) = ActionDto(
        id.toString(), tool, effectiveStatus(now), proposal, result, error, formatInstant(expiresAt, zone), formatInstant(createdAt, zone),
        formatInstantOrNull(decidedAt, zone),
    )
}

/** The connected app behind a proposal: its client id, its name as it registered, and whether it was disconnected since. */
data class ActionApp(val clientId: String, val name: String, val revoked: Boolean)

/**
 * A write tool's proposal to store as a pending action: [toolUseId] ties it to the model's tool call in [threadId], or
 * [oauthGrantId] to the connected app that asked for it.
 */
data class NewAction(
    val threadId: UUID?,
    val userId: UUID,
    val tool: String,
    val toolUseId: String?,
    val input: JsonObject,
    val proposal: Proposal,
    val expiresAt: Instant,
    val oauthGrantId: UUID? = null,
    val needsApproval: Boolean = false,
)

@Serializable
data class ActionDto(
    val id: String,
    val tool: String,
    val status: ActionStatus,
    val proposal: Proposal,
    val result: ActionResult?,
    val error: String?,
    val expiresAt: String,
    val createdAt: String,
    val decidedAt: String?,
)

/** One of the member's AI apps' proposals, as the approvals page shows it (section 20.8). */
@Serializable
data class AgentRequestDto(
    val action: ActionDto,
    /** The app's name, as it registered (e.g. "Claude"). */
    val app: String,
    /** True when it waits for the member to approve it here; false when the app may confirm it itself. */
    val needsApproval: Boolean,
    /** The app was disconnected since: its proposals can't go ahead. */
    val appDisconnected: Boolean,
)

@Serializable
data class AgentRequestList(val items: List<AgentRequestDto>)
