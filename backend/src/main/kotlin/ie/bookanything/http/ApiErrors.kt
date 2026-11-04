package ie.bookanything.http

import ie.bookanything.db.PgState
import ie.bookanything.db.sqlState
import ie.bookanything.observability.Telemetry
import ie.bookanything.observability.errorTags
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.plugins.BadRequestException
import io.ktor.server.plugins.NotFoundException
import io.ktor.server.plugins.statuspages.StatusPages
import io.ktor.server.response.respondText
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.serializer
import org.slf4j.LoggerFactory
import java.sql.SQLException
import java.sql.SQLTransientConnectionException

private val log = LoggerFactory.getLogger("ie.bookanything.http.ApiErrors")

@Serializable
data class ApiErrorResponse(val error: ApiError)

@Serializable
data class ApiError(val code: String, val message: String, val fields: Map<String, String> = emptyMap())

/** A client-visible failure. Message and fields are safe to show to end users. */
class ApiException(
    val status: HttpStatusCode,
    val code: String,
    override val message: String,
    val fields: Map<String, String> = emptyMap(),
) : RuntimeException(message)

@Suppress("TooManyFunctions") // The error catalogue: one factory per API error code, kept in one place on purpose.
object Errors {
    fun invalid(message: String = "The request is invalid.", fields: Map<String, String> = emptyMap()) =
        ApiException(HttpStatusCode.BadRequest, "INVALID_REQUEST", message, fields)
    fun field(field: String, problem: String) = invalid("The request is invalid.", mapOf(field to problem))
    fun unauthenticated(message: String = "Sign in to continue.") =
        ApiException(HttpStatusCode.Unauthorized, "UNAUTHENTICATED", message)
    fun forbidden(message: String = "You do not have permission to do that.") =
        ApiException(HttpStatusCode.Forbidden, "FORBIDDEN", message)
    fun notFound(what: String = "Resource") = ApiException(HttpStatusCode.NotFound, "NOT_FOUND", "$what not found.")
    fun conflict(message: String) = ApiException(HttpStatusCode.Conflict, "CONFLICT", message)
    fun slotUnavailable(message: String = "That time is no longer available. Please choose another slot.") =
        ApiException(HttpStatusCode.Conflict, "SLOT_UNAVAILABLE", message)

    /** The booking would cost [nowPrice] (formatted), not the total the customer was shown: nothing was booked. */
    fun priceChanged(nowPrice: String) = ApiException(
        HttpStatusCode.Conflict, "PRICE_CHANGED", "The price for this time has changed to $nowPrice. Check it and book again.",
    )
    fun payloadTooLarge(maxBytes: Long) = ApiException(
        HttpStatusCode.PayloadTooLarge, "PAYLOAD_TOO_LARGE", "The request body is too large (at most ${maxBytes / 1024} KB).",
    )
    fun rateLimited() = ApiException(
        HttpStatusCode.TooManyRequests, "RATE_LIMITED", "Too many requests. Please wait a moment and try again.",
    )
    fun planLimit(message: String) = ApiException(HttpStatusCode.Conflict, "PLAN_LIMIT_REACHED", message)
    fun paymentsNotConfigured(message: String = "Online payments are not set up for this business yet.") =
        ApiException(HttpStatusCode.Conflict, "PAYMENTS_NOT_CONFIGURED", message)
    fun policy(message: String) = ApiException(HttpStatusCode.Conflict, "POLICY_VIOLATION", message)
    fun slugTaken(suggestion: String?) = ApiException(
        HttpStatusCode.Conflict, "SLUG_TAKEN", "That web address is already taken.",
        if (suggestion != null) mapOf("slug" to "Taken. Try $suggestion") else emptyMap(),
    )

    /** An external provider (Stripe) failed; safe to retry. Details are logged, never returned. */
    fun providerError(message: String = "The payment provider could not complete the request. Please try again.") =
        ApiException(HttpStatusCode.BadGateway, "PAYMENT_PROVIDER_ERROR", message)
    fun invalidSignature() = ApiException(HttpStatusCode.BadRequest, "INVALID_SIGNATURE", "Webhook signature verification failed.")
    fun webhooksDisabled(what: String) =
        ApiException(HttpStatusCode.ServiceUnavailable, "WEBHOOKS_NOT_CONFIGURED", "$what webhooks are not enabled on this server.")

    /** The business's monthly AI credits are used up (section 16). */
    fun aiLimit(message: String) = ApiException(HttpStatusCode.Conflict, "AI_LIMIT_REACHED", message)

