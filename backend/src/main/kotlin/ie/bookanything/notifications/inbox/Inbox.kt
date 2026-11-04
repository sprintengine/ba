package ie.bookanything.notifications.inbox

import ie.bookanything.booking.BookingRow
import ie.bookanything.business.BusinessRow
import ie.bookanything.jobs.JobQueue
import ie.bookanything.notifications.push.PushDeviceRepository
import ie.bookanything.notifications.push.PushHandler
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.sql.Connection
import java.time.Duration
import java.time.Instant
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.UUID

/**
 * The kinds of notification (section 22). Each is shown in the app; [emailByDefault] says whether it is also emailed
 * until the person changes it. [forMembers] and [forCustomers] say who can get it (the settings page lists only those).
 * [pushText] is all a push says about it: it shows on a locked phone, so never who, what or when (some businesses are
 * health-related); the app shows the rest once opened.
 */
@Serializable
enum class InboxKind(
    val key: String,
    val label: String,
    val description: String,
    val emailByDefault: Boolean,
    val forMembers: Boolean,
    val forCustomers: Boolean,
    val pushText: String,
) {
    @SerialName("agent_approval")
    AGENT_APPROVAL(
        "agent_approval", "Your AI agent's changes", "A change your AI agent prepared is waiting for you to approve it.",
        emailByDefault = true, forMembers = true, forCustomers = true,
        pushText = "Your AI assistant has a change waiting for your approval",
    ),

    @SerialName("booking_request")
    BOOKING_REQUEST(
        "booking_request", "Requests to approve", "A customer asked for a booking that needs approving.",
        emailByDefault = false, forMembers = true, forCustomers = false, pushText = "A booking request needs your answer",
    ),

    @SerialName("new_booking")
    NEW_BOOKING(
        "new_booking", "New bookings", "A customer booked online or through their AI assistant.",
        emailByDefault = false, forMembers = true, forCustomers = false, pushText = "New booking",
    ),

    @SerialName("booking_cancelled")
    BOOKING_CANCELLED(
        "booking_cancelled", "Cancellations", "A customer cancelled their booking.",
        emailByDefault = false, forMembers = true, forCustomers = false, pushText = "A booking was cancelled",
    ),

    @SerialName("booking_moved")
    BOOKING_MOVED(
        "booking_moved", "Moved bookings", "A customer moved their booking to another time.",
        emailByDefault = false, forMembers = true, forCustomers = false, pushText = "A booking was moved",
    ),

    /** Owners only: taking payments needs them (their Stripe account was disconnected). */
    @SerialName("payments_alert")
    PAYMENTS_ALERT(
        "payments_alert", "Payment problems",
        "For owners: your Stripe account was disconnected, so online payments stopped.",
        emailByDefault = true, forMembers = true, forCustomers = false, pushText = "Online payments need your attention",
    ),
    ;

    companion object {
        fun parse(key: String): InboxKind? = entries.firstOrNull { it.key == key }
    }
}

/** A notification to store for [userId]: [link] is an app path; [dedupeKey] makes it one per thing that happened. */
data class NewNotification(
    val userId: UUID,
    val kind: InboxKind,
    val title: String,
    val body: String?,
    val link: String,
    val businessId: UUID? = null,
    val entityId: UUID? = null,
    val dedupeKey: String? = null,
)

/**
 * Tells people what happened (section 22): a row per person (the bell in the app), stored in the caller's
 * transaction, an email job that sends it a little later if they want it by email and haven't read it by then, and,
 * when [push] is on and they have the mobile app, a job that pushes it to their phones straight away (only that
 * something happened: the title and body stay in the app and the email).
 */
class Inbox(private val push: Boolean) {
    fun notify(conn: Connection, n: NewNotification) {
        val id = InboxRepository.insert(conn, n) ?: return // already told
        JobQueue.enqueue(conn, EMAIL_JOB, JsonObject(mapOf("notificationId" to JsonPrimitive(id.toString()))), delay = EMAIL_DELAY)
        if (push && PushDeviceRepository.hasActive(conn, n.userId)) PushHandler.enqueue(conn, id)
    }

    /** What a customer did to a booking, for the business's team. */
    enum class TeamEvent(val kind: InboxKind) {
        NEW(InboxKind.NEW_BOOKING),
        REQUEST(InboxKind.BOOKING_REQUEST),
        CANCELLED(InboxKind.BOOKING_CANCELLED),
        MOVED(InboxKind.BOOKING_MOVED),
    }

    /**
     * Tells the team about what a customer did to booking [b]: owners and admins, and staff whose own resource it is on
     * (or was, before a move: [movedFrom] is the booking as it was).
     */
    fun team(conn: Connection, business: BusinessRow, b: BookingRow, event: TeamEvent, movedFrom: BookingRow? = null) {
        val noun = business.vocabulary.booking.lowercase()
        val whenText = format(business, b.start)
        val (title, body) = when (event) {
            TeamEvent.NEW -> "New $noun: ${b.customer.name}" to "${b.serviceName} · $whenText"
            TeamEvent.REQUEST -> "Request to approve: ${b.customer.name}" to "${b.serviceName} · $whenText"
            TeamEvent.CANCELLED -> "${b.customer.name} cancelled" to "${b.serviceName} · $whenText"
            TeamEvent.MOVED ->
                "${b.customer.name} moved their $noun" to
                    "${b.serviceName} · now $whenText" + movedFrom?.let { " (was ${format(business, it.start)})" }.orEmpty()
        }
        // A new booking or request is told once (its job may run again); each move is news, even back to an earlier time
        // (stored in the move's own transaction, so it can't repeat).
        val key = "booking:${b.id}:${event.name.lowercase()}".takeIf { event != TeamEvent.MOVED }
        val resources = b.resourceIds + movedFrom?.resourceIds.orEmpty()
        InboxRepository.teamFor(conn, business.id, resources.distinct()).forEach { userId ->
            notify(
                conn,
                NewNotification(
                    userId, event.kind, title, body, "/dashboard/${business.slug}/bookings?booking=${b.id}", business.id, b.id, key,
                ),
            )
        }
    }

    /** Tells the business's owners about a problem with taking payments ([InboxKind.PAYMENTS_ALERT]), once per [dedupeKey]. */
    fun paymentsAlert(conn: Connection, business: BusinessRow, title: String, body: String, dedupeKey: String) {
        InboxRepository.ownersOf(conn, business.id).forEach { userId ->
            notify(
                conn,
                NewNotification(
                    userId, InboxKind.PAYMENTS_ALERT, title, body, "/dashboard/${business.slug}/settings/payments", business.id,
                    business.id, dedupeKey,
                ),
            )
        }
    }

    companion object {
        const val EMAIL_JOB = "inbox-email"

        /** Long enough that someone already looking at it in the app isn't emailed too. */
        val EMAIL_DELAY: Duration = Duration.ofMinutes(1)

        /** It was dealt with (an approval decided): its notification no longer waits to be read. */
        fun resolve(conn: Connection, userId: UUID, dedupeKey: String, now: Instant) {
            InboxRepository.markReadByKey(conn, userId, dedupeKey, now)
        }

        private fun format(business: BusinessRow, at: Instant): String =
            ZonedDateTime.ofInstant(at, business.zone)
                .format(DateTimeFormatter.ofPattern("EEE d MMM, HH:mm", Locale.forLanguageTag(business.locale)))
    }
}
