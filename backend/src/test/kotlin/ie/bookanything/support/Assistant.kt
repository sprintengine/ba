package ie.bookanything.support

import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** A parsed server-sent event of an assistant turn. */
data class SseEvent(val type: String, val data: JsonObject)

/** Drives Bo over HTTP in route tests. */
object Bo {
    suspend fun thread(api: Api, clinic: Clinic, token: String): String {
        val res = api.post("${clinic.base}/assistant/threads", null, token)
        assertStatus(HttpStatusCode.Created, res)
        return res.obj().s("id")
    }

    suspend fun post(api: Api, clinic: Clinic, token: String, thread: String, text: String): HttpResponse =
        api.post("${clinic.base}/assistant/threads/$thread/messages", jsonOf("text" to text), token)

    /** Sends [text] and returns the whole stream as events (the test client reads the body to the end). */
    suspend fun send(api: Api, clinic: Clinic, token: String, thread: String, text: String): List<SseEvent> {
        val res = post(api, clinic, token, thread, text)
        assertStatus(HttpStatusCode.OK, res)
        assertTrue(res.contentType()!!.match(ContentType.Text.EventStream), "content type ${res.contentType()}")
        return events(res.bodyAsText())
    }

    fun events(body: String): List<SseEvent> = body.split("\n\n").filter { it.isNotBlank() && !it.startsWith(":") }.map { frame ->
        val lines = frame.lines()
        val type = lines.first { it.startsWith("event: ") }.removePrefix("event: ")
        val data = parse(lines.first { it.startsWith("data: ") }.removePrefix("data: ")).jsonObject
        assertEquals(type, data.s("type"), "event name matches the data type")
        SseEvent(type, data)
    }

    fun done(events: List<SseEvent>): JsonObject = events.last { it.type == "done" }.data

    fun text(events: List<SseEvent>): String = events.filter { it.type == "text" }.joinToString("") { it.data.s("delta") }

    suspend fun confirm(api: Api, clinic: Clinic, token: String?, action: String) = api.post(
        "${clinic.base}/assistant/actions/$action/confirm", null, token,
    )

    suspend fun reject(api: Api, clinic: Clinic, token: String?, action: String) = api.post(
        "${clinic.base}/assistant/actions/$action/reject", null, token,
    )
}
