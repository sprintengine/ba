package ie.bookanything.payments

import ie.bookanything.db.queryOne
import ie.bookanything.db.update
import ie.bookanything.db.uuid
import java.sql.Connection
import java.util.UUID

/** The Stripe columns of `businesses`: the Connect account and its status, the billing customer and the plan. */
object StripeAccountRepository {
    fun setConnectStatus(conn: Connection, businessId: UUID, chargesEnabled: Boolean, detailsSubmitted: Boolean) {
        conn.update(
            "UPDATE businesses SET stripe_charges_enabled = ?, stripe_details_submitted = ?, updated_at = now() WHERE id = ?",
            chargesEnabled, detailsSubmitted, businessId,
        )
    }

    /** Stores the account's status on the business that owns it, if it changed; returns that business's id. */
    fun updateConnectStatus(conn: Connection, accountId: String, chargesEnabled: Boolean, detailsSubmitted: Boolean): UUID? =
        conn.queryOne(
            """
            UPDATE businesses SET stripe_charges_enabled = ?, stripe_details_submitted = ?, updated_at = now()
            WHERE stripe_account_id = ? AND (stripe_charges_enabled <> ? OR stripe_details_submitted <> ?) RETURNING id
            """.trimIndent(),
            chargesEnabled, detailsSubmitted, accountId, chargesEnabled, detailsSubmitted,
        ) { it.uuid("id") }

    /** Records a newly created Connect account unless the business already has one. */
    fun setAccountIdIfMissing(conn: Connection, businessId: UUID, accountId: String) {
        conn.update(
            "UPDATE businesses SET stripe_account_id = ?, updated_at = now() WHERE id = ? AND stripe_account_id IS NULL",
            accountId, businessId,
        )
    }

    /** Records a newly created billing customer unless the business already has one. */
    fun setCustomerIdIfMissing(conn: Connection, businessId: UUID, customerId: String) {
        conn.update(
            "UPDATE businesses SET stripe_customer_id = ?, updated_at = now() WHERE id = ? AND stripe_customer_id IS NULL",
            customerId, businessId,
        )
    }

    /** A completed billing checkout: keeps the existing billing customer, else records [customerId]; touches the business. */
    fun checkoutCompleted(conn: Connection, businessId: UUID, customerId: String?) {
        conn.update(
            "UPDATE businesses SET stripe_customer_id = COALESCE(stripe_customer_id, ?), updated_at = now() WHERE id = ?",
            customerId, businessId,
        )
    }

    fun businessIdByCustomer(conn: Connection, customerId: String): UUID? =
        conn.queryOne("SELECT id FROM businesses WHERE stripe_customer_id = ?", customerId) { it.uuid("id") }

    /** Applies a subscription change; the billing customer is recorded if missing. */
    fun setPlan(conn: Connection, businessId: UUID, change: PlanMapping.Change, customerId: String?) {
        conn.update(
            """
            UPDATE businesses SET plan = ?::business_plan, plan_status = ?, stripe_subscription_id = ?,
                stripe_customer_id = COALESCE(stripe_customer_id, ?), updated_at = now() WHERE id = ?
            """.trimIndent(),
            change.plan.wire, change.planStatus, change.subscriptionId, customerId, businessId,
        )
    }

    fun markPastDue(conn: Connection, businessId: UUID) {
        conn.update("UPDATE businesses SET plan_status = 'past_due', updated_at = now() WHERE id = ?", businessId)
    }
}
