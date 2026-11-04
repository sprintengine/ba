package ie.bookanything.assistant.nudges

import ie.bookanything.ai.usage.AiMeter
import ie.bookanything.audit.Audit
import ie.bookanything.auth.BusinessAccess
import ie.bookanything.business.BusinessRepository
import ie.bookanything.business.BusinessRow
import ie.bookanything.db.Db
import ie.bookanything.http.Errors
import ie.bookanything.http.formatInstant
import ie.bookanything.payments.PaymentProvider
import ie.bookanything.reports.ReportRepository
import ie.bookanything.services.ServiceRepository
import kotlinx.serialization.Serializable
import org.slf4j.LoggerFactory
import java.sql.Connection
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

@Serializable
data class NudgeDto(
    val id: String,
    val kind: NudgeKind,
    val severity: NudgeSeverity,
    val title: String,
    val body: String,
    val prompt: String,
    val action: NudgeAction?,
    val createdAt: String,
)

data class NudgeRow(val id: UUID, val nudge: Nudge, val createdAt: Instant) {
    fun toDto(zone: ZoneId) = NudgeDto(
        id.toString(), nudge.kind, nudge.severity, nudge.title, nudge.body, nudge.prompt, nudge.action, formatInstant(createdAt, zone),
    )
}

/**
 * Deterministic attention items for owners and admins (no model calls): refreshed on demand when the assistant opens
 * and by a periodic job for recently active businesses. Dismissed nudges stay dismissed until their fingerprint changes.
 */
class NudgeService(
    private val db: Db,
    private val clock: Clock,
    private val payments: PaymentProvider,
    private val meter: AiMeter,
    private val modelConfigured: Boolean,
    private val sitesEnabled: Boolean = false,
    private val rules: List<NudgeRule> = NudgeRules.ALL,
) {
    private val log = LoggerFactory.getLogger(NudgeService::class.java)

    fun facts(conn: Connection, b: BusinessRow): NudgeFacts {
        val now = clock.instant()
        val today = LocalDate.ofInstant(now, b.zone)
        val monthAgo = now.minus(Duration.ofDays(30))
        // Only tomorrow needs the report (booked against open minutes); the month's no-shows are one count.
        val tomorrow = ReportRepository.summary(conn, b, today.plusDays(1), today.plusDays(1)).byResource
        return NudgeFacts(
            business = b, today = today,
            pendingApprovals = NudgeRepository.pendingApprovals(conn, b.id, now),
            noShows30d = NudgeRepository.noShows(conn, b.id, monthAgo, now),
            noShowServicesWithoutDeposit = NudgeRepository.noShowServicesWithoutDeposit(conn, b.id, monthAgo, now),
            tomorrowBookedMinutes = tomorrow.sumOf { it.bookedMinutes },
            tomorrowAvailableMinutes = tomorrow.sumOf { it.availableMinutes },
            needsOnlinePayments = ServiceRepository.anyNeedsOnlinePayment(conn, b.id),
            paymentsReady = payments.chargesEnabled(b),
            sitePublished = sitesEnabled && NudgeRepository.sitePublished(conn, b.id),
            sitesEnabled = sitesEnabled,
            credits = meter.status(conn, b),
            overage = meter.overageFor(b),
            modelConfigured = modelConfigured,
        )
    }

    /** When each business's nudges were last re-evaluated by this process. */
    private val refreshedAt = ConcurrentHashMap<UUID, Instant>()

    /**
     * The active nudges for the assistant panel: re-evaluated first only when this process hasn't done so for [b] in
     * the last [FRESH_FOR] (opening Bo must stay cheap; the periodic job keeps every business current).
     */
    fun current(conn: Connection, b: BusinessRow): List<NudgeRow> {
        val last = refreshedAt[b.id]
        val fresh = last != null && Duration.between(last, clock.instant()) < FRESH_FOR
        return if (fresh) NudgeRepository.active(conn, b.id) else refresh(conn, b)
    }

    /** Re-evaluates every rule for [b] and returns the active (undismissed) nudges. */
    fun refresh(conn: Connection, b: BusinessRow): List<NudgeRow> {
        val now = clock.instant()
        val current = NudgeRules.evaluate(facts(conn, b), rules)
        current.forEach { NudgeRepository.upsert(conn, b.id, it, now) }
        NudgeRepository.resolveOthers(conn, b.id, current.map { it.key }, now)
        refreshedAt[b.id] = now
        return NudgeRepository.active(conn, b.id)
    }

    fun dismiss(conn: Connection, access: BusinessAccess, id: UUID) {
        if (!NudgeRepository.dismiss(conn, access.businessId, id, clock.instant())) throw Errors.notFound("Nudge")
        Audit.record(conn, access.businessId, access.actor, "assistant.nudge_dismissed", "assistant_nudge", id)
    }

    /**
     * The periodic job: refreshes the active businesses with activity in the last [RECENT] (the others' nudges are
     * re-evaluated when someone opens Bo). One business failing doesn't stop the rest. Returns the number refreshed.
     */
    fun refreshAll(): Int {
        val ids = db.txBlocking { conn -> NudgeRepository.recentlyActive(conn, clock.instant().minus(RECENT)) }
        return ids.count { id ->
            try {
                db.txBlocking(id) { conn -> BusinessRepository.findById(conn, id)?.let { refresh(conn, it) } } != null
            } catch (@Suppress("TooGenericExceptionCaught") e: Exception) { // Per business: log it and go on to the next.
                log.warn("nudge refresh failed for business {}: {}", id, e.message)
                false
            }
        }
    }

    companion object {
        /** How long the panel shows nudges without re-evaluating them. */
        val FRESH_FOR: Duration = Duration.ofMinutes(5)

        /** Businesses the periodic job keeps current: activity within this long. */
        val RECENT: Duration = Duration.ofDays(14)
    }
}
