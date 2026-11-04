package ie.bookanything.payments

import com.stripe.exception.ApiConnectionException
import com.stripe.exception.IdempotencyException
import com.stripe.exception.InvalidRequestException
import com.stripe.exception.PermissionException
import com.stripe.exception.RateLimitException
import kotlin.test.Test
import kotlin.test.assertEquals

/** Which Stripe errors are refused for good (given up on) and which are retried (SdkStripeGateway). */
class StripeRefusalTest {
    @Test
    fun `invalid requests and lost access are refused for good, everything else is retried`() {
        val invalid = { code: String? -> InvalidRequestException("no", "payment_intent", "req_1", code, 400, null) }
        val cases = listOf(
            invalid("resource_missing") to true,
            invalid("charge_already_refunded") to true,
            invalid(null) to true,
            PermissionException("no access to the account", "req_2", null, 403) to true,
            // Clears by itself once the account has funds.
            invalid("balance_insufficient") to false,
            RateLimitException("slow down", null, "req_3", "rate_limit", 429, null) to false,
            IdempotencyException("in use", "req_4", "idempotency_key_in_use", 409) to false,
            ApiConnectionException("timed out") to false,
        )
        val names = cases.map { it.first.javaClass.simpleName }.toString()
        assertEquals(cases.map { it.second }, cases.map { refusedForGood(it.first) }, names)
    }

    @Test
    fun `only failed and canceled refunds are failures`() {
        assertEquals(
            listOf(
                RefundOutcome.SUCCEEDED, RefundOutcome.PENDING, RefundOutcome.PENDING, RefundOutcome.FAILED, RefundOutcome.FAILED,
                RefundOutcome.PENDING, RefundOutcome.PENDING,
            ),
            listOf("succeeded", "pending", "requires_action", "failed", "canceled", "something_new", null)
                .map(StripePaymentProvider::refundOutcome),
        )
    }
}
