package ie.bookanything.payments

import java.time.Duration
import java.time.Instant

/** Staff override for a business cancellation: "policy" | "full" | "none". */
enum class RefundOverride {
    POLICY, FULL, NONE;

    val key: String get() = name.lowercase()

    companion object {
        /** `policy`, `full` or `none`; null for anything else. */
        fun parse(raw: String): RefundOverride? = entries.firstOrNull { it.key == raw }
    }
}

data class RefundDecision(val amountCents: Int, val reason: String)

/**
 * Pure refund policy (docs/architecture.md section 7):
 * - business (or system) cancels → full refund of amount paid;
 * - customer cancels ≥ cancellation_notice_hours before start → full refund;
 * - later → late_cancellation_refund_percent of amount paid (rounded down);
 * - staff may override with "full" or "none".
 */
object RefundPolicy {
    fun decide(
        actor: CancelActor,
        now: Instant,
        start: Instant,
        cancellationNoticeHours: Int,
        lateCancellationRefundPercent: Int,
        amountPaidCents: Int,
        amountRefundedCents: Int,
        override: RefundOverride = RefundOverride.POLICY,
    ): RefundDecision {
        val refundable = (amountPaidCents - amountRefundedCents).coerceAtLeast(0)
        if (refundable == 0) return RefundDecision(0, "Nothing has been paid.")
        return when (override) {
            RefundOverride.FULL -> RefundDecision(refundable, "Full refund issued by the business.")
            RefundOverride.NONE -> RefundDecision(0, "No refund (business decision).")
            RefundOverride.POLICY -> when (actor) {
                CancelActor.BUSINESS, CancelActor.SYSTEM -> RefundDecision(refundable, "Cancelled by the business: full refund.")
                CancelActor.CUSTOMER -> {
                    val notice = Duration.ofHours(cancellationNoticeHours.toLong())
                    if (!now.plus(notice).isAfter(start)) {
                        RefundDecision(refundable, "Cancelled at least $cancellationNoticeHours hours before the start: full refund.")
                    } else {
                        val pct = lateCancellationRefundPercent.coerceIn(0, 100)
                        val amount = minOf(refundable, (amountPaidCents.toLong() * pct / 100).toInt())
                        RefundDecision(
                            amount,
                            if (pct == 0) {
                                "Cancelled less than $cancellationNoticeHours hours before the start: no refund."
                            } else {
                                "Cancelled less than $cancellationNoticeHours hours before the start: $pct% refund."
                            },
                        )
                    }
                }
            }
        }
    }
}
