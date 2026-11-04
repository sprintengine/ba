package ie.bookanything.mcp

import ie.bookanything.oauth.OAuthConfig
import ie.bookanything.oauth.jsonObj
import ie.bookanything.support.Fixtures
import ie.bookanything.support.OAuthClientSim
import ie.bookanything.support.OAuthClientSim.Companion.data
import ie.bookanything.support.OAuthClientSim.Companion.isError
import ie.bookanything.support.OAuthClientSim.Companion.text
import ie.bookanything.support.Roles
import ie.bookanything.support.TestConfig
import ie.bookanything.support.TestEnv
import ie.bookanything.support.TestUser
import ie.bookanything.support.a
import ie.bookanything.support.arr
import ie.bookanything.support.assertStatus
import ie.bookanything.support.jsonOf
import ie.bookanything.support.o
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.withApp
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** The business MCP (section 20.7): a member's own AI app reads and, with their confirmation, changes their business. */
class BusinessMcpTest {
    private fun overrides(resourceId: String) =
        Fixtures.sqlOne("SELECT count(*) FROM availability_overrides WHERE resource_id = ?::uuid", resourceId) { it.getInt(1) }

    private suspend fun tools(sim: OAuthClientSim, token: String) = sim.rpc(token, "tools/list")["tools"]!!.a.map { it.s("name") }

    @Test
    fun `an owner's app reads the business and changes it only once the owner confirms`() = withApp { api ->
        val clinic = Fixtures.allowAgents(api, Fixtures.clinic(api))
        Roles.of(api, clinic) // a Consult is booked on 7 October at 10:00
        val sim = OAuthClientSim.business(api).register("Owner's Assistant")

        // The consent screen says what the app will reach.
        val consent = sim.check(clinic.owner, sim.authorizeParams()).obj()
        assertEquals("business", consent.s("audience"))
        assertEquals("http://localhost:3000/mcp/business", consent.s("resource"))
        assertEquals(listOf("business:read", "business:write"), consent["scopes"]!!.a.map { it.s("key") })
        val listed = consent["businesses"]!!.a.single().o
        assertEquals(clinic.slug, listed.s("slug"))
        assertEquals("owner", listed.s("role"))
        assertEquals("true", listed["aiAgentsAllowed"]!!.jsonPrimitive.content)

        val token = sim.connect(clinic.owner).s("access_token")
        val init = sim.rpc(
            token, "initialize",
            jsonObj(
                "protocolVersion" to "2025-11-25", "capabilities" to emptyMap<String, String>(),
                "clientInfo" to mapOf("name" to "t", "version" to "1"),
            ),
        )
        assertEquals("bookanything-business", init["serverInfo"]!!.o.s("name"))
        assertTrue(init.s("instructions").contains("confirm_action"))
        val names = tools(sim, token)
        val expected = listOf("list_my_businesses", "confirm_action", "cancel_action", "get_schedule", "get_stats", "block_time")
        assertTrue(names.containsAll(expected), names.toString())

        val mine = data(sim.call(token, "list_my_businesses"))["businesses"]!!.a.single().o
        assertEquals("owner", mine.s("role"))

        // Reads answer directly; the business may be left out when there is only one.
        val schedule = data(sim.call(token, "get_schedule", jsonObj("date" to "2026-10-07", "days" to 1)))
        assertEquals(clinic.slug, schedule.s("business"))
        assertTrue(schedule["data"].toString().contains("Jordan Casey"), schedule.toString())

        // Writes propose; nothing changes until confirm_action.
        val alex = clinic.resource("Alex")
        val proposed = data(
            sim.call(
                token, "block_time",
                jsonObj(
                    "business" to clinic.slug, "resourceId" to alex, "date" to "2026-10-09",
                    "reason" to "Training",
                ),
            ),
        )
        assertEquals("awaiting_confirmation", proposed.s("status"))
        assertTrue(proposed.s("next").contains("confirm_action"))
        assertEquals(0, overrides(alex))

        val confirmed = data(sim.call(token, "confirm_action", jsonObj("proposalId" to proposed.s("proposalId"))))
        assertEquals("confirmed", confirmed.s("status"))
        assertEquals(1, overrides(alex))
        // Audited as `ai`, through this app; confirming again returns the first result.
        val audited = Fixtures.sqlOne(
            "SELECT actor_type::text || ' ' || (summary->>'via') FROM audit_events WHERE action = 'availability.override_created' AND entity_id = ?::uuid",
            alex,
        ) { it.getString(1) }
        assertEquals("ai oauth:${sim.clientId}", audited)
        assertEquals("confirmed", data(sim.call(token, "confirm_action", jsonObj("proposalId" to proposed.s("proposalId")))).s("status"))
        assertEquals(1, overrides(alex))

        // A dropped proposal can't be confirmed later.
        val again = data(sim.call(token, "block_time", jsonObj("resourceId" to alex, "date" to "2026-10-12")))
        assertEquals("rejected", data(sim.call(token, "cancel_action", jsonObj("proposalId" to again.s("proposalId")))).s("status"))
        val late = sim.call(token, "confirm_action", jsonObj("proposalId" to again.s("proposalId")))
        assertTrue(isError(late) && text(late).contains("declined"), text(late))
        assertEquals(1, overrides(alex))
    }

