package ie.bookanything.security

import ie.bookanything.http.BodyLimits
import ie.bookanything.payments.StripePaymentProvider
import ie.bookanything.support.Api
import ie.bookanything.support.DEFAULT_NOW
import ie.bookanything.support.FakeStripeGateway
import ie.bookanything.support.Fixtures
import ie.bookanything.support.MutableClock
import ie.bookanything.support.OAuthClientSim
import ie.bookanything.support.StripeTest
import ie.bookanything.support.TestConfig
import ie.bookanything.support.TestEnv
import ie.bookanything.support.TestUser
import ie.bookanything.support.assertError
import ie.bookanything.support.jsonOf
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.withApp
import io.ktor.client.request.forms.submitForm
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.OutgoingContent
import io.ktor.http.contentType
import io.ktor.http.parameters
import io.ktor.utils.io.ByteWriteChannel
import io.ktor.utils.io.writeFully
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals

/**
 * Request bodies are bounded ([BodyLimits]): a body over its route's limit is a 413 whether it declares its length or
 * is sent chunked (then only the limit + 1 bytes are read), on public routes, webhooks, OAuth and the customer MCP.
 */
class RequestBodyLimitTest {
    /** A JSON object of exactly [size] bytes, sent with its length. */
    private fun sized(size: Long) = jsonOf("filler" to "a".repeat((size - """{"filler":""}""".length).toInt()))

    /** [size] bytes sent chunked: no Content-Length, so only reading tells how large it is. */
    private fun chunked(size: Long, type: ContentType = ContentType.Application.Json) = object : OutgoingContent.WriteChannelContent() {
        override val contentType = type
        override suspend fun writeTo(channel: ByteWriteChannel) {
            val chunk = ByteArray(CHUNK) { 'a'.code.toByte() }
            repeat((size / CHUNK).toInt()) { channel.writeFully(chunk) }
        }
    }

    private suspend fun Api.postChunked(path: String, size: Long, token: String? = null, type: ContentType = ContentType.Application.Json) =
        client.post(path) {
            if (token != null) header(HttpHeaders.Authorization, "Bearer $token")
            setBody(chunked(size, type))
        }

    private suspend fun tooLarge(res: HttpResponse) = assertError(HttpStatusCode.PayloadTooLarge, "PAYLOAD_TOO_LARGE", res)

    @Test
    fun `a public JSON route refuses bodies over 256 KB, declared or chunked`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val path = "${clinic.public}/bookings"
        tooLarge(api.post(path, sized(BodyLimits.DEFAULT + 1)))
        tooLarge(api.postChunked(path, 2 * MB))
        // At the limit the body is read and judged on its content.
        assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", api.post(path, sized(BodyLimits.DEFAULT)))
    }

    @Test
    fun `site plans and business setups may be up to 1 MB`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val owner = clinic.owner.token
        val big = sized(BodyLimits.DEFAULT * 2)
        assertNotEquals(HttpStatusCode.PayloadTooLarge, api.put("${clinic.base}/site", big, owner).status)
        assertNotEquals(HttpStatusCode.PayloadTooLarge, api.post("/v1/businesses", big, TestUser.create("big").token).status)
        tooLarge(api.put("${clinic.base}/site", sized(BodyLimits.LARGE + 1), owner))
        tooLarge(api.postChunked("/v1/businesses", 2 * MB, TestUser.create("bigger").token))
        // Other signed-in routes keep the default.
        tooLarge(api.post("${clinic.base}/customers", big, owner))
    }

    @Test
    fun `webhooks refuse bodies over 1 MB, declared or chunked`() {
        val payments = StripePaymentProvider(FakeStripeGateway(), StripeTest.config, MutableClock(DEFAULT_NOW))
        withApp(TestEnv(config = TestConfig.config(stripe = StripeTest.config), payments = payments)) { api ->
            val declared = api.client.post("/v1/webhooks/stripe") {
                header("Stripe-Signature", "t=1,v1=00")
                contentType(ContentType.Application.Json)
                setBody(sized(BodyLimits.LARGE + 1))
            }
            tooLarge(declared)
            tooLarge(api.postChunked("/v1/webhooks/stripe", 2 * MB))
            // Within the limit the signature decides.
            assertError(
                HttpStatusCode.BadRequest, "INVALID_SIGNATURE",
                api.client.post("/v1/webhooks/stripe") {
                    header("Stripe-Signature", "t=1,v1=00")
                    contentType(ContentType.Application.Json)
                    setBody(sized(BodyLimits.DEFAULT))
                },
            )
        }
    }

    @Test
    fun `OAuth endpoints take at most 64 KB`() = withApp { api ->
        tooLarge(api.client.submitForm("/v1/oauth/token", parameters { append("grant_type", "a".repeat(BodyLimits.OAUTH.toInt())) }))
        tooLarge(api.postChunked("/v1/oauth/token", 2 * MB, type = ContentType.Application.FormUrlEncoded))
        tooLarge(api.post("/v1/oauth/register", sized(BodyLimits.OAUTH + 1)))
        tooLarge(api.postChunked("/v1/oauth/register", 2 * MB))
        // Small but not a JSON object: OAuth's own error, as before.
        val notJson = api.post("/v1/oauth/register", "[1, 2]")
        assertEquals(HttpStatusCode.BadRequest, notJson.status)
        assertEquals("invalid_client_metadata", notJson.obj().s("error"))
    }

    @Test
    fun `the customer MCP refuses bodies over 256 KB before reading them all`() = withApp { api ->
        val sim = OAuthClientSim(api).register()
        val token = sim.connect(TestUser.create("mcp-body")).s("access_token")
        val res = api.client.post("/v1/mcp/customer") {
            header(HttpHeaders.Authorization, "Bearer $token")
            header(HttpHeaders.Accept, "application/json, text/event-stream")
            header("MCP-Protocol-Version", "2025-11-25")
            setBody(chunked(2 * MB))
        }
        tooLarge(res)
        assertEquals(HttpStatusCode.OK, sim.mcp(token, "tools/list").status, "normal calls still work")
    }

    private companion object {
        const val CHUNK = 16 * 1024
        const val MB = 1024L * 1024
    }
}
