@file:OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)

package ie.bookanything.http

import io.ktor.http.HttpHeaders
import io.ktor.server.application.ApplicationCall
import io.ktor.server.request.contentCharset
import io.ktor.server.request.receiveChannel
import io.ktor.utils.io.readBuffer
import kotlinx.coroutines.CancellationException
import kotlinx.io.readByteArray
import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.MissingFieldException
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.serializer
import java.time.DateTimeException
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.Locale
import java.util.UUID

val ApiJson = Json {
    ignoreUnknownKeys = true
    encodeDefaults = true
    explicitNulls = true
    coerceInputValues = false
    isLenient = false
}

/** The most a request body may be, in bytes; a larger one is refused with 413 PAYLOAD_TOO_LARGE before it is read. */
object BodyLimits {
    /** OAuth forms and client registrations. */
    const val OAUTH = 64 * 1024L

    /** JSON bodies unless a route says otherwise (and the MCP servers). */
    const val DEFAULT = 256 * 1024L

    /** Site plans, business setups (up to 100 services with their options) and provider webhooks. */
    const val LARGE = 1024 * 1024L
}

/**
 * The raw request body, at most [maxBytes]: a larger declared `Content-Length` is refused unread, and a body without one
 * (chunked) is read only to [maxBytes] + 1 bytes before it is refused. Either way a 413 PAYLOAD_TOO_LARGE.
 */
suspend fun ApplicationCall.receiveBytes(maxBytes: Long): ByteArray {
    val declared = request.headers[HttpHeaders.ContentLength]?.toLongOrNull()
    if (declared != null && declared > maxBytes) throw Errors.payloadTooLarge(maxBytes)
    val bytes = receiveChannel().readBuffer(maxBytes + 1).readByteArray()
    if (bytes.size > maxBytes) throw Errors.payloadTooLarge(maxBytes)
    return bytes
}

/** The request body as text (its charset, else UTF-8), at most [maxBytes] ([receiveBytes]). */
suspend fun ApplicationCall.receiveBoundedText(maxBytes: Long): String =
    String(receiveBytes(maxBytes), request.contentCharset() ?: Charsets.UTF_8)

/** Decodes the request body; any malformed/missing field becomes a 400 INVALID_REQUEST. */
suspend fun <T> ApplicationCall.receiveBody(deserializer: DeserializationStrategy<T>, maxBytes: Long = BodyLimits.DEFAULT): T {
    val text = bodyText(maxBytes) ?: throw Errors.invalid("The request body could not be read.")
    if (text.isBlank()) throw Errors.invalid("A JSON request body is required.")
    return decodeBody(deserializer, text)
}

suspend inline fun <reified T> ApplicationCall.receiveBody(maxBytes: Long = BodyLimits.DEFAULT): T = receiveBody(serializer<T>(), maxBytes)

/** Optional body: an empty (or unreadable) body decodes to [default]. */
suspend fun <T> ApplicationCall.receiveOptionalBody(deserializer: DeserializationStrategy<T>, default: T): T {
    val text = bodyText(BodyLimits.DEFAULT).orEmpty()
    return if (text.isBlank()) default else decodeBody(deserializer, text)
}

/** The body as a JSON object, or null when it is anything else or can't be read. A body over [maxBytes] is still a 413. */
suspend fun ApplicationCall.receiveJsonObjectOrNull(maxBytes: Long = BodyLimits.DEFAULT): JsonObject? {
    val text = bodyText(maxBytes) ?: return null
    return try {
        ApiJson.parseToJsonElement(text) as? JsonObject
    } catch (_: SerializationException) {
        null
    }
}

/** The body as text, or null when it can't be read. Too large is not "unreadable": that 413 propagates. */
private suspend fun ApplicationCall.bodyText(maxBytes: Long): String? = try {
    receiveBoundedText(maxBytes)
} catch (e: CancellationException) {
    throw e
} catch (e: ApiException) {
    throw e
} catch (@Suppress("TooGenericExceptionCaught") _: Exception) { // Any failure to read the body: the caller decides what it means.
    null
}

private fun <T> decodeBody(deserializer: DeserializationStrategy<T>, text: String): T = try {
    ApiJson.decodeFromString(deserializer, text)
} catch (e: MissingFieldException) {
    throw Errors.invalid("Missing required fields.", e.missingFields.associateWith { "Required" })
} catch (e: SerializationException) {
    throw Errors.invalid(describeSerializationError(e))
} catch (e: IllegalArgumentException) {
    throw Errors.invalid(describeSerializationError(e))
}

suspend fun ApplicationCall.receiveObject(maxBytes: Long = BodyLimits.DEFAULT): JsonObject {
    val element = receiveBody(JsonElement.serializer(), maxBytes)
    return element as? JsonObject ?: throw Errors.invalid("The request body must be a JSON object.")
}

private fun describeSerializationError(e: Exception): String {
    // kotlinx messages can include input snippets; keep only the first line and cap length.
    val first = e.message?.lineSequence()?.firstOrNull()?.take(200) ?: return "The request body is invalid."
    return "The request body is invalid: $first"
}

