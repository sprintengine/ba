package ie.bookanything.notifications.inbox

import ie.bookanything.AppContext
import ie.bookanything.http.Errors
import ie.bookanything.http.pathUuid
import ie.bookanything.http.receiveBody
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.patch
import io.ktor.server.routing.post
import kotlinx.serialization.Serializable
import java.time.temporal.ChronoUnit

@Serializable
data class NotificationDto(
    val id: String,
    /** An [InboxKind] key. */
    val kind: String,
    val title: String,
    val body: String?,
    /** The app path to open, e.g. `/dashboard/lumen-physio/approvals/…`. */
    val link: String,
    /** The business it is about, if any. */
    val businessName: String?,
    /** ISO-8601 instant (UTC). */
    val createdAt: String,
    val read: Boolean,
)

@Serializable
data class NotificationList(val items: List<NotificationDto>, val unreadCount: Int)

@Serializable
data class NotificationSettingDto(
    val kind: String,
    val label: String,
    val description: String,
    /** Also sent by email (in the app always). */
    val email: Boolean,
    val forMembers: Boolean,
    val forCustomers: Boolean,
)

@Serializable
data class NotificationSettings(val items: List<NotificationSettingDto>)

/** `{"email": {"new_booking": true}}`: kinds to email, or not. */
@Serializable
data class UpdateNotificationSettings(val email: Map<String, Boolean>)

/** `/v1/me/notifications…` (section 22): the signed-in person's own notifications and which are emailed. */
fun Route.inboxRoutes(ctx: AppContext) {
    get("/me/notifications") {
        val user = ctx.auth.requireUser(call)
        call.respond(
            ctx.db.read { conn ->
                NotificationList(
                    InboxRepository.recent(conn, user.id, RECENT).map { it.toDto() }, InboxRepository.unreadCount(conn, user.id),
                )
            },
        )
    }

    post("/me/notifications/{id}/read") {
        val user = ctx.auth.requireUser(call)
        val id = call.pathUuid("id")
        if (!ctx.db.tx { conn -> InboxRepository.markRead(conn, user.id, id, ctx.now()) }) throw Errors.notFound("Notification")
        call.respond(HttpStatusCode.NoContent)
    }

    post("/me/notifications/read-all") {
        val user = ctx.auth.requireUser(call)
        ctx.db.tx { conn -> InboxRepository.markAllRead(conn, user.id, ctx.now()) }
        call.respond(HttpStatusCode.NoContent)
    }

    get("/me/notification-settings") {
        val user = ctx.auth.requireUser(call)
        call.respond(ctx.db.read { conn -> settings(InboxRepository.emailChoices(conn, user.id)) })
    }

    patch("/me/notification-settings") {
        val user = ctx.auth.requireUser(call)
        val input = call.receiveBody<UpdateNotificationSettings>()
        val kinds = input.email.mapKeys { (key, _) -> InboxKind.parse(key) ?: throw Errors.field("email", "Unknown kind: $key") }
        call.respond(
            ctx.db.tx { conn ->
                kinds.forEach { (kind, on) -> InboxRepository.setEmail(conn, user.id, kind, on) }
                settings(InboxRepository.emailChoices(conn, user.id))
            },
        )
    }
}

private const val RECENT = 30

private fun settings(choices: Map<String, Boolean>) = NotificationSettings(
    InboxKind.entries.map {
        NotificationSettingDto(it.key, it.label, it.description, choices[it.key] ?: it.emailByDefault, it.forMembers, it.forCustomers)
    },
)

private fun NotificationRow.toDto() =
    NotificationDto(
        id.toString(), kind, title, body, link, businessName, createdAt.truncatedTo(ChronoUnit.SECONDS).toString(),
        readAt != null,
    )
