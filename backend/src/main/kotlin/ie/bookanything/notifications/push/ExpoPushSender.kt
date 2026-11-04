package ie.bookanything.notifications.push

import ie.bookanything.notifications.HttpCall
import ie.bookanything.notifications.HttpResult
import ie.bookanything.notifications.HttpTransport
import ie.bookanything.notifications.JdkHttpTransport
import ie.bookanything.notifications.RetryableSendException
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import org.slf4j.LoggerFactory
import java.io.IOException
import java.time.Duration

/**
 * Sends push notifications with Expo's push service (https://docs.expo.dev/push-notifications/sending-notifications/):
 * `POST /send` with up to [MAX_MESSAGES] messages, answered with a ticket per message in the same order, and
 * `POST /getReceipts` with up to [MAX_RECEIPTS] ticket ids. [accessToken] is the project's "enhanced push security" token,
 * sent only when set. Unreachable, 429 and 5xx throw [RetryableSendException] (the job backs off and retries); any other
 * refusal can't be fixed by retrying, so each message gets an error ticket with the request's error code.
 */
class ExpoPushSender(
    private val accessToken: String?,
    private val transport: HttpTransport = JdkHttpTransport(Duration.ofSeconds(TIMEOUT_SECONDS), maxBodyChars = MAX_RESPONSE_CHARS),
    private val baseUrl: String = "https://exp.host/--/api/v2/push",
) : PushSender {
    private val log = LoggerFactory.getLogger(ExpoPushSender::class.java)
    override val name = "expo"
    override val enabled = true

    override fun send(messages: List<PushMessage>): List<PushTicket> = messages.chunked(MAX_MESSAGES).flatMap { chunk ->
        val result = execute(call("send", JsonArray(chunk.map(::encode))))
        val response = parse(result)
        val data = response?.get("data") as? JsonArray
        if (result.status !in 200..299 || data == null) {
            val (code, message) = requestError(response, result)
            log.warn("expo push refused {} messages status={} error={} message={}", chunk.size, result.status, code, message)
            return@flatMap chunk.map { PushTicket.error(code, message) }
        }
        chunk.indices.map { i -> data.getOrNull(i)?.let(::ticket) ?: PushTicket.error(MISSING, "Expo returned no ticket for it.") }
    }

    override fun receipts(ids: List<String>): Map<String, PushReceipt> = ids.chunked(MAX_RECEIPTS).flatMap { chunk ->
        val result = execute(call("getReceipts", JsonObject(mapOf("ids" to JsonArray(chunk.map(::JsonPrimitive))))))
        val response = parse(result)
        val data = response?.get("data") as? JsonObject
        if (result.status !in 200..299 || data == null) {
            val (code, message) = requestError(response, result)
            log.warn("expo push receipts refused status={} error={} message={}", result.status, code, message)
            return@flatMap emptyList()
        }
        data.mapNotNull { (id, value) -> (value as? JsonObject)?.let { id to receipt(it) } }
    }.toMap()

    fun call(path: String, body: JsonElement): HttpCall {
        val headers = buildMap {
            put("Accept", "application/json")
            put("Content-Type", "application/json")
            accessToken?.let { put("Authorization", "Bearer $it") }
        }
        return HttpCall("POST", "$baseUrl/$path", headers, body.toString())
    }

    private fun execute(call: HttpCall): HttpResult {
        val result = try {
            transport.execute(call)
        } catch (e: IOException) {
            throw RetryableSendException("expo push unreachable: ${e.message ?: e.javaClass.simpleName}", e)
        }
        if (result.status == TOO_MANY_REQUESTS || result.status >= SERVER_ERROR) {
            throw RetryableSendException("expo push status ${result.status}")
        }
        return result
    }

    private fun parse(result: HttpResult): JsonObject? = try {
        json.parseToJsonElement(result.body) as? JsonObject
    } catch (_: SerializationException) {
        null
    }

    companion object {
        /** Expo's limits per request. */
        const val MAX_MESSAGES = 100
        const val MAX_RECEIPTS = 1000

        /** A ticket Expo's answer lacked (or one we couldn't read): logged, never retried. */
        const val MISSING = "MissingTicket"

        private const val TIMEOUT_SECONDS = 15L
        private const val MAX_RESPONSE_CHARS = 1_000_000
        private const val TOO_MANY_REQUESTS = 429
        private const val SERVER_ERROR = 500
        private val json = Json { ignoreUnknownKeys = true }

        /** A message as Expo reads it; unset fields are left out. */
        fun encode(m: PushMessage): JsonObject = JsonObject(
            buildMap {
                put("to", JsonPrimitive(m.to))
                put("title", JsonPrimitive(m.title))
                m.body?.let { put("body", JsonPrimitive(it)) }
                put("data", m.data)
                put("sound", JsonPrimitive(m.sound))
                put("badge", JsonPrimitive(m.badge))
                put("channelId", JsonPrimitive(m.channelId))
                m.priority?.let { put("priority", JsonPrimitive(it)) }
            },
        )

        /** `{"status":"ok","id":…}` or `{"status":"error","message":…,"details":{"error":…}}`. */
        fun ticket(element: JsonElement): PushTicket {
            val o = element as? JsonObject ?: return PushTicket.error(MISSING, "Unreadable ticket.")
            return if (o.str("status") == "ok") PushTicket.ok(o.str("id")) else PushTicket.error(o.errorCode(), o.str("message"))
        }

        fun receipt(o: JsonObject): PushReceipt =
            if (o.str("status") == "ok") PushReceipt(null) else PushReceipt(o.errorCode(), o.str("message"))

        /** The code and message of a refused request (`{"errors":[{"code":…,"message":…}]}`), else its HTTP status. */
        private fun requestError(response: JsonObject?, result: HttpResult): Pair<String, String?> {
            val first = (response?.get("errors") as? JsonArray)?.firstOrNull() as? JsonObject
            return (first?.str("code") ?: "HTTP_${result.status}") to (first?.str("message") ?: result.body.take(LOGGED_BODY))
        }

        private const val LOGGED_BODY = 300

        private fun JsonObject.errorCode(): String = (get("details") as? JsonObject)?.str("error") ?: UNKNOWN

        private const val UNKNOWN = "Unknown"

        private fun JsonObject.str(key: String): String? = (get(key) as? JsonPrimitive)?.contentOrNull
    }
}