    /** No model is configured, so the assistant can't answer (it still shows nudges and quick actions). */
    fun aiNotConfigured() = ApiException(
        HttpStatusCode.ServiceUnavailable, "AI_NOT_CONFIGURED", "The AI assistant isn't set up on this server yet.",
    )
    fun uploadsNotConfigured() = ApiException(
        HttpStatusCode.ServiceUnavailable, "UPLOADS_NOT_CONFIGURED",
        "Image uploads are not set up on this server. Choose a generated background instead.",
    )

    /** The image store failed; safe to retry. Details are logged, never returned. */
    fun uploadFailed() = ApiException(HttpStatusCode.BadGateway, "UPLOAD_FAILED", "The image could not be stored. Please try again.")

    /** The stock photo provider failed; safe to retry. */
    fun stockUnavailable() = ApiException(
        HttpStatusCode.BadGateway, "STOCK_PHOTOS_UNAVAILABLE", "Stock photos are unavailable right now. Please try again shortly.",
    )
    fun invalidTimezone(field: String = "timezone") =
        ApiException(HttpStatusCode.BadRequest, "INVALID_TIMEZONE", "Unknown timezone.", mapOf(field to "Unknown timezone"))
}

/**
 * Error bodies are serialized explicitly (not via content negotiation), so they are identical on
 * every route, including unmatched paths and the MCP route with its own JSON settings.
 */
suspend fun io.ktor.server.application.ApplicationCall.respondError(status: HttpStatusCode, error: ApiError) {
    respondText(
        ApiJson.encodeToString(serializer<ApiErrorResponse>(), ApiErrorResponse(error)), io.ktor.http.ContentType.Application.Json, status,
    )
}

fun Application.configureErrors() {
    install(StatusPages) {
        exception<ApiException> { call, cause ->
            // A provider or store failing is ours to see; a feature that isn't set up on this server is not a failure.
            if (cause.status.value >= 500 && !cause.code.endsWith("_NOT_CONFIGURED")) {
                Telemetry.errors.message("${cause.status.value} ${cause.code}", call.errorTags())
            }
            call.respondError(cause.status, ApiError(cause.code, cause.message, cause.fields))
        }
        exception<BadRequestException> { call, cause ->
            log.debug("Bad request: {}", cause.message)
            call.respondError(HttpStatusCode.BadRequest, ApiError("INVALID_REQUEST", "The request could not be read."))
        }
        exception<SerializationException> { call, _ ->
            call.respondError(
                HttpStatusCode.BadRequest, ApiError("INVALID_REQUEST", "The request body is not valid JSON for this endpoint."),
            )
        }
        exception<NotFoundException> { call, _ ->
            call.respondError(HttpStatusCode.NotFound, ApiError("NOT_FOUND", "Not found."))
        }
        exception<SQLTransientConnectionException> { call, cause ->
            log.error("Database unavailable: {}", cause.message)
            Telemetry.errors.capture(cause, call.errorTags())
            call.respondError(
                HttpStatusCode.ServiceUnavailable,
                ApiError("DATABASE_UNAVAILABLE", "The service is temporarily unavailable. Please try again shortly."),
            )
        }
        exception<Throwable> { call, cause ->
            when (cause.sqlState()) {
                PgState.EXCLUSION_VIOLATION -> call.respondError(
                    HttpStatusCode.Conflict, ApiError("SLOT_UNAVAILABLE", "That time is no longer available."),
                )
                PgState.UNIQUE_VIOLATION -> call.respondError(
                    HttpStatusCode.Conflict, ApiError("CONFLICT", "That conflicts with an existing record."),
                )
                PgState.FOREIGN_KEY_VIOLATION -> call.respondError(
                    HttpStatusCode.Conflict, ApiError("CONFLICT", "That record is still in use."),
                )
                else -> {
                    if (cause is SQLException && cause.sqlState?.startsWith("08") == true) {
                        log.error("Database connection failure", cause)
                        Telemetry.errors.capture(cause, call.errorTags())
                        call.respondError(
                            HttpStatusCode.ServiceUnavailable,
                            ApiError("DATABASE_UNAVAILABLE", "The service is temporarily unavailable. Please try again shortly."),
                        )
                    } else {
                        log.error("Unhandled error", cause)
                        Telemetry.errors.capture(cause, call.errorTags())
                        call.respondError(
                            HttpStatusCode.InternalServerError,
                            ApiError("INTERNAL_SERVER_ERROR", "Something went wrong. Please try again."),
                        )
                    }
                }
            }
        }
        status(HttpStatusCode.NotFound) { call, status ->
            call.respondError(status, ApiError("NOT_FOUND", "Not found."))
        }
        status(HttpStatusCode.MethodNotAllowed) { call, status ->
            call.respondError(status, ApiError("NOT_FOUND", "Not found."))
        }
        status(HttpStatusCode.UnsupportedMediaType) { call, status ->
            call.respondError(status, ApiError("INVALID_REQUEST", "Send JSON with Content-Type: application/json."))
        }
    }
}
