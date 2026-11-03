package ie.bookanything.mcp

import ie.bookanything.mcp.business.BusinessTools
import ie.bookanything.mcp.customer.CustomerTools
import ie.bookanything.mcp.customer.McpBooking
import ie.bookanything.support.JsonSchemaCheck
import ie.bookanything.support.McpOutputCheck
import ie.bookanything.support.OAuthClientSim
import ie.bookanything.support.TestUser
import ie.bookanything.support.a
import ie.bookanything.support.o
import ie.bookanything.support.parse
import ie.bookanything.support.s
import ie.bookanything.support.withApp
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.serializer
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * What MCP clients see of each tool besides its input: an `outputSchema` (generated from the result DTOs; every real
 * result is checked against it by [McpOutputCheck] wherever a test calls a tool), our icon, and `_meta.securitySchemes`.
 */
class McpToolListingTest {
    private val servers = mapOf("anonymous" to AnonymousMcp.TOOLS, "customer" to CustomerTools.ALL, "business" to BusinessTools.ALL)

    @Test
    fun `every tool on every server declares an output schema, an icon and how it is authorized`() {
        servers.forEach { (server, tools) ->
            tools.forEach { t ->
                val listed = t.listed("https://bookanything.ie")
                val schema = McpOutputCheck.schemaOf(requireNotNull(listed.outputSchema) { "$server ${t.name}" })
                assertEquals("object", schema.s("type"), "$server ${t.name}")
                assertTrue(schema["required"]!!.a.isNotEmpty(), "$server ${t.name}")
                assertEquals("https://bookanything.ie/icon.svg", listed.icons!!.first().src)
                val scheme = listed.meta!!["securitySchemes"]!!.a.single().o
                if (server == "anonymous") {
                    assertEquals("noauth", scheme.s("type"), t.name)
                } else {
                    assertEquals("oauth2", scheme.s("type"), t.name)
                    assertEquals(listOf(t.scope!!.value), scheme["scopes"]!!.a.map { it.toString().trim('"') }, t.name)
                }
            }
        }
    }

    @Test
    fun `only carrying out a prepared change reaches beyond the user's own account`() {
        // openWorldHint: confirm_action books, moves or cancels with a business (or a customer's booking); the tools that
        // prepare a change don't reach anyone until it is confirmed or approved.
        listOf(CustomerTools.ALL, BusinessTools.ALL).forEach { tools ->
            val openWorld = tools.filter { it.tool.annotations?.openWorldHint == true }.map { it.name }
            assertEquals(listOf("confirm_action"), openWorld)
        }
        val book = CustomerTools.ALL.single { it.name == "book" }.tool.annotations!!
        assertEquals(false, book.openWorldHint)
        assertEquals(false, book.readOnlyHint)
    }

    @Test
    fun `output schemas follow the API's JSON with every property present, nulls typed and enums listed`() {
        val booking = OutputSchemas.schema(serializer<McpBooking>())
        assertEquals(booking["properties"]!!.o.keys.toList(), booking["required"]!!.a.map { it.toString().trim('"') })
        val props = booking["properties"]!!.o
        assertEquals(parse("""{"type":["string","null"]}"""), props["option"])
        assertEquals(parse("""{"type":"integer"}"""), props["priceCents"])
        assertTrue(props["status"]!!.o["enum"]!!.a.map { it.toString().trim('"') }.containsAll(listOf("confirmed", "cancelled")))
        assertEquals(listOf("object", "null"), props["refundIfCancelledNow"]!!.o["type"]!!.a.map { it.toString().trim('"') })
    }

    @Test
    fun `the schema check refuses what a client would refuse`() {
        val schema = OutputSchemas.schema(serializer<McpBooking>())
        val valid = parse(
            """{"id":"b","reference":"R","status":"confirmed","paymentStatus":"not_required","business":{"name":"n","slug":"s"},
            "service":"x","option":null,"start":"s","end":"e","timezone":"Europe/Dublin","priceCents":0,"originalPriceCents":null,
            "offer":null,"currency":"EUR","amountPaidCents":0,"canCancel":true,"canReschedule":true,"refundIfCancelledNow":null}""",
        ).jsonObject
        assertEquals(emptyList(), JsonSchemaCheck.problems(schema, valid))
        fun broken(key: String, json: String) = JsonObject(valid + (key to parse(json)))
        assertTrue(JsonSchemaCheck.problems(schema, broken("priceCents", "\"10\"")).isNotEmpty(), "a string for an integer")
        assertTrue(JsonSchemaCheck.problems(schema, broken("status", "\"teleported\"")).isNotEmpty(), "not one of the enum")
        assertTrue(JsonSchemaCheck.problems(schema, broken("service", "null")).isNotEmpty(), "null where it can't be")
        assertTrue(JsonSchemaCheck.problems(schema, broken("business", """{"name":"n"}""")).isNotEmpty(), "a nested property missing")
        assertTrue(JsonSchemaCheck.problems(schema, JsonObject(valid - "currency")).isNotEmpty(), "a property missing")
        assertTrue(JsonSchemaCheck.problems(schema, broken("extra", "1")).isEmpty(), "additional properties are allowed")
        val unknownKeyword = JsonObject(schema + ("pattern" to parse("\"x\"")))
        assertTrue(JsonSchemaCheck.problems(unknownKeyword, valid).isNotEmpty(), "a keyword the check doesn't know fails")
    }

    @Test
    fun `tools list and initialize carry the schemas and icons over the wire`() = withApp { api ->
        val sim = OAuthClientSim(api).register()
        val token = sim.connect(TestUser.create("lister")).s("access_token")
        val init = sim.rpc(
            token, "initialize",
            ie.bookanything.oauth.jsonObj(
                "protocolVersion" to "2025-11-25", "capabilities" to emptyMap<String, String>(),
                "clientInfo" to mapOf("name" to "t", "version" to "1"),
            ),
        )
        assertEquals("http://localhost:3000/icon.svg", init["serverInfo"]!!.o["icons"]!!.a.first().s("src"))
        val listed = sim.rpc(token, "tools/list")["tools"]!!.a.map { it.o }
        val book = listed.single { it.s("name") == "book" }
        assertEquals("object", book["outputSchema"]!!.o.s("type"))
        assertEquals("oauth2", book["_meta"]!!.o["securitySchemes"]!!.a.single().s("type"))
        assertEquals("http://localhost:3000/icon-512.png", book["icons"]!!.a.last().s("src"))
    }
}
