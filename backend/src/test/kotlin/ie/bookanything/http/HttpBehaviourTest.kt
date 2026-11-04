package ie.bookanything.http

import ie.bookanything.redactPath
import ie.bookanything.support.Bo
import ie.bookanything.support.FakeModelClient
import ie.bookanything.support.Fixtures
import ie.bookanything.support.TestConfig
import ie.bookanything.support.TestEnv
import ie.bookanything.support.assertError
import ie.bookanything.support.assertStatus
import ie.bookanything.support.jsonOf
import ie.bookanything.support.o
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.withApp
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.options
import io.ktor.client.statement.bodyAsText
import io.ktor.client.statement.readRawBytes
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import java.util.zip.GZIPInputStream
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class HttpBehaviourTest {
    @Test
    fun `public booking creation is rate limited per IP`() {
        val env = TestEnv(config = TestConfig.config(rateLimits = true).copy())
        withApp(env) { api ->
            val clinic = Fixtures.clinic(api)
            val statuses = (1..21).map {
                api.post("${clinic.public}/bookings", Fixtures.bookingBody(clinic, "Consult", "2026-10-07T10:07:00+01:00")).status
            }
            assertEquals(20, statuses.count { it == HttpStatusCode.Conflict }) // unaligned slot: rejected but counted
            assertError(
                HttpStatusCode.TooManyRequests, "RATE_LIMITED",
                api.post("${clinic.public}/bookings", Fixtures.bookingBody(clinic, "Consult", "2026-10-07T10:00:00+01:00")),
            )
            assertEquals(HttpStatusCode.TooManyRequests, statuses.last())
        }
    }

    @Test
    fun `unknown routes and errors are JSON with specific messages`() = withApp { api ->
        val missing = api.get("/v1/nope")
        assertError(HttpStatusCode.NotFound, "NOT_FOUND", missing)
        val manage = api.get("/v1/public/manage/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
        assertError(HttpStatusCode.NotFound, "NOT_FOUND", manage)
        assertEquals("Booking not found.", manage.obj()["error"]!!.o.s("message"))
    }

    @Test
    fun `CORS allows configured embed origins on public routes only`() {
        val env = TestEnv(config = TestConfig.config().copy(corsAllowedOrigins = listOf("https://embed.example.test")))
        withApp(env) { api ->
            val ok = api.client.get("/v1/public/templates") { header(HttpHeaders.Origin, "https://embed.example.test") }
            assertStatus(HttpStatusCode.OK, ok)
            assertEquals("https://embed.example.test", ok.headers[HttpHeaders.AccessControlAllowOrigin])
            val preflight = api.client.options("/v1/public/templates") {
                header(HttpHeaders.Origin, "https://embed.example.test")
                header(HttpHeaders.AccessControlRequestMethod, "POST")
                header(HttpHeaders.AccessControlRequestHeaders, "content-type,idempotency-key")
            }
            assertEquals(HttpStatusCode.OK, preflight.status)
            val other = api.client.get("/v1/public/templates") { header(HttpHeaders.Origin, "https://evil.example.test") }
            assertNull(other.headers[HttpHeaders.AccessControlAllowOrigin])
            val me = api.client.get("/v1/health") { header(HttpHeaders.Origin, "https://embed.example.test") }
            assertNull(me.headers[HttpHeaders.AccessControlAllowOrigin])
        }
    }

    @Test
    fun `large responses are gzipped for clients that accept it, small ones are not`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val path = "${clinic.public}/availability?serviceId=${clinic.service("Consult")}&from=2026-10-12&to=2026-10-25"
        val plain = api.get(path)
        assertNull(plain.headers[HttpHeaders.ContentEncoding])
        val json = plain.bodyAsText()

        val zipped = api.client.get(path) { header(HttpHeaders.AcceptEncoding, "gzip, deflate, br") }
        assertEquals("gzip", zipped.headers[HttpHeaders.ContentEncoding])
        val bytes = zipped.readRawBytes()
        assertEquals(json, GZIPInputStream(bytes.inputStream()).readBytes().decodeToString())
        assertTrue(bytes.size * 5 < json.length, "${json.length} bytes of JSON became ${bytes.size}")

        val small = api.client.get("/v1/health") { header(HttpHeaders.AcceptEncoding, "gzip") }
        assertNull(small.headers[HttpHeaders.ContentEncoding])
    }

    @Test
    fun `only responses that are the same for everyone may be cached publicly`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        assertEquals("public, max-age=900", api.get("/v1/public/templates").headers[HttpHeaders.CacheControl])
        assertEquals("public, max-age=900", api.get("/v1/public/templates/physio").headers[HttpHeaders.CacheControl])
        assertEquals("public, max-age=300", api.get("/v1/public/marketplace/meta").headers[HttpHeaders.CacheControl])
        // Everything else is never stored: personal answers, live availability, errors.
        listOf(clinic.public, "${clinic.public}/services", "/v1/public/marketplace/search", "/v1/nope").forEach { path ->
            assertEquals("no-store", api.get(path).headers[HttpHeaders.CacheControl], path)
        }
        assertEquals("no-store", api.get(clinic.base, clinic.owner.token).headers[HttpHeaders.CacheControl])
        assertEquals("no-store", api.get("/v1/me").headers[HttpHeaders.CacheControl], "401")
    }

    @Test
    fun `Bo's event stream keeps its own cache header`() {
        val model = FakeModelClient()
        withApp(TestEnv(modelClient = model)) { api ->
            val clinic = Fixtures.clinic(api)
            model.script("""{"rules": [{"match": ["*"], "steps": [{"text": "Hello."}]}]}""")
            val thread = Bo.thread(api, clinic, clinic.owner.token)
            val res = api.post("${clinic.base}/assistant/threads/$thread/messages", jsonOf("text" to "Hi"), clinic.owner.token)
            assertStatus(HttpStatusCode.OK, res)
            assertEquals("no-cache, no-transform", res.headers[HttpHeaders.CacheControl])
        }
    }

    @Test
    fun `secret tokens are redacted from access logs`() {
        assertEquals("/v1/public/manage/[redacted]/cancel", redactPath("/v1/public/manage/abcDEF123_-xyz/cancel"))
        assertEquals("/v1/invitations/[redacted]/accept", redactPath("/v1/invitations/tok/accept"))
        assertEquals("/v1/me", redactPath("/v1/me"))
    }
}
