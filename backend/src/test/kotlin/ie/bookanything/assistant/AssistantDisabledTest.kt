package ie.bookanything.assistant

import ie.bookanything.jobs.JobWorker
import ie.bookanything.oauth.jsonObj
import ie.bookanything.payments.aiCreditUses
import ie.bookanything.support.Api
import ie.bookanything.support.FakeModelClient
import ie.bookanything.support.Fixtures
import ie.bookanything.support.OAuthClientSim
import ie.bookanything.support.OAuthClientSim.Companion.data
import ie.bookanything.support.TestConfig
import ie.bookanything.support.TestEnv
import ie.bookanything.support.a
import ie.bookanything.support.assertStatus
import ie.bookanything.support.b
import ie.bookanything.support.jsonOf
import ie.bookanything.support.o
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.withApp
import io.ktor.client.statement.HttpResponse
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.jsonPrimitive
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The production default: Bo switched off (`ASSISTANT_ENABLED`). Its routes are absent, its nudges aren't refreshed and
 * nothing is metered for it, while the business MCP, which serves Bo's tools to members' own AI apps, works as before.
 */
class AssistantDisabledTest {
    /** A model is configured, so only the switch keeps Bo away. */
    private fun off(sites: Boolean = false) =
        TestEnv(config = TestConfig.config(assistant = false, sites = sites), modelClient = FakeModelClient())

    private fun aiUsageRows(businessId: String) =
        Fixtures.sqlOne("SELECT count(*) FROM ai_usage WHERE business_id = ?::uuid", businessId) { it.getInt(1) }

    @Test
    fun `every assistant route answers 404 as if it weren't there, and nothing is metered`() = withApp(off()) { api ->
        val clinic = Fixtures.clinic(api)
        val token = clinic.owner.token
        val base = "${clinic.base}/assistant"
        val id = UUID.randomUUID()
        val calls: Map<String, suspend () -> HttpResponse> = mapOf(
            "GET /assistant" to { api.get(base, token) },
            "GET /assistant/threads" to { api.get("$base/threads", token) },
            "POST /assistant/threads" to { api.post("$base/threads", null, token) },
            "GET /assistant/threads/{id}" to { api.get("$base/threads/$id", token) },
            "DELETE /assistant/threads/{id}" to { api.delete("$base/threads/$id", token) },
            "POST /assistant/threads/{id}/messages" to { api.post("$base/threads/$id/messages", jsonOf("text" to "Hello"), token) },
            "POST /assistant/actions/{id}/confirm" to { api.post("$base/actions/$id/confirm", null, token) },
            "POST /assistant/actions/{id}/reject" to { api.post("$base/actions/$id/reject", null, token) },
            "POST /assistant/nudges/{id}/dismiss" to { api.post("$base/nudges/$id/dismiss", null, token) },
            "GET /assistant/memory" to { api.get("$base/memory", token) },
            "POST /assistant/memory" to { api.post("$base/memory", jsonOf("text" to "Parking at the back"), token) },
            "PATCH /assistant/memory/{id}" to { api.patch("$base/memory/$id", jsonOf("text" to "Parking behind"), token) },
            "DELETE /assistant/memory/{id}" to { api.delete("$base/memory/$id", token) },
        )
        for ((route, call) in calls) assertEquals(HttpStatusCode.NotFound, call().status, route)
        // Not even for someone outside the business: there is nothing there to be refused.
        assertEquals(HttpStatusCode.NotFound, api.get(base, null).status)
        assertEquals(0, aiUsageRows(clinic.id))
    }

    @Test
    fun `the dashboard is told Bo isn't available, even with a model`() = withApp(off()) { api ->
        val clinic = Fixtures.clinic(api)
        assertFalse(api.get(clinic.base, clinic.owner.token).obj().b("assistantAvailable"))
        val patched = api.patch(clinic.base, """{"name":"Renamed Clinic"}""", clinic.owner.token)
        assertStatus(HttpStatusCode.OK, patched)
        assertFalse(patched.obj().b("assistantAvailable"))
    }

