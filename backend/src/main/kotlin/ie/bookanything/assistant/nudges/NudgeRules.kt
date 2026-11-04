package ie.bookanything.assistant.nudges

import ie.bookanything.ai.usage.CreditStatus
import ie.bookanything.business.BusinessRow
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.time.LocalDate
import kotlin.math.roundToInt

@Serializable
enum class NudgeKind(val key: String) {
    @SerialName("pending_approvals") PENDING_APPROVALS("pending_approvals"),
    @SerialName("no_show_streak") NO_SHOW_STREAK("no_show_streak"),
    @SerialName("quiet_tomorrow") QUIET_TOMORROW("quiet_tomorrow"),
    @SerialName("payments_not_set_up") PAYMENTS_NOT_SET_UP("payments_not_set_up"),
    @SerialName("site_not_published") SITE_NOT_PUBLISHED("site_not_published"),
    @SerialName("ai_credits_low") AI_CREDITS_LOW("ai_credits_low"),
}

@Serializable
enum class NudgeSeverity { @SerialName("info") INFO, @SerialName("warning") WARNING }

/** Where a nudge's button goes: a dashboard path relative to `/dashboard/{slug}/`. */
@Serializable
data class NudgeAction(val label: String, val path: String)

/**
 * Something worth the owner's attention. [key] includes a fingerprint of the facts (a count, a date), so a dismissed
 * nudge comes back when the situation changes. [prompt] starts a conversation with Bo about it.
 */
@Serializable
data class Nudge(
    val key: String,
    val kind: NudgeKind,
    val severity: NudgeSeverity,
    val title: String,
    val body: String,
    val prompt: String,
    val action: NudgeAction?,
)

/** The facts the rules look at, loaded once per refresh. */
data class NudgeFacts(
    val business: BusinessRow,
    val today: LocalDate,
    val pendingApprovals: Int,
    val noShows30d: Int,
    /** Services with no-shows in the last 30 days that take no payment up front. */
    val noShowServicesWithoutDeposit: List<String>,
    val tomorrowBookedMinutes: Int,
    val tomorrowAvailableMinutes: Int,
    val needsOnlinePayments: Boolean,
    val paymentsReady: Boolean,
    val sitePublished: Boolean,
    /** The deployment offers business websites (`SITES_ENABLED`); without them nothing mentions a site. */
    val sitesEnabled: Boolean = false,
    val credits: CreditStatus,
    /** Paid AI usage past the allowance is on (metered overage): AI keeps working once the credits are used. */
    val overage: Boolean,
    val modelConfigured: Boolean,
)

/** One deterministic check (no model calls). */
fun interface NudgeRule {
    fun evaluate(f: NudgeFacts): Nudge?
}

/** The nudge registry: adding a nudge is one entry in [ALL]. Pure. */
object NudgeRules {
    val PendingApprovals = NudgeRule { f ->
        val n = f.pendingApprovals
        if (n == 0) return@NudgeRule null
        val v = f.business.vocabulary
        val noun = (if (n == 1) v.booking else v.bookings).lowercase()
        Nudge(
            "pending_approvals:$n", NudgeKind.PENDING_APPROVALS, NudgeSeverity.WARNING,
            "$n $noun waiting for approval", "Accept or decline them so the times aren't held for nothing.",
            "Show me the ${v.bookings.lowercase()} waiting for my approval.", NudgeAction("Review", "bookings?status=pending_approval"),
        )
    }

    val NoShowStreak = NudgeRule { f ->
        if (f.noShows30d < NO_SHOW_THRESHOLD || f.noShowServicesWithoutDeposit.isEmpty()) return@NudgeRule null
        val services = f.noShowServicesWithoutDeposit.take(3).joinToString(", ")
        Nudge(
            "no_show_streak:${f.today.withDayOfMonth(1)}", NudgeKind.NO_SHOW_STREAK, NudgeSeverity.WARNING,
            "${f.noShows30d} no-shows in 30 days", "Taking a deposit on $services usually cuts no-shows.",
            "We've had ${f.noShows30d} no-shows in the last 30 days. Which services were affected, and should I take deposits?",
            NudgeAction("Open services", "services"),
        )
    }