    @Test
    fun `owners and admins have agents from the start, staff once the owner lets the whole team, and only owners decide`() =
        withApp { api ->
            val clinic = Fixtures.clinic(api)
            val roles = Roles.of(api, clinic)
            val business = api.get(clinic.base, clinic.owner.token).obj()
            assertEquals("admins", business.s("aiAgentsAccess"))
            assertEquals(0, business["aiAgentsAutoApprove"]!!.a.size)
            val day = jsonObj("date" to "2026-10-07", "days" to 1)

            for (member in listOf(clinic.owner, roles.admin)) {
                val sim = OAuthClientSim.business(api).register()
                assertFalse(isError(sim.call(sim.connect(member).s("access_token"), "get_schedule", day)))
            }

            // Staff are listed on the consent page (so they know to ask), but every call is refused.
            val sim = OAuthClientSim.business(api).register()
            val listed = sim.check(roles.staff, sim.authorizeParams()).obj()["businesses"]!!.a.single().o
            assertEquals("false", listed["aiAgentsAllowed"]!!.jsonPrimitive.content)
            val token = sim.connect(roles.staff).s("access_token")
            val refused = sim.call(token, "get_schedule", day)
            assertTrue(isError(refused) && text(refused).contains("only owners and admins"), text(refused))

            // Only an owner changes who may use agents, or what goes ahead without approval.
            suspend fun change(field: String, value: Any, member: TestUser) = api.patch(clinic.base, jsonOf(field to value), member.token)
            for (member in listOf(roles.admin, roles.staff)) {
                assertStatus(HttpStatusCode.Forbidden, change("aiAgentsAccess", "team", member))
                assertStatus(HttpStatusCode.Forbidden, change("aiAgentsAutoApprove", listOf("records"), member))
            }
            assertStatus(HttpStatusCode.BadRequest, change("aiAgentsAccess", "everyone", clinic.owner))
            assertStatus(HttpStatusCode.BadRequest, change("aiAgentsAutoApprove", listOf("all"), clinic.owner))
            assertStatus(HttpStatusCode.OK, change("aiAgentsAccess", "team", clinic.owner))
            assertFalse(isError(sim.call(token, "get_schedule", day)))

            // Off stops everyone's app, the owner's too.
            assertStatus(HttpStatusCode.OK, api.patch(clinic.base, jsonOf("aiAgentsAccess" to "off"), clinic.owner.token))
            val owner = OAuthClientSim.business(api).register()
            val off = owner.call(owner.connect(clinic.owner).s("access_token"), "get_schedule", day)
            assertTrue(isError(off) && text(off).contains("turned off"), text(off))
        }

