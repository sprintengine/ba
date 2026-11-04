package ie.bookanything.notifications

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonPrimitive
import org.slf4j.LoggerFactory
import java.io.IOException
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.util.Base64

data class HttpCall(val method: String, val url: String, val headers: Map<String, String>, val body: String)
data class HttpResult(val status: Int, val body: String)

/** Minimal HTTP boundary for provider APIs, so request building is testable without the network. */
fun interface HttpTransport {
    fun execute(call: HttpCall): HttpResult
}

/** Reads at most [maxBodyChars] of a response (provider answers are small; Expo's push receipts can be 100 KB). */
class JdkHttpTransport(private val timeout: Duration = Duration.ofSeconds(15), private val maxBodyChars: Int = 10_000) : HttpTransport {
    private val client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build()

    override fun execute(call: HttpCall): HttpResult {
        val builder = HttpRequest.newBuilder(URI(call.url)).timeout(timeout)
            .method(call.method, HttpRequest.BodyPublishers.ofString(call.body))
        call.headers.forEach { (k, v) -> builder.header(k, v) }
        val response = client.send(builder.build(), HttpResponse.BodyHandlers.ofString())
        return HttpResult(response.statusCode(), response.body().take(maxBodyChars))
    }
}

/** Thrown for failures worth retrying (network, 429, 5xx); the notification job backs off and retries. */
class RetryableSendException(message: String, cause: Throwable? = null) : RuntimeException(message, cause)

private val json = Json { ignoreUnknownKeys = true }

/**
 * Sends email with the Resend HTTP API (`POST https://api.resend.com/emails`). The From header
 * shows the business name with the EMAIL_FROM address; replies go to the business.
 */
class ResendEmailSender(
    private val apiKey: String,
    override val from: String,
    private val transport: HttpTransport = JdkHttpTransport(),
    private val endpoint: String = "https://api.resend.com/emails",
) : EmailSender {
    private val log = LoggerFactory.getLogger(ResendEmailSender::class.java)

    fun buildCall(message: EmailMessage): HttpCall {
        val body = JsonObject(
            buildMap {
                put("from", JsonPrimitive(fromHeader(from, message.fromName)))
                put("to", JsonArray(listOf(JsonPrimitive(message.to))))
                put("subject", JsonPrimitive(message.subject))
                put("html", JsonPrimitive(message.html))
                put("text", JsonPrimitive(message.text))
                message.replyTo?.let { put("reply_to", JsonPrimitive(it)) }
                put(
                    "tags",
                    JsonArray(listOf(JsonObject(mapOf("name" to JsonPrimitive("template"), "value" to JsonPrimitive(message.template))))),
                )
            },
        )
        val headers = buildMap {
            put("Authorization", "Bearer $apiKey")
            put("Content-Type", "application/json")
            message.idempotencyKey?.let { put("Idempotency-Key", it.take(256)) }
        }
        return HttpCall("POST", endpoint, headers, body.toString())
    }

    override fun send(message: EmailMessage): SendResult {
        val result = try {
            transport.execute(buildCall(message))
        } catch (e: IOException) {
            throw RetryableSendException("resend unreachable: ${e.message ?: e.javaClass.simpleName}", e)
        }
        return when {
            result.status in 200..299 -> SendResult(
                "sent", runCatching { (json.parseToJsonElement(result.body) as JsonObject)["id"]?.jsonPrimitive?.content }.getOrNull(),
            )
            result.status == 429 || result.status >= 500 -> throw RetryableSendException("resend status ${result.status}")
            else -> {
                // 4xx (invalid address, unverified domain…): retrying cannot help. Recorded in email_log.
                log.warn("resend rejected template={} status={} body={}", message.template, result.status, result.body.take(500))
                SendResult("failed", null)
            }
        }
    }

    companion object {
        /** "Business Name <bookings@bookanything.ie>" using the address from EMAIL_FROM. */
        fun fromHeader(configured: String, displayName: String?): String {
            val address = Regex("<([^>]+)>").find(configured)?.groupValues?.get(1) ?: configured.trim()
            val name = displayName?.replace(Regex("[\"<>\\r\\n\\\\]"), "")?.trim()?.take(70)?.takeIf { it.isNotEmpty() }
            return if (name != null) "\"$name\" <$address>" else configured
        }
    }
}

/** Sends SMS with the Twilio Messages API. TWILIO_FROM may be a number or a Messaging Service SID (MG…). */
class TwilioSmsSender(
    private val accountSid: String,
    private val authToken: String,
    private val from: String,
    private val transport: HttpTransport = JdkHttpTransport(),
    private val baseUrl: String = "https://api.twilio.com",
) : SmsSender {
    private val log = LoggerFactory.getLogger(TwilioSmsSender::class.java)
    override val enabled = true

    fun buildCall(message: SmsMessage): HttpCall {
        fun enc(v: String) = URLEncoder.encode(v, Charsets.UTF_8)
        val fromField = if (from.startsWith("MG")) "MessagingServiceSid" else "From"
        val body = "To=${enc(message.to)}&$fromField=${enc(from)}&Body=${enc(message.body.take(1600))}"
        val auth = Base64.getEncoder().encodeToString("$accountSid:$authToken".toByteArray(Charsets.UTF_8))
        return HttpCall(
            "POST", "$baseUrl/2010-04-01/Accounts/${enc(accountSid)}/Messages.json",
            mapOf("Authorization" to "Basic $auth", "Content-Type" to "application/x-www-form-urlencoded"), body,
        )
    }

    override fun send(message: SmsMessage): SendResult {
        val result = try {
            transport.execute(buildCall(message))
        } catch (e: IOException) {
            throw RetryableSendException("twilio unreachable: ${e.message ?: e.javaClass.simpleName}", e)
        }
        if (result.status in 200..299) {
            return SendResult(
                "sent", runCatching { (json.parseToJsonElement(result.body) as JsonObject)["sid"]?.jsonPrimitive?.content }.getOrNull(),
            )
        }
        if (result.status == 429 || result.status >= 500) throw RetryableSendException("twilio status ${result.status}")
        log.warn("twilio rejected sms status={} body={}", result.status, result.body.take(500))
        return SendResult("failed", null)
    }
}
