package ie.bookanything.payments

import ie.bookanything.business.Plan
import ie.bookanything.config.StripeConfig

/**
 * Maps a Stripe subscription to the business's plan (docs/architecture.md section 7).
 * Pure, so the mapping is unit-tested without Stripe.
 */
object PlanMapping {
    data class Change(val plan: Plan, val planStatus: String, val subscriptionId: String?)

    fun planForPrices(priceIds: List<String>, config: StripeConfig, metadataPlan: String?): Plan? = when {
        config.priceBusiness != null && config.priceBusiness in priceIds -> Plan.BUSINESS
        config.pricePro != null && config.pricePro in priceIds -> Plan.PRO
        else -> Plan.parseOrNull(metadataPlan)?.takeIf { it.isPaid }
    }

    /**
     * Returns the new plan state, or null when the event must be ignored (for example an old
     * subscription being cancelled after the business already moved to a new one).
     */
    fun fromSubscription(
        eventType: String, subscriptionId: String, status: String, priceIds: List<String>, metadataPlan: String?,
        config: StripeConfig, currentPlan: Plan, currentSubscriptionId: String?,
    ): Change? {
        val isCurrent = currentSubscriptionId == null || currentSubscriptionId == subscriptionId
        val plan = planForPrices(priceIds, config, metadataPlan)
        if (eventType == "customer.subscription.deleted") {
            return if (isCurrent) Change(Plan.FREE, "canceled", null) else null
        }
        return when (status) {
            "active", "trialing" -> Change(plan ?: currentPlan, status, subscriptionId)
            // Keep the plan while Stripe retries the payment (dunning).
            "past_due" -> if (isCurrent) Change(plan ?: currentPlan, status, subscriptionId) else null
            // Not paid yet: never upgrade, and don't let it replace a working subscription.
            "incomplete" -> if (isCurrent) Change(currentPlan, status, subscriptionId) else null
            "incomplete_expired", "canceled" -> if (isCurrent) Change(Plan.FREE, status, null) else null
            "unpaid", "paused" -> if (isCurrent) Change(Plan.FREE, status, subscriptionId) else null
            else -> null
        }
    }
}
