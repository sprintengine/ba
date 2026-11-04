package ie.bookanything.payments

import com.stripe.exception.SignatureVerificationException
import com.stripe.net.Webhook
import ie.bookanything.config.StripeConfig
import ie.bookanything.http.Errors
import java.time.Clock

/** Signature verification with the Stripe SDK against the platform and (optional) Connect endpoint secrets. */
class StripeWebhookVerifier(private val config: StripeConfig, private val clock: Clock) {
    val enabled: Boolean get() = secrets.isNotEmpty()
    private val secrets get() = listOfNotNull(config.webhookSecret, config.connectWebhookSecret)

    /** Returns the verified event id and type, or throws INVALID_SIGNATURE. */
    fun verify(payload: String, signatureHeader: String?): Pair<String, String> {
        if (signatureHeader.isNullOrBlank()) throw Errors.invalidSignature()
        for (secret in secrets) {
            try {
                val event = Webhook.constructEvent(payload, signatureHeader, secret, Webhook.DEFAULT_TOLERANCE, clock)
                return event.id to event.type
            } catch (_: SignatureVerificationException) {
                // Try the next secret (platform vs Connect endpoint).
            } catch (_: NumberFormatException) {
                // A malformed "t=" in the header (the SDK verifies the header before it parses the body): not signed by Stripe.
            } catch (@Suppress("TooGenericExceptionCaught", "SwallowedException") _: Exception) {
                // The SDK's JSON parsing fails in several ways; all mean the body is not a Stripe event.
                throw Errors.invalid("The webhook payload is not a Stripe event.")
            }
        }
        throw Errors.invalidSignature()
    }
}
