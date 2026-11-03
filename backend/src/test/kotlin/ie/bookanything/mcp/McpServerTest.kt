package ie.bookanything.mcp

import ie.bookanything.support.Api
import ie.bookanything.support.DEFAULT_NOW
import ie.bookanything.support.Fixtures
import ie.bookanything.support.MarketplaceFixtures
import ie.bookanything.support.MutableClock
import ie.bookanything.support.TestConfig
import ie.bookanything.support.TestEnv
import ie.bookanything.support.jsonOf
import ie.bookanything.support.parse
import ie.bookanything.support.s
import ie.bookanything.support.withApp
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.util.concurrent.atomic.AtomicInteger
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** The anonymous MCP server over stateless Streamable HTTP: protocol conformance and its read-only tools. */
class McpServerTest {
    private val ids = AtomicInteger(0)

    private suspend fun post(api: Api, body: String, version: String? = "2025-06-18"): HttpResponse = api.client.post("/v1/mcp") {
        header("Accept", "application/json, text/event-stream")
        if (version != null) header("MCP-Protocol-Version", version)
        contentType(ContentType.Application.Json)
        setBody(body)
    }

    private suspend fun rpc(api: Api, method: String, params: JsonObject = JsonObject(emptyMap())): JsonObject {
        val res = post(
            api,
            buildJsonObject {
                put("jsonrpc", "2.0"); put("id", ids.incrementAndGet()); put("method", method); put(
                    "params",
                    params,
                )
            }.toString(),
        )
        val text = res.bodyAsText()
        assertEquals(HttpStatusCode.OK, res.status, text)
        return parse(text).jsonObject
    }

    private suspend fun call(api: Api, tool: String, args: JsonElement): JsonObject =
        rpc(api, "tools/call", buildJsonObject { put("name", tool); put("arguments", args) })["result"]!!.jsonObject

    private fun isError(result: JsonObject) = result["isError"]?.jsonPrimitive?.content == "true"
    private fun text(result: JsonObject) = result["content"]!!.jsonArray.first().jsonObject["text"]!!.jsonPrimitive.content

    @Test
    fun `lifecycle, tool listing and errors follow the Streamable HTTP transport`() = withApp { api ->
        val init = rpc(
            api, "initialize",
            buildJsonObject {
                put("protocolVersion", "2025-06-18")
                put("capabilities", JsonObject(emptyMap()))
                put("clientInfo", buildJsonObject { put("name", "test"); put("version", "1") })
            },
        )["result"]!!.jsonObject
        assertEquals("2025-06-18", init.s("protocolVersion"))
        assertEquals("bookanything", init["serverInfo"]!!.jsonObject.s("name"))
        assertTrue("tools" in init["capabilities"]!!.jsonObject)
        assertTrue(init.s("instructions").contains("read-only"))

        // Notifications are accepted without a body.
        val notified = post(api, """{"jsonrpc":"2.0","method":"notifications/initialized"}""")
        assertEquals(HttpStatusCode.Accepted, notified.status)

        val tools = rpc(api, "tools/list")["result"]!!.jsonObject["tools"]!!.jsonArray
        assertEquals(listOf("search_marketplace", "find_business", "list_services", "check_availability"), tools.map { it.s("name") })
        assertTrue(tools.all { it.jsonObject["inputSchema"]!!.jsonObject.s("type") == "object" })

        // Booking needs the signed-in server: the anonymous one has no booking tool.
        val unknown = rpc(
            api, "tools/call", buildJsonObject { put("name", "create_booking_request"); put("arguments", JsonObject(emptyMap())) },
        )
        assertTrue(unknown["error"] != null || isError(unknown["result"]!!.jsonObject), unknown.toString())

        // Transport rules: POST only, JSON only, supported protocol versions only.
        assertEquals(HttpStatusCode.MethodNotAllowed, api.get("/v1/mcp").status)
        assertEquals(
            HttpStatusCode.BadRequest, post(api, """{"jsonrpc":"2.0","id":1,"method":"tools/list"}""", version = "1999-01-01").status,
        )
        assertTrue(post(api, "not json").status.value in 400..499)
        // REST responses keep the API's JSON settings (explicit nulls) next to the MCP route.
        val clinic = Fixtures.clinic(api)
        assertTrue(api.get("/v1/public/businesses/${clinic.slug}").bodyAsText().contains("\"contactEmail\":null"))
    }

