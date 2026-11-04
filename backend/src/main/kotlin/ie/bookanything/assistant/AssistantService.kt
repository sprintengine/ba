package ie.bookanything.assistant

import ie.bookanything.ai.usage.AiMeter
import ie.bookanything.ai.usage.AiUsageService
import ie.bookanything.assistant.actions.ActionRepository
import ie.bookanything.assistant.nudges.NudgeService
import ie.bookanything.auth.BusinessAccess
import ie.bookanything.auth.Role
import ie.bookanything.db.Db
import ie.bookanything.http.Errors
import ie.bookanything.http.Validator
import ie.bookanything.http.formatInstant
import java.sql.Connection
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

/**
 * Bo's conversations and state: threads are per member per business (nobody else can read them), nudges are for
 * owners and admins. [runner] is null when no model is configured (degraded mode: the panel still opens with nudges
 * and quick actions, but sending a message answers 503 AI_NOT_CONFIGURED).
 */
class AssistantService(
    private val db: Db,
    private val clock: Clock,
    private val runner: TurnRunner?,
    private val views: ConversationViews,
    private val nudges: NudgeService,
    private val usage: AiUsageService,
    private val meter: AiMeter,
) {
    val configured: Boolean get() = runner != null

    suspend fun state(access: BusinessAccess): AssistantStateDto = db.tx(access.businessId) { conn ->
        val zone = access.business.zone
        AssistantStateDto(
            configured = configured,
            credits = usage.credits(conn, access.business),
            nudges = if (access.role.atLeast(Role.ADMIN)) nudges.current(conn, access.business).map { it.toDto(zone) } else emptyList(),
            threads = threads(conn, access),
            canEditMemory = access.role.atLeast(Role.ADMIN),
        )
    }

    /** The member's recent conversations (`GET /assistant/threads`: no credits or nudges). */
    suspend fun threads(access: BusinessAccess): List<ThreadSummaryDto> = db.read(access.businessId) { conn -> threads(conn, access) }

    private fun threads(conn: Connection, access: BusinessAccess): List<ThreadSummaryDto> =
        ConversationRepository.threads(conn, access.businessId, access.user.id, RECENT_THREADS)
            .map { ThreadSummaryDto(it.id.toString(), it.title, formatInstant(it.updatedAt, access.business.zone)) }

    suspend fun createThread(access: BusinessAccess, title: String?): ThreadDto = db.tx(access.businessId) { conn ->
        val v = Validator()
        val t = v.requireText(title, "title", 120, required = false)
        v.throwIfInvalid()
        val row = ConversationRepository.createThread(conn, access.businessId, access.user.id, t.orEmpty(), clock.instant())
        view(conn, access, row)
    }

    suspend fun thread(access: BusinessAccess, id: UUID): ThreadDto = db.read(access.businessId) { conn ->
        view(conn, access, own(conn, access, id))
    }

    /** Deletes a conversation, but not while Bo is answering in it (the turn would keep writing to it). */
    suspend fun deleteThread(access: BusinessAccess, id: UUID) = db.tx(access.businessId) { conn ->
        val thread = own(conn, access, id)
        if (thread.busyUntil?.isAfter(clock.instant()) == true) throw Errors.conflict(STILL_ANSWERING)
        ConversationRepository.deleteThread(conn, access.businessId, id)
    }

    /** A turn claimed with [begin]: the words to send, and the thread's claim, moved on before every model call. */
    class TurnClaim internal constructor(val text: String, @Volatile internal var until: Instant)

    /**
     * Checks everything a turn needs before the stream starts (so failures are ordinary JSON errors): the thread is the
     * member's, a model is configured, credits are left, and no other turn is running in the thread (claimed here).
     */
    suspend fun begin(access: BusinessAccess, threadId: UUID, rawText: String?): TurnClaim {
        val v = Validator()
        val text = v.requireText(rawText, "text", MAX_MESSAGE)
        v.throwIfInvalid()
        if (runner == null) throw Errors.aiNotConfigured()
        val now = clock.instant()
        val until = claimUntil(now)
        db.tx(access.businessId) { conn ->
            own(conn, access, threadId)
            meter.requireAllowed(conn, access.business)
            if (!ConversationRepository.claim(conn, access.businessId, threadId, now, until)) throw Errors.conflict(STILL_ANSWERING)
        }
        return TurnClaim(text!!, until)
    }

    /** Runs a turn claimed with [begin], keeping the claim alive step by step, and releases it. Blocking. */
    fun run(access: BusinessAccess, threadId: UUID, claim: TurnClaim, requestId: String?, emit: (TurnEvent) -> Unit) {
        try {
            val turn = runner ?: throw Errors.aiNotConfigured()
            turn.run(access, threadId, claim.text, requestId, keepAlive = { extend(access, threadId, claim) }, emit = emit)
        } finally {
            db.txBlocking(access.businessId) { ConversationRepository.release(it, access.businessId, threadId, claim.until) }
        }
    }

    /** Pushes the claim [TURN_TIMEOUT] past now; a turn whose claim ran out and was taken by another stops. */
    private fun extend(access: BusinessAccess, threadId: UUID, claim: TurnClaim) {
        val until = claimUntil(clock.instant())
        val kept = db.txBlocking(access.businessId) {
            ConversationRepository.extend(it, access.businessId, threadId, claim.until, until)
        }
        if (!kept) throw Errors.conflict("This conversation was picked up again elsewhere, so I stopped here.")
        claim.until = until
    }

    /** Microseconds, as Postgres stores them, so the claim compares equal when it is read back. */
    private fun claimUntil(now: Instant): Instant = now.plus(TURN_TIMEOUT).truncatedTo(ChronoUnit.MICROS)

    suspend fun dismissNudge(access: BusinessAccess, id: UUID) = db.tx(access.businessId) { conn -> nudges.dismiss(conn, access, id) }

    private fun own(conn: Connection, access: BusinessAccess, id: UUID): ThreadRow =
        ConversationRepository.thread(conn, access.businessId, id)?.takeIf {
            it.userId == access.user.id
        } ?: throw Errors.notFound("Conversation")

    private fun view(conn: Connection, access: BusinessAccess, row: ThreadRow): ThreadDto {
        val zone = access.business.zone
        val messages = ConversationRepository.messages(conn, access.businessId, row.id)
        val actions = ActionRepository.forThread(conn, access.businessId, row.id)
        return ThreadDto(
            row.id.toString(), row.title, formatInstant(row.createdAt, zone), formatInstant(row.updatedAt, zone),
            views.bubbles(messages, actions, zone, clock.instant()),
        )
    }

    companion object {
        const val MAX_MESSAGE = 2_000
        const val RECENT_THREADS = 20

        /** A crashed turn frees its thread this long after its last step started. */
        val TURN_TIMEOUT: Duration = Duration.ofMinutes(5)

        private const val STILL_ANSWERING = "Bo is still answering in this conversation."
    }
}