    @Test
    fun `an app confirms only its own proposals, and Bo's confirm route can't decide them`() = withApp { api ->
        val clinic = Fixtures.allowAgents(api, Fixtures.clinic(api))
        val first = OAuthClientSim.business(api).register("First")
        val second = OAuthClientSim.business(api).register("Second")
        val a = first.connect(clinic.owner).s("access_token")
        val b = second.connect(clinic.owner).s("access_token")
        val id = data(first.call(a, "block_time", jsonObj("resourceId" to clinic.resource("Alex"), "date" to "2026-10-09"))).s("proposalId")

        val other = second.call(b, "confirm_action", jsonObj("proposalId" to id))
        assertTrue(isError(other) && text(other).startsWith("NOT_FOUND"), text(other))
        assertStatus(HttpStatusCode.NotFound, api.post("${clinic.base}/assistant/actions/$id/confirm", jsonOf(), clinic.owner.token))
        assertEquals(0, overrides(clinic.resource("Alex")))
    }

    @Test
    fun `staff get their role's tools and their own calendar, and a read-only connection can't propose`() = withApp { api ->
        val clinic = Fixtures.allowAgents(api, Fixtures.clinic(api))
        val roles = Roles.of(api, clinic)
        val sim = OAuthClientSim.business(api).register()
        val token = sim.connect(roles.staff).s("access_token")
        val names = tools(sim, token)
        assertTrue("get_schedule" in names && "block_time" in names)
        assertFalse("get_stats" in names || "close_date" in names || "update_service" in names, names.toString())

        // Only their own resource (Alex): someone else's calendar is refused.
        val blake = clinic.resource("Blake")
        val refused = sim.call(token, "block_time", jsonObj("resourceId" to blake, "date" to "2026-10-09"))
        assertTrue(isError(refused), text(refused))

        val reader = OAuthClientSim.business(api).register("Reader")
        val read = reader.connect(roles.staff, scope = "business:read").s("access_token")
        assertTrue(data(reader.call(read, "get_schedule", jsonObj("date" to "2026-10-07", "days" to 1))).s("summary").isNotEmpty())
        val res = reader.mcp(
            read, "tools/call",
            jsonObj("name" to "block_time", "arguments" to mapOf("resourceId" to clinic.resource("Alex"), "date" to "2026-10-09")),
        )
        assertEquals(HttpStatusCode.Forbidden, res.status)
        assertTrue(res.headers[HttpHeaders.WWWAuthenticate]!!.contains("insufficient_scope"))
    }

    @Test
    fun `with several businesses the app says which, and owners can turn connected apps off`() = withApp { api ->
        val clinic = Fixtures.allowAgents(api, Fixtures.clinic(api))
        val other = Fixtures.allowAgents(api, Fixtures.clinic(api, owner = clinic.owner))
        val sim = OAuthClientSim.business(api).register()
        val token = sim.connect(clinic.owner).s("access_token")

        val unnamed = sim.call(token, "get_schedule", jsonObj("date" to "2026-10-07", "days" to 1))
        assertTrue(isError(unnamed) && text(unnamed).contains("Say which business") && text(unnamed).contains(other.slug), text(unnamed))
        val stranger = Fixtures.clinic(api)
        val foreign = sim.call(token, "get_schedule", jsonObj("business" to stranger.slug, "date" to "2026-10-07", "days" to 1))
        assertTrue(isError(foreign) && text(foreign).contains("Not one of your businesses"), text(foreign))

        assertStatus(HttpStatusCode.OK, api.patch(other.base, jsonOf("aiAgentsAccess" to "off"), clinic.owner.token))
        val off = sim.call(token, "get_schedule", jsonObj("business" to other.slug, "date" to "2026-10-07", "days" to 1))
        assertTrue(isError(off) && text(off).startsWith("FORBIDDEN") && text(off).contains("turned off"), text(off))
        assertFalse(isError(sim.call(token, "get_schedule", jsonObj("business" to clinic.slug, "date" to "2026-10-07", "days" to 1))))
        val flags = data(sim.call(token, "list_my_businesses"))["businesses"]!!.a.associate {
            it.s("slug") to
                it.o["aiAgentsAllowed"]!!.jsonPrimitive.content
        }
        assertEquals(mapOf(clinic.slug to "true", other.slug to "false"), flags)
        assertEquals("off", api.get(other.base, clinic.owner.token).obj().s("aiAgentsAccess"))
    }

