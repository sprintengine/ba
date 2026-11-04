package ie.bookanything.payments

import ie.bookanything.AppContext
import ie.bookanything.http.BodyLimits
import ie.bookanything.http.Errors
import ie.bookanything.http.receiveBytes
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.post

/**
 * `POST /v1/webhooks/stripe`: platform and Connect events. The raw body is verified with the
 * Stripe SDK, stored in `provider_events` (idempotent by event id) and processed by the job queue.
 */
fun Route.stripeWebhookRoutes(ctx: AppContext) {
    val verifier = StripeWebhookVerifier(ctx.config.stripe, ctx.clock)
    post("/webhooks/stripe") {
        if (!verifier.enabled) throw Errors.webhooksDisabled("Stripe")
        val payload = call.receiveRawBody()
        val (eventId, type) = verifier.verify(payload, call.request.headers["Stripe-Signature"])
        val isNew = ctx.db.tx { conn ->
            ProviderEventRepository.store(conn, eventId, "stripe", type, payload).also { stored ->
                if (!stored) return@also
                if (type in StripeEvents.HANDLED) {
                    enqueueStripeEvent(conn, eventId)
                } else {
                    ProviderEventRepository.markProcessed(conn, eventId)
                }
            }
        }
        call.respond(WebhookAck(received = true, duplicate = !isNew))
    }
}

/**
 * The exact request bytes as UTF-8 (signatures are computed over the raw body). Webhook payloads are small: anything
 * over [BodyLimits.LARGE] is not from Stripe or Clerk, and is refused (413) without reading it all.
 */
suspend fun io.ktor.server.application.ApplicationCall.receiveRawBody(): String = String(receiveBytes(BodyLimits.LARGE), Charsets.UTF_8)