    val QuietTomorrow = NudgeRule { f ->
        val available = f.tomorrowAvailableMinutes
        if (available < QUIET_MIN_OPEN_MINUTES) return@NudgeRule null
        val share = f.tomorrowBookedMinutes.toDouble() / available
        if (share >= QUIET_SHARE) return@NudgeRule null
        val tomorrow = f.today.plusDays(1)
        Nudge(
            "quiet_tomorrow:$tomorrow", NudgeKind.QUIET_TOMORROW, NudgeSeverity.INFO,
            "Tomorrow is quiet", "About ${(share * 100).roundToInt()}% of tomorrow is booked.",
            "Tomorrow looks quiet. What free times do we have, and who could I offer them to?",
            NudgeAction("Open calendar", "calendar?date=$tomorrow"),
        )
    }

    val PaymentsNotSetUp = NudgeRule { f ->
        if (!f.needsOnlinePayments || f.paymentsReady) return@NudgeRule null
        Nudge(
            "payments_not_set_up", NudgeKind.PAYMENTS_NOT_SET_UP, NudgeSeverity.WARNING,
            "Online payments aren't set up", "Services that take payment online can't be booked until you connect payments.",
            "Which of my services need online payments, and what happens until payments are set up?",
            NudgeAction("Set up payments", "settings/payments"),
        )
    }

    val SiteNotPublished = NudgeRule { f ->
        if (!f.sitesEnabled || f.sitePublished) return@NudgeRule null
        Nudge(
            "site_not_published", NudgeKind.SITE_NOT_PUBLISHED, NudgeSeverity.INFO,
            "Your site isn't published yet", "Visitors see a starter design. Publish your own when you're ready.",
            "What should I check before publishing my site?", NudgeAction("Open site editor", "site"),
        )
    }

    val AiCreditsLow = NudgeRule { f ->
        if (!f.modelConfigured || !f.credits.runningLow) return@NudgeRule null
        val c = f.credits
        val left = c.credit.of(c.remaining).toInt()
        val prompt = "How are my AI credits being used this month?"
        val usage = NudgeAction("See usage", "settings/billing")
        when {
            // With overage billing nothing pauses: say that extra use is billed rather than that Bo has stopped.
            c.limitReached && f.overage -> Nudge(
                "ai_credits_low:${c.period.start}:overage", NudgeKind.AI_CREDITS_LOW, NudgeSeverity.INFO,
                "Monthly AI credits used", "AI keeps working; extra use until ${c.period.resetsOn} is billed with your plan.",
                prompt, usage,
            )
            c.limitReached -> Nudge(
                "ai_credits_low:${c.period.start}", NudgeKind.AI_CREDITS_LOW, NudgeSeverity.WARNING, "AI credits used up",
                "${if (f.sitesEnabled) "Bo and the AI site builder are" else "Bo is"} paused until ${c.period.resetsOn}.", prompt, usage,
            )
            else -> Nudge(
                "ai_credits_low:${c.period.start}", NudgeKind.AI_CREDITS_LOW, NudgeSeverity.INFO, "Running low on AI credits",
                "$left credits left until ${c.period.resetsOn}.", prompt, usage,
            )
        }
    }

    val ALL: List<NudgeRule> = listOf(PendingApprovals, NoShowStreak, QuietTomorrow, PaymentsNotSetUp, SiteNotPublished, AiCreditsLow)

    fun evaluate(f: NudgeFacts, rules: List<NudgeRule> = ALL): List<Nudge> = rules.mapNotNull { it.evaluate(f) }

    const val NO_SHOW_THRESHOLD = 3
    const val QUIET_SHARE = 0.3
    const val QUIET_MIN_OPEN_MINUTES = 240
}