// ---- Path / query parameter parsing (never throws anything but ApiException) ----

fun parseUuid(raw: String?, field: String): UUID {
    if (raw.isNullOrBlank()) throw Errors.field(field, "Required")
    return parseUuidOrNull(raw) ?: throw Errors.field(field, "Must be a valid id")
}

fun parseUuidOrNull(raw: String?): UUID? {
    if (raw.isNullOrBlank() || raw.length != 36) return null
    return try { UUID.fromString(raw) } catch (e: IllegalArgumentException) { null }
}

fun ApplicationCall.pathUuid(name: String): UUID = parseUuid(parameters[name], name)

fun ApplicationCall.queryUuid(name: String): UUID? =
    request.queryParameters[name]?.takeIf { it.isNotBlank() }?.let { parseUuid(it, name) }

fun ApplicationCall.queryUuidList(name: String): List<UUID> =
    request.queryParameters[name]?.split(',')?.map { it.trim() }?.filter { it.isNotEmpty() }
        ?.map { parseUuid(it, name) }?.distinct().orEmpty()

fun ApplicationCall.queryDate(name: String): LocalDate? =
    request.queryParameters[name]?.takeIf { it.isNotBlank() }?.let { parseDate(it, name) }

fun ApplicationCall.requireQueryDate(name: String): LocalDate =
    queryDate(name) ?: throw Errors.field(name, "Required (YYYY-MM-DD)")

/** An optional instant query parameter ([parseInstant]: ISO-8601 with offset, or local in [zone]). */
fun ApplicationCall.queryInstant(name: String, zone: ZoneId): Instant? =
    request.queryParameters[name]?.takeIf { it.isNotBlank() }?.let { parseInstant(it, name, zone) }

fun ApplicationCall.queryBool(name: String): Boolean? = when (request.queryParameters[name]?.lowercase()) {
    null, "" -> null
    "true", "1" -> true
    "false", "0" -> false
    else -> throw Errors.field(name, "Must be true or false")
}

fun ApplicationCall.queryLimit(default: Int = 50, max: Int = 200): Int {
    val raw = request.queryParameters["limit"] ?: return default
    val n = raw.toIntOrNull() ?: throw Errors.field("limit", "Must be a number")
    if (n < 1 || n > max) throw Errors.field("limit", "Must be between 1 and $max")
    return n
}

fun parseDate(raw: String, field: String): LocalDate = try {
    if (raw.length != 10) throw DateTimeParseException("len", raw, 0)
    LocalDate.parse(raw)
} catch (e: DateTimeParseException) {
    throw Errors.field(field, "Must be a date in YYYY-MM-DD format")
}

private val timeRegex = Regex("^([01]\\d|2[0-3]):([0-5]\\d)(:00)?$")

fun parseTime(raw: String, field: String): LocalTime {
    if (!timeRegex.matches(raw)) throw Errors.field(field, "Must be a time in HH:mm format")
    return LocalTime.parse(raw.take(5))
}

fun parseZone(raw: String?, field: String = "timezone"): ZoneId {
    if (raw.isNullOrBlank()) throw Errors.field(field, "Required")
    return zoneOrNull(raw) ?: throw Errors.invalidTimezone(field)
}

/** A known region zone (Europe/Dublin) or UTC, else null: raw offsets are refused because they do not observe DST. */
fun zoneOrNull(raw: String): ZoneId? {
    if (!raw.contains('/') && raw != "UTC") return null
    return try { ZoneId.of(raw) } catch (_: DateTimeException) { null }
}

/**
 * Parses a booking start instant. Accepts ISO-8601 with offset (preferred) or a local
 * date-time which is interpreted in the business timezone.
 */
fun parseInstant(raw: String?, field: String, zone: ZoneId): Instant {
    if (raw.isNullOrBlank()) throw Errors.field(field, "Required")
    if (raw.length > 40) throw Errors.field(field, "Must be an ISO-8601 date-time")
    return try {
        OffsetDateTime.parse(raw).toInstant()
    } catch (e: DateTimeParseException) {
        try {
            LocalDateTime.parse(raw).atZone(zone).toInstant()
        } catch (e2: DateTimeParseException) {
            throw Errors.field(field, "Must be an ISO-8601 date-time, e.g. 2026-10-01T09:00:00+01:00")
        }
    }
}

private val instantFormatter: DateTimeFormatter = DateTimeFormatter.ofPattern("uuuu-MM-dd'T'HH:mm:ssxxx")

/** Formats an instant in the business timezone, e.g. `2026-10-01T09:00:00+01:00`. */
fun formatInstant(instant: Instant, zone: ZoneId): String = ZonedDateTime.ofInstant(instant, zone).format(instantFormatter)
fun formatInstantOrNull(instant: Instant?, zone: ZoneId): String? = instant?.let { formatInstant(it, zone) }
fun formatTime(time: LocalTime): String = "%02d:%02d".format(Locale.ROOT, time.hour, time.minute)
