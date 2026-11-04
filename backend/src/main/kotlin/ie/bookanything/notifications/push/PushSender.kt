package ie.bookanything.notifications.push

import kotlinx.serialization.json.JsonObject
import org.slf4j.LoggerFactory

/**
 * One push notification to one phone, in Expo's terms (https://docs.expo.dev/push-notifications/sending-notifications/).
 * [to] is the device's Expo push token; [data] reaches the app (the path to open); [badge] is the app icon's count (iOS);
 * [channelId] the Android notification channel; [priority] `high` for what needs the person now, else Expo's default.
 */
data class PushMessage(
    val to: String,
    val title: String,
    val body: String?,
    val data: JsonObject,
    val badge: Int,
    val sound: String = "default",
    val channelId: String = "default",
    val priority: String? = null,
)

/** Expo's answer for one message: accepted ([id] is its receipt id), or an [error] code such as `DeviceNotRegistered`. */
data class PushTicket(val id: String?, val error: String?, val message: String? = null) {
    val ok: Boolean get() = error == null

    companion object {
        fun ok(id: String?) = PushTicket(id, null)
        fun error(error: String, message: String?) = PushTicket(null, error, message)
    }
}

/** Whether a phone's push service took a message (`ok`), or why not ([error], e.g. `DeviceNotRegistered`). */
data class PushReceipt(val error: String?, val message: String? = null) {
    val ok: Boolean get() = error == null
}

/**
 * Sends push notifications: [ExpoPushSender] when `PUSH_NOTIFICATIONS=expo`, [LogPushSender] when `log` (development's
 * default), else [DisabledPushSender], with which no push job is ever queued.
 */
interface PushSender {
    /** `expo`, `log` or `off` (the startup log). */
    val name: String

    /** Whether notifications are pushed at all; when not, nothing is queued for them. */
    val enabled: Boolean

    /** Sends [messages]; one ticket per message, in their order. Throws to be retried later (unreachable, 429, 5xx). */
    fun send(messages: List<PushMessage>): List<PushTicket>

    /** The receipts of tickets [ids] that are ready, by ticket id (ones not ready yet are left out). */
    fun receipts(ids: List<String>): Map<String, PushReceipt>

    companion object {
        /** The app was uninstalled, or its token expired: stop sending to it until it registers again. */
        const val DEVICE_NOT_REGISTERED = "DeviceNotRegistered"
    }
}

/** Development: logs each notification instead of sending it, so the flow works locally up to the delivery itself. */
class LogPushSender : PushSender {
    private val log = LoggerFactory.getLogger(LogPushSender::class.java)
    override val name = "log"
    override val enabled = true

    override fun send(messages: List<PushMessage>): List<PushTicket> = messages.map { m ->
        log.info(
            "push (not sent: PUSH_NOTIFICATIONS=log) to={}… title=\"{}\" data={} badge={}",
            m.to.take(TOKEN_SHOWN),
            m.title,
            m.data,
            m.badge,
        )
        PushTicket.ok(null)
    }

    override fun receipts(ids: List<String>): Map<String, PushReceipt> = emptyMap()

    private companion object {
        /** Enough of a token to tell phones apart in the log. */
        const val TOKEN_SHOWN = 24
    }
}

/** Push is off: never asked to send, since nothing is queued. */
object DisabledPushSender : PushSender {
    override val name = "off"
    override val enabled = false

    override fun send(messages: List<PushMessage>): List<PushTicket> = messages.map { PushTicket.error("PushDisabled", null) }

    override fun receipts(ids: List<String>): Map<String, PushReceipt> = emptyMap()
}