    @Test
    fun `switched on, Bo is available only with a model to run it`() {
        withApp(TestEnv(modelClient = FakeModelClient())) { api ->
            val clinic = Fixtures.clinic(api)
            assertTrue(api.get(clinic.base, clinic.owner.token).obj().b("assistantAvailable"))
            assertStatus(HttpStatusCode.OK, api.get("${clinic.base}/assistant", clinic.owner.token))
        }
        withApp(TestEnv()) { api ->
            val clinic = Fixtures.clinic(api)
            assertFalse(api.get(clinic.base, clinic.owner.token).obj().b("assistantAvailable"))
        }
    }

    @Test
    fun `the nudges task only runs while Bo is on`() {
        val off = off()
        withApp(off) { _ -> assertFalse(JobWorker(off.ctx).periodicTasks.any { it.name == "assistant-nudges" }) }
        val on = TestEnv()
        withApp(on) { _ -> assertTrue(JobWorker(on.ctx).periodicTasks.any { it.name == "assistant-nudges" }) }
    }

    @Test
    fun `members' own AI apps still read and change the business through the MCP, with approvals on bookanything`() =
        withApp(off()) { api ->
            val clinic = Fixtures.clinic(api)
            val sim = OAuthClientSim.business(api).register("Claude")
            val token = sim.connect(clinic.owner).s("access_token")
            val tools = sim.rpc(token, "tools/list")["tools"]!!.a.map { it.s("name") }
            assertTrue(tools.containsAll(listOf("get_schedule", "block_time", "confirm_action")), tools.toString())
            assertEquals(clinic.slug, data(sim.call(token, "get_schedule", jsonObj("date" to "2026-10-07", "days" to 1))).s("business"))

            val alex = clinic.resource("Alex")
            val proposed = data(sim.call(token, "block_time", jsonObj("resourceId" to alex, "date" to "2026-10-09")))
            assertEquals("awaiting_approval", proposed.s("status"))
            val id = proposed.s("proposalId")
            val listed = api.get("${clinic.base}/agent-requests", clinic.owner.token).obj()["items"]!!.a.single().o
            assertEquals(id, listed["action"]!!.o.s("id"))
            val approved = api.post("${clinic.base}/agent-requests/$id/approve", jsonOf(), clinic.owner.token)
            assertStatus(HttpStatusCode.OK, approved)
            assertEquals("confirmed", approved.obj()["action"]!!.o.s("status"))
            val blocks = Fixtures.sqlOne("SELECT count(*) FROM availability_overrides WHERE resource_id = ?::uuid", alex) { it.getInt(1) }
            assertEquals(1, blocks)
            assertTrue(api.get(clinic.base, clinic.owner.token).obj()["aiAgentsAvailable"]!!.jsonPrimitive.content.toBoolean())
            assertEquals(0, aiUsageRows(clinic.id))
        }

    @Test
    fun `plans list AI credits only for what uses them`() {
        assertEquals("Bo and the site builder", aiCreditUses(assistant = true, sites = true))
        assertEquals("Bo", aiCreditUses(assistant = true, sites = false))
        assertEquals("the site builder", aiCreditUses(assistant = false, sites = true))
        assertNull(aiCreditUses(assistant = false, sites = false))

        suspend fun creditLines(api: Api): List<String> {
            val clinic = Fixtures.clinic(api)
            return api.get("${clinic.base}/billing", clinic.owner.token).obj()["prices"]!!.a
                .flatMap { p -> p.o["features"]!!.a.map { it.jsonPrimitive.content } }
                .filter { "AI credits" in it }
        }
        withApp(off()) { api -> assertEquals(emptyList(), creditLines(api)) }
        withApp(off(sites = true)) { api -> assertTrue(creditLines(api).all { it.endsWith("AI credits a month for the site builder") }) }
        withApp(TestEnv(modelClient = FakeModelClient())) { api ->
            val lines = creditLines(api)
            assertEquals(3, lines.size)
            assertTrue(lines.all { it.endsWith("AI credits a month for Bo and the site builder") }, lines.toString())
        }
    }
}
