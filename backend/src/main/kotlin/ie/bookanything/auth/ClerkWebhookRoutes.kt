package ie.bookanything.auth

import ie.bookanything.AppContext
import ie.bookanything.http.Errors
import ie.bookanything.payments.ProviderEventRepository
import ie.bookanything.payments.WebhookAck
import ie.bookanything.payments.receiveRawBody
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.post
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** `POST /v1/webhooks/clerk` (Svix-signed). Events are stored in `provider_events` and applied once. */
fun Route.clerkWebhookRoutes(ctx: AppContext) {
    val secret = ctx.config.clerk.webhookSecret
    val verifier = secret?.let { runCatching { SvixVerifier(it, ctx.clock) }.getOrNull() }
    val handler = ClerkEventHandler()
    val json = Json { ignoreUnknownKeys = true }
    post("/webhooks/clerk") {
        if (verifier == null) throw Errors.webhooksDisabled("Clerk")
        val body = call.receiveRawBody()
        val h = call.request.headers
        val svixId = h["svix-id"]
        if (svixId == null || !verifier.verify(svixId, h["svix-timestamp"], h["svix-signature"], body)) throw Errors.invalidSignature()
        val event = runCatching { json.parseToJsonElement(body) as JsonObject }.getOrNull() ?: throw Errors.invalid("Not a Clerk event.")
        val type = (event["type"] as? JsonPrimitive)?.content ?: throw Errors.invalid("Not a Clerk event.")
        val data = event["data"] as? JsonObject ?: JsonObject(emptyMap())
        val isNew = ctx.db.tx { conn ->
            ProviderEventRepository.store(conn, "clerk:$svixId", "clerk", type, body).also { stored ->
                if (!stored) return@also
                handler.handle(conn, type, data)
                ProviderEventRepository.markProcessed(conn, "clerk:$svixId")
            }
        }
        call.respond(WebhookAck(received = true, duplicate = !isNew))
    }
}
