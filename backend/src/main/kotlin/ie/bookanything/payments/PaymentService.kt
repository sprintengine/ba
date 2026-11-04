package ie.bookanything.payments

import ie.bookanything.business.BusinessRow
import ie.bookanything.http.Errors
import java.sql.Connection
import java.util.UUID

/** Charges and refunds: calls the [provider] and keeps the ledger ([PaymentRepository]) in step with it. */
class PaymentService(val provider: PaymentProvider) {

    /**
     * Records a pending charge in the caller's transaction and returns the hosted checkout to create for it. The provider
     * is called with it ([PaymentProvider.createCheckout]) only after that transaction commits, so the booking's locks
     * are never held while the provider answers; the session is then stored with [PaymentRepository.setCheckout].
     */
    fun prepareCharge(conn: Connection, business: BusinessRow, charge: ChargeRequest): CheckoutRequest {
        if (!provider.chargesEnabled(business)) throw Errors.paymentsNotConfigured()
        val paymentId = PaymentRepository.insertCharge(
            conn, business.id, charge.bookingId, provider.name, charge.amountCents, business.currency, charge.returnUrl,
        )
        return CheckoutRequest(
            paymentId, charge.bookingId, business, charge.amountCents, business.currency, charge.description, charge.customerEmail,
            charge.expiresAt, charge.successUrl, charge.cancelUrl,
        )
    }

    /**
     * Records a pending refund of [amountCents] of the booking's online charge in the caller's transaction; null when
     * there is nothing to refund. The provider is called after that transaction commits ([sendRefund], from the
     * `payment_refund_retry` job), so the booking's locks are never held while it answers.
     */
    fun recordRefund(conn: Connection, business: BusinessRow, bookingId: UUID, amountCents: Int): UUID? {
        if (amountCents <= 0) return null
        val charge = PaymentRepository.succeededCharge(conn, business.id, bookingId) ?: return null
        return PaymentRepository.insertRefund(conn, charge, amountCents)
    }

    /**
     * The refund [refundId] and its charge while it still waits for the provider's answer; null once settled (or when
     * its charge is gone, which fails it).
     */
    fun refundToSend(conn: Connection, business: BusinessRow, refundId: UUID): RefundToSend? {
        val refund = PaymentRepository.get(conn, refundId) ?: return null
        if (refund.kind != "refund" || refund.status != "pending" || refund.providerRef != null) return null
        val charge = PaymentRepository.succeededCharge(conn, business.id, refund.bookingId) ?: run {
            PaymentRepository.setStatus(conn, refundId, "failed")
            return null
        }
        return RefundToSend(refund, charge)
    }

    /**
     * Sends a recorded refund to the provider. Call it outside any transaction: the provider's idempotency key is the
     * refund's id, so sending it again (a retry after a timeout) never refunds twice.
     */
    fun sendRefund(business: BusinessRow, send: RefundToSend): RefundResult {
        val (refund, charge) = send
        return if (charge.provider == "dev" && provider.name != "dev") {
            // Development money recorded before Stripe was configured: nothing to send back.
            RefundResult("dev_re_${refund.id}", true)
        } else {
            provider.refund(RefundRequest(refund.id, business, charge.providerRef, refund.amountCents, charge.currency))
        }
    }

    /**
     * Stores the provider's answer for a refund still waiting for it (a `charge.refunded` event may have settled it
     * meanwhile: then nothing changes) and updates the booking's refunded total. Returns the amount newly refunded.
     */
    fun applyRefundResult(conn: Connection, business: BusinessRow, refundId: UUID, result: RefundResult): Int {
        val refund = PaymentRepository.get(conn, refundId, forUpdate = true) ?: return 0
        if (refund.status != "pending" || refund.providerRef != null) return 0
        PaymentRepository.setRefundOutcome(conn, refundId, result)
        if (!result.succeeded) return 0
        PaymentRepository.recomputeRefunded(conn, business.id, refund.bookingId)
        return refund.amountCents
    }

    /**
     * Reconciles the ledger with the provider's refunded total for a charge (Stripe
     * `charge.refunded`): pending refunds are settled and refunds made outside bookanything (for
     * example in the Stripe dashboard) are recorded. Returns the newly recognised amount.
     *
     * Pending refunds whose provider call failed (no provider reference, waiting for `payment_refund_retry`) are settled
     * too: a call that timed out may still have made the refund, and the retry would replay it with the same
     * idempotency key. Recording the provider's total as an outside refund instead counted that money twice.
     */
    fun reconcileRefunds(conn: Connection, charge: PaymentRow, providerRefundedTotal: Int): Int {
        val refunds = PaymentRepository.forBooking(conn, charge.businessId, charge.bookingId).filter { it.kind == "refund" }
        var recognised = refunds.filter { it.status == "succeeded" }.sumOf { it.amountCents }
        val before = recognised
        for (r in refunds.filter { it.status == "pending" }) {
            if (recognised + r.amountCents > providerRefundedTotal) break
            PaymentRepository.setStatus(conn, r.id, "succeeded")
            recognised += r.amountCents
        }
        if (providerRefundedTotal > recognised) {
            PaymentRepository.insertExternalRefund(conn, charge, providerRefundedTotal - recognised)
            recognised = providerRefundedTotal
        }
        PaymentRepository.recomputeRefunded(conn, charge.businessId, charge.bookingId)
        return recognised - before
    }

    companion object {
        /**
         * The job that sends a recorded refund to the provider: run right after the commit that recorded it, and retried
         * from the queue while the provider fails (the name dates from when it only did the retries).
         */
        const val REFUND_RETRY_JOB = "payment_refund_retry"
    }
}

/** A recorded refund waiting for the provider, and the charge it returns money from. */
data class RefundToSend(val refund: PaymentRow, val charge: PaymentRow)
