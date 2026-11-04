package ie.bookanything.http

import ie.bookanything.module
import ie.bookanything.support.TestEnv
import ie.bookanything.support.assertError
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.OutgoingContent
import io.ktor.server.request.receiveChannel
import io.ktor.server.request.receiveText
import io.ktor.server.response.respondText
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import io.ktor.server.routing.routing
import io.ktor.server.testing.ApplicationTestBuilder
import io.ktor.server.testing.testApplication
import io.ktor.utils.io.ByteWriteChannel
import io.ktor.utils.io.readBuffer
import io.ktor.utils.io.writeFully
import kotlinx.io.readByteArray
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * [ReplayableBody]: a route reads its body twice, and a body over the limit is a 413 that ends the call (the test engine
 * waits for every call to end, so a receive left reading in the background fails this test by timing out).
 */
class ReplayableBodyTest {
    private fun replaying(block: suspend ApplicationTestBuilder.() -> Unit) = testApplication {
        application {
            module(TestEnv().ctx)
            routing {
                route("/v1/test/replay") {
                    install(ReplayableBody) { maxBytes = LIMIT }
                    post {
                        // A check reads part of the body; the handler then gets all of it.
                        val peek = call.receiveChannel().readBuffer(2L).readByteArray().decodeToString()
                        call.respondText("$peek|${call.receiveText()}")
                    }
                }
            }
        }
        block()
    }

    /** [size] bytes, sent chunked: no Content-Length, so only reading tells how large it is. */
    private fun chunked(size: Int) = object : OutgoingContent.WriteChannelContent() {
        override val contentType = ContentType.Application.Json
        override suspend fun writeTo(channel: ByteWriteChannel) {
            val chunk = ByteArray(CHUNK) { 'a'.code.toByte() }
            repeat(size / CHUNK) { channel.writeFully(chunk) }
        }
    }

    @Test
    fun `every receive gets the whole body`() = replaying {
        val res = client.post("/v1/test/replay") { setBody("""{"a":1}""") }
        assertEquals(HttpStatusCode.OK, res.status)
        assertEquals("""{"|{"a":1}""", res.bodyAsText())
    }

    @Test
    fun `a body at the limit is read`() = replaying {
        val res = client.post("/v1/test/replay") { setBody("a".repeat(LIMIT.toInt())) }
        assertEquals("aa|${"a".repeat(LIMIT.toInt())}", res.bodyAsText())
    }

    @Test
    fun `a longer declared body is refused unread`() = replaying {
        assertError(
            HttpStatusCode.PayloadTooLarge, "PAYLOAD_TOO_LARGE",
            client.post("/v1/test/replay") { setBody("a".repeat(LIMIT.toInt() + 1)) },
        )
    }

    @Test
    fun `a chunked body over the limit is refused and the call ends`() = replaying {
        assertError(HttpStatusCode.PayloadTooLarge, "PAYLOAD_TOO_LARGE", client.post("/v1/test/replay") { setBody(chunked(2 * MB)) })
    }

    private companion object {
        const val LIMIT = 4 * 1024L
        const val CHUNK = 16 * 1024
        const val MB = 1024 * 1024
    }
}
