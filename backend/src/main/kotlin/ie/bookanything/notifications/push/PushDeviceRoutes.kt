package ie.bookanything.notifications.push

import ie.bookanything.AppContext
import ie.bookanything.http.Errors
import ie.bookanything.http.receiveBody
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.post
import kotlinx.serialization.Serializable
import java.time.temporal.ChronoUnit

/** `{"token":"ExponentPushToken[…]","platform":"ios","appVariant":"production"}`: this phone gets notifications. */
@Serializable
data class PushDeviceInput(val token: String, val platform: String, val appVariant: String)

/** `{"token":"ExponentPushToken[…]"}`: this phone no longer gets them (signing out). */
@Serializable
data class PushDeviceDelete(val token: String)

@Serializable
data class PushDeviceDto(
    val id: String,
    /** `ios` or `android`. */
    val platform: String,
    /** `development`, `preview` or `production`. */
    val appVariant: String,
    /** ISO-8601 instants (UTC). */
    val createdAt: String,
    val lastSeenAt: String,
)

/**
 * `/v1/me/push-devices` (section 22): the mobile app registers the phone it runs on for the signed-in person's
 * notifications (on every launch and sign-in) and unregisters it when they sign out.
 */
fun Route.pushDeviceRoutes(ctx: AppContext) {
    post("/me/push-devices") {
        val user = ctx.auth.requireUser(call)
        val input = call.receiveBody<PushDeviceInput>()
        val token = PushTokens.require(input.token)
        if (input.platform !in PLATFORMS) throw Errors.field("platform", "Must be ios or android")
        if (input.appVariant !in VARIANTS) throw Errors.field("appVariant", "Must be development, preview or production")
        val row = ctx.db.tx { conn -> PushDeviceRepository.register(conn, user.id, token, input.platform, input.appVariant, ctx.now()) }
        call.respond(row.toDto())
    }

    delete("/me/push-devices") {
        val user = ctx.auth.requireUser(call)
        val token = PushTokens.require(call.receiveBody<PushDeviceDelete>().token)
        ctx.db.tx { conn -> PushDeviceRepository.unregister(conn, user.id, token, ctx.now()) }
        call.respond(HttpStatusCode.NoContent)
    }
}

private val PLATFORMS = setOf("ios", "android")
private val VARIANTS = setOf("development", "preview", "production")

private fun PushDeviceRow.toDto() = PushDeviceDto(
    id.toString(), platform, appVariant, createdAt.truncatedTo(ChronoUnit.SECONDS).toString(),
    lastSeenAt.truncatedTo(ChronoUnit.SECONDS).toString(),
)
