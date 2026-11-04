package ie.bookanything.notifications

import ie.bookanything.jobs.JobQueue
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.sql.Connection
import java.util.UUID

/** Enqueues notifications as jobs in the caller's transaction (transactional outbox). */
object Notify {
    const val JOB_KIND = "notify"

    fun booking(conn: Connection, kind: String, businessId: UUID, bookingId: UUID, extra: Map<String, String> = emptyMap()) {
        JobQueue.enqueue(
            conn, JOB_KIND,
            JsonObject(
                mapOf(
                    "kind" to JsonPrimitive(kind),
                    "businessId" to JsonPrimitive(businessId.toString()), "bookingId" to JsonPrimitive(bookingId.toString()),
                ) +
                    extra.mapValues { JsonPrimitive(it.value) },
            ),
        )
    }

    fun invitation(conn: Connection, businessId: UUID, memberId: UUID, email: String, inviterName: String?) {
        JobQueue.enqueue(
            conn, JOB_KIND,
            JsonObject(
                mapOf(
                    "kind" to JsonPrimitive(NotificationKind.TEAM_INVITATION), "businessId" to JsonPrimitive(businessId.toString()),
                    "memberId" to JsonPrimitive(memberId.toString()), "email" to JsonPrimitive(email),
                    "inviterName" to JsonPrimitive(inviterName ?: "A colleague"),
                ),
            ),
        )
    }
}
