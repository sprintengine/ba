package ie.bookanything.http

import io.ktor.http.HttpHeaders
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.ApplicationCallPipeline
import io.ktor.server.application.Hook
import io.ktor.server.application.createRouteScopedPlugin
import io.ktor.server.request.ApplicationReceivePipeline
import io.ktor.server.request.contentCharset
import io.ktor.server.request.receiveChannel
import io.ktor.util.AttributeKey
import io.ktor.utils.io.ByteReadChannel
import io.ktor.utils.io.readBuffer
import kotlinx.io.readByteArray

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
suspend fun ApplicationCall.receiveBytes(maxBytes: Long): ByteArray = readBounded(receiveChannel(), maxBytes)

/** [body], this call's request body, read as [receiveBytes] reads it. */
private suspend fun ApplicationCall.readBounded(body: ByteReadChannel, maxBytes: Long): ByteArray {
    val declared = request.headers[HttpHeaders.ContentLength]?.toLongOrNull()
    if (declared != null && declared > maxBytes) throw Errors.payloadTooLarge(maxBytes)
    val bytes = body.readBuffer(maxBytes + 1).readByteArray()
    if (bytes.size > maxBytes) throw Errors.payloadTooLarge(maxBytes)
    return bytes
}

/** The request body as text (its charset, else UTF-8), at most [maxBytes] ([receiveBytes]). */
suspend fun ApplicationCall.receiveBoundedText(maxBytes: Long): String =
    String(receiveBytes(maxBytes), request.contentCharset() ?: Charsets.UTF_8)

class ReplayableBodyConfig {
    /** The most the body may be: a larger one is a 413 PAYLOAD_TOO_LARGE ([receiveBytes]). */
    var maxBytes: Long = BodyLimits.DEFAULT
}

/**
 * Lets a route receive its request body more than once (a check that reads the body, then a handler that reads it
 * again), with the body bounded by [ReplayableBodyConfig.maxBytes]. The first receive reads the body as [receiveBytes]
 * does: a larger declared length is refused unread, and a chunked body is read only to the limit + 1 bytes before the
 * 413. Every receive, that first one included, then gets those bytes.
 *
 * Instead of Ktor's DoubleReceive, whose cache keeps reading the rest of a body the route stopped reading, in the
 * background, until the call ends: here nothing reads beyond the limit, and nothing reads once the receive returns.
 */
val ReplayableBody = createRouteScopedPlugin("ReplayableBody", ::ReplayableBodyConfig) {
    val maxBytes = pluginConfig.maxBytes
    on(ReceiveRawBody) { call, body ->
        call.attributes.getOrNull(ReplayedBodyKey)?.let { return@on ByteReadChannel(it) }
        // Anything but the raw channel (a later receive's token, with nothing cached) is Ktor's to answer.
        if (body !is ByteReadChannel) return@on body
        val bytes = call.readBounded(body, maxBytes)
        call.attributes.put(ReplayedBodyKey, bytes)
        ByteReadChannel(bytes)
    }
}

private val ReplayedBodyKey = AttributeKey<ByteArray>("ReplayedBody")

/** Each receive's raw body, before it is transformed into what the route asked for. */
private object ReceiveRawBody : Hook<suspend (ApplicationCall, Any) -> Any> {
    override fun install(pipeline: ApplicationCallPipeline, handler: suspend (ApplicationCall, Any) -> Any) {
        pipeline.receivePipeline.intercept(ApplicationReceivePipeline.Before) { proceedWith(handler(context, it)) }
    }
}
