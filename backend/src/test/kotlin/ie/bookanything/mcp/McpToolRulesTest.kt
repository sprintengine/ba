package ie.bookanything.mcp

import ie.bookanything.assistant.tools.ReadTool
import ie.bookanything.assistant.tools.ToolRegistry
import ie.bookanything.assistant.tools.WriteTool
import ie.bookanything.auth.Role
import ie.bookanything.http.ApiException
import ie.bookanything.mcp.business.BusinessTools
import ie.bookanything.mcp.customer.BookArgs
import ie.bookanything.mcp.customer.CancelArgs
import ie.bookanything.mcp.customer.CustomerTools
import ie.bookanything.mcp.customer.NoArgs
import ie.bookanything.oauth.Scope
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.serializer
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class McpToolRulesTest {
    @Test
    fun `tool arguments are decoded strictly`() {
        val ok = StrictArgs.decode(
            serializer<BookArgs>(),
            buildJsonObject {
                put("slug", "lumen-physio"); put("serviceId", "s"); put("start", "2026-10-06T10:00:00+01:00")
            },
        )
        assertEquals("lumen-physio", ok.slug)
        assertEquals(emptyMap(), ok.answers)

        val unknown = assertFailsWith<ApiException> {
            StrictArgs.decode(
                serializer<BookArgs>(),
                buildJsonObject { put("slug", "x"); put("serviceId", "s"); put("start", "t"); put("cardNumber", "4242") },
            )
        }
        assertEquals("Unknown argument", unknown.fields["cardNumber"])
        val missing = assertFailsWith<ApiException> { StrictArgs.decode(serializer<BookArgs>(), buildJsonObject { put("slug", "x") }) }
        assertEquals(setOf("serviceId", "start"), missing.fields.keys)
        assertFailsWith<ApiException> {
            StrictArgs.decode(serializer<CancelArgs>(), buildJsonObject { put("bookingId", "b"); put("confirm", "yes") })
        }
        assertFailsWith<ApiException> { StrictArgs.decode(serializer<SearchMarketplaceArgs>(), buildJsonObject { put("limit", 1.5) }) }
        StrictArgs.decode(serializer<NoArgs>(), JsonObject(emptyMap()))
        assertFailsWith<ApiException> { StrictArgs.decode(serializer<NoArgs>(), buildJsonObject { put("x", 1) }) }
    }

    @Test
    fun `every customer tool is described, scoped and schema-typed`() {
        val names = CustomerTools.ALL.map { it.name }
        assertEquals(
            listOf(
                "search_marketplace", "get_business", "check_availability", "book", "list_my_bookings", "get_next_appointment",
                "find_times_to_move", "get_payment_link", "reschedule_booking", "cancel_booking", "confirm_action", "cancel_action",
                "get_proposal",
            ),
            names,
        )
        CustomerTools.ALL.forEach { t ->
            assertTrue(t.tool.description!!.length > 40, "${t.name} needs a real description")
            assertTrue(t.scope != null, "${t.name} needs a scope")
            assertEquals("object", t.tool.inputSchema.type)
        }
        assertEquals(Scope.BOOKINGS_WRITE, CustomerTools.scopeFor("book"))
        assertEquals(Scope.BOOKINGS_READ, CustomerTools.scopeFor("list_my_bookings"))
        assertEquals(Scope.MARKETPLACE_READ, CustomerTools.scopeFor("search_marketplace"))
        assertEquals(null, CustomerTools.scopeFor("nope"))
        // Changes only prepare a request; carrying one out is the destructive step (section 20.8).
        val cancel = CustomerTools.ALL.first { it.name == "cancel_booking" }.tool
        assertEquals(false, cancel.annotations?.destructiveHint)
        assertTrue(cancel.description!!.contains("until it is approved"))
        assertEquals(true, CustomerTools.ALL.first { it.name == "confirm_action" }.tool.annotations?.destructiveHint)
        // The customer's own group is used: the argument isn't offered.
        val availability = CustomerTools.ALL.first { it.name == "check_availability" }.tool.inputSchema.properties!!
        assertFalse("groupId" in availability)
        assertEquals(
            listOf("latitude", "longitude"),
            (MarketplaceTools.searchTool().inputSchema.properties!!["near"]!!.jsonObject["required"] as JsonArray).map {
                (it as JsonPrimitive).content
            },
        )
    }

    @Test
    fun `every business tool is described and scoped, reads are read-only, and only confirm_action changes anything`() {
        val registry = ToolRegistry.DEFAULT
        val wrapped = BusinessTools.ALL.map { it.name }.toSet()
        assertTrue(wrapped.containsAll(registry.all.map { it.name } - "update_memory"), "Bo's tools, but its memory, are served")
        assertFalse("update_memory" in wrapped)
        BusinessTools.ALL.forEach { t ->
            assertTrue(t.tool.description!!.length > 40, "${t.name} needs a real description")
            assertEquals("object", t.tool.inputSchema.type)
            assertFalse(t.tool.description!!.contains("in the context") || t.tool.description!!.contains("card in the app"), t.name)
            val bo = registry.find(t.name)
            when {
                bo is ReadTool<*> -> {
                    assertEquals(Scope.BUSINESS_READ, t.scope, t.name)
                    assertEquals(true, t.tool.annotations?.readOnlyHint, t.name)
                }
                bo is WriteTool<*> -> {
                    assertEquals(Scope.BUSINESS_WRITE, t.scope, t.name)
                    // Proposing changes nothing, so it isn't destructive; confirming is.
                    assertEquals(false, t.tool.annotations?.destructiveHint, t.name)
                    assertTrue(t.tool.description!!.contains("confirm_action"), t.name)
                }
            }
            if (bo != null) assertTrue("business" in t.tool.inputSchema.properties!!, "${t.name} takes the business")
        }
        assertEquals(true, BusinessTools.ALL.first { it.name == "confirm_action" }.tool.annotations?.destructiveHint)
        assertEquals(Scope.BUSINESS_WRITE, BusinessTools.scopeFor("confirm_action"))
        assertEquals(Scope.BUSINESS_READ, BusinessTools.scopeFor("list_my_businesses"))
        // Optional (nullable) arguments are not required of an app.
        assertEquals(listOf("date", "days"), BusinessTools.ALL.first { it.name == "get_schedule" }.tool.inputSchema.required)
        // Tools above the member's role aren't offered.
        val staff = BusinessTools.forRole(Role.STAFF).map { it.name }
        assertFalse("get_stats" in staff || "close_date" in staff)
        assertEquals(listOf("list_my_businesses"), BusinessTools.forRole(null).map { it.name })
    }

    @Test
    fun `the anonymous server is read-only`() {
        assertEquals(
            listOf("search_marketplace", "find_business", "list_services", "check_availability"), AnonymousMcp.TOOLS.map { it.name },
        )
        assertTrue(AnonymousMcp.TOOLS.all { it.tool.annotations?.readOnlyHint == true })
    }
}