    @Test
    fun `a 2026-07-28 client falls back to initialize and negotiates 2025-11-25`() = withApp { api ->
        // Modern clients try a request without initialize first. A 400 whose body isn't a modern error
        // (HeaderMismatch, UnsupportedProtocolVersion, MissingRequiredClientCapability: -32020..-32022) tells them this
        // server is of the initialize era, so they fall back to it; one of those codes would make them retry instead.
        val modern = api.client.post("/v1/mcp") {
            header("Accept", "application/json, text/event-stream")
            header("MCP-Protocol-Version", "2026-07-28")
            header("Mcp-Method", "tools/list")
            contentType(ContentType.Application.Json)
            setBody(
                """{"jsonrpc":"2.0","id":1,"method":"tools/list",""" +
                    """"params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28"}}}""",
            )
        }
        val body = modern.bodyAsText()
        assertEquals(HttpStatusCode.BadRequest, modern.status, body)
        val code = runCatching { parse(body).jsonObject["error"]!!.jsonObject["code"]!!.jsonPrimitive.content.toInt() }.getOrNull()
        assertTrue(code == null || code !in -32022..-32020, "not a modern JSON-RPC error: $body")

        // The fallback initialize carries no version header yet (it is sent once a version is negotiated).
        val fallback = post(
            api,
            buildJsonObject {
                put("jsonrpc", "2.0"); put("id", 2); put("method", "initialize")
                put(
                    "params",
                    buildJsonObject {
                        put("protocolVersion", "2026-07-28")
                        put("capabilities", JsonObject(emptyMap()))
                        put("clientInfo", buildJsonObject { put("name", "modern"); put("version", "1") })
                    },
                )
            }.toString(),
            version = null,
        )
        assertEquals(HttpStatusCode.OK, fallback.status)
        assertEquals("2025-11-25", parse(fallback.bodyAsText()).jsonObject["result"]!!.jsonObject.s("protocolVersion"))
        val tools = post(api, """{"jsonrpc":"2.0","id":3,"method":"tools/list"}""", version = "2025-11-25")
        assertEquals(HttpStatusCode.OK, tools.status)
    }

    @Test
    fun `anonymous tools search, read and check availability through the normal engine`() = withApp { api ->
        val clinic = MarketplaceFixtures.listedClinic(api, MarketplaceFixtures.isolatedPoint())
        val found = call(api, "find_business", buildJsonObject { put("slug", clinic.slug) })
        assertEquals(false, isError(found), text(found))
        assertTrue(found["structuredContent"]!!.jsonObject.s("bookingUrl").endsWith("/${clinic.slug}"))

        val search = call(api, "search_marketplace", buildJsonObject { put("query", clinic.slug) })
        assertEquals(
            clinic.slug,
            search["structuredContent"]!!.jsonObject["items"]!!.jsonArray.single().jsonObject["business"]!!.jsonObject.s("slug"),
        )

        val services = call(
            api, "list_services", buildJsonObject { put("slug", clinic.slug) },
        )["structuredContent"]!!.jsonObject["services"]!!.jsonArray
        val consult = services.first { it.s("name") == "Consult" }.jsonObject
        val avail = call(
            api, "check_availability",
            buildJsonObject {
                put("slug", clinic.slug); put("serviceId", consult.s("id")); put("from", "2026-10-07"); put("to", "2026-10-07")
            },
        )["structuredContent"]!!.jsonObject
        val firstSlots = avail["days"]!!.jsonArray.first().jsonObject["slots"]!!.jsonArray
        assertTrue(firstSlots.isNotEmpty())
        assertEquals("false", avail["nextAvailableOnly"]!!.jsonPrimitive.content)
        // `after` steps past the times already shown.
        val later = call(
            api, "check_availability",
            buildJsonObject {
                put("slug", clinic.slug); put("serviceId", consult.s("id")); put("from", "2026-10-07")
                put("after", firstSlots.first().s("start"))
            },
        )["structuredContent"]!!.jsonObject["days"]!!.jsonArray.first().jsonObject["slots"]!!.jsonArray
        assertEquals(firstSlots.drop(1).map { it.s("start") }, later.map { it.s("start") })
        // A business offering only its next available time: one time, flagged.
        api.patch(clinic.base, jsonOf("policies" to mapOf("nextAvailableOnly" to true)), clinic.owner.token)
        val next = call(
            api, "check_availability",
            buildJsonObject {
                put("slug", clinic.slug); put("serviceId", consult.s("id")); put("from", "2026-10-07"); put("to", "2026-10-08")
            },
        )["structuredContent"]!!.jsonObject
        assertEquals("true", next["nextAvailableOnly"]!!.jsonPrimitive.content)
        val nextStarts = next["days"]!!.jsonArray.flatMap { d -> d.jsonObject["slots"]!!.jsonArray.map { it.s("start") } }
        assertEquals(listOf(firstSlots.first().s("start")), nextStarts)

        val unknown = call(api, "find_business", buildJsonObject { put("slug", "no-such-business") })
        assertTrue(isError(unknown) && text(unknown).startsWith("NOT_FOUND"))
        val badArgs = call(api, "find_business", buildJsonObject { put("slug", clinic.slug); put("password", "x") })
        assertTrue(isError(badArgs) && text(badArgs).startsWith("INVALID_REQUEST"), text(badArgs))
        val badRange = call(
            api, "check_availability",
            buildJsonObject {
                put("slug", clinic.slug); put("serviceId", consult.s("id")); put("from", "2026-10-07"); put("to", "2026-12-31")
            },
        )
        assertTrue(isError(badRange) && text(badRange).startsWith("INVALID_REQUEST"))
    }

    @Test
    fun `anonymous MCP requests are rate limited per client`() {
        val env = TestEnv(clock = MutableClock(DEFAULT_NOW.plusSeconds(86_400L * 402 + 13)), config = TestConfig.config(rateLimits = true))
        withApp(env) { api ->
            val list = buildJsonObject { put("jsonrpc", "2.0"); put("id", 1); put("method", "tools/list") }.toString()
            repeat(ie.bookanything.http.RateLimiter.MCP.max) { assertEquals(HttpStatusCode.OK, post(api, list).status) }
            assertEquals(HttpStatusCode.TooManyRequests, post(api, list).status)
        }
    }
}