    @Test
    fun `tokens work only on the server they were issued for, and one app can be connected to both`() = withApp { api ->
        val clinic = Fixtures.allowAgents(api, Fixtures.clinic(api))
        val customerSim = OAuthClientSim(api).register("Both")
        val businessSim = customerSim.forBusiness()
        val customerToken = customerSim.connect(clinic.owner).s("access_token")
        val businessToken = businessSim.connect(clinic.owner).s("access_token")

        val wrongWay = businessSim.mcp(customerToken, "tools/list")
        assertEquals(HttpStatusCode.Unauthorized, wrongWay.status)
        assertTrue(wrongWay.headers[HttpHeaders.WWWAuthenticate]!!.contains("oauth-protected-resource/mcp/business"))
        assertEquals(HttpStatusCode.Unauthorized, customerSim.mcp(businessToken, "tools/list").status)

        // Both grants stay: connecting the business server didn't replace the customer one.
        assertEquals(HttpStatusCode.OK, customerSim.mcp(customerToken, "tools/list").status)
        val apps = api.get("/v1/me/connected-apps", clinic.owner.token).arr()
        assertEquals(setOf("customer", "business"), apps.map { it.s("audience") }.toSet())
    }

    @Test
    fun `someone in no business is told on the consent page, and the metadata describes the business server`() = withApp { api ->
        val sim = OAuthClientSim.business(api).register()
        val res = sim.check(TestUser.create("nobody", "No Business"), sim.authorizeParams())
        assertEquals(HttpStatusCode.Conflict, res.status, res.bodyAsText())
        assertTrue(res.bodyAsText().contains("aren't a member of a business"))

        val prm = api.get("/.well-known/oauth-protected-resource/mcp/business").obj()
        assertEquals("http://localhost:3000/mcp/business", prm.s("resource"))
        assertEquals(listOf("business:read", "business:write"), prm["scopes_supported"]!!.a.map { it.jsonPrimitive.content })
        val customer = api.get("/.well-known/oauth-protected-resource/mcp").obj()
        assertEquals(
            listOf("bookings:read", "bookings:write", "marketplace:read"),
            customer["scopes_supported"]!!.a.map {
                it.jsonPrimitive.content
            },
        )
        val unauthenticated = sim.mcp(null, "tools/list")
        assertEquals(HttpStatusCode.Unauthorized, unauthenticated.status)
        assertTrue(unauthenticated.headers[HttpHeaders.WWWAuthenticate]!!.contains("scope=\"business:read business:write\""))
    }

    @Test
    fun `switched off, the business server isn't served, advertised or authorized`() {
        val off = OAuthConfig.fromEnvironment(mapOf("BUSINESS_MCP_ENABLED" to "false")::get, "http://localhost:3000")
        val env = TestEnv(config = TestConfig.config().copy(oauth = off))
        withApp(env) { api ->
            val clinic = Fixtures.allowAgents(api, Fixtures.clinic(api))
            val sim = OAuthClientSim.business(api).register()
            assertEquals(HttpStatusCode.NotFound, sim.mcp("bat_x", "tools/list").status)
            assertEquals(HttpStatusCode.NotFound, api.get("/.well-known/oauth-protected-resource/mcp/business").status)
            val scopes = api.get("/.well-known/oauth-authorization-server").obj()["scopes_supported"]!!.a.map { it.jsonPrimitive.content }
            assertFalse(scopes.any { it.startsWith("business:") }, scopes.toString())
            val refused = sim.check(clinic.owner, sim.authorizeParams()).obj()
            assertTrue(refused.s("redirectTo").contains("error=invalid_target"), refused.toString())
            assertFalse(api.get(clinic.base, clinic.owner.token).obj()["aiAgentsAvailable"]!!.jsonPrimitive.content.toBoolean())
        }
    }
}
