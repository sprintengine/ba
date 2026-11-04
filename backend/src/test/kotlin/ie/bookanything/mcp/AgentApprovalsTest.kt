package ie.bookanything.mcp

import ie.bookanything.oauth.jsonObj
import ie.bookanything.support.Api
import ie.bookanything.support.Clinic
import ie.bookanything.support.Fixtures
import ie.bookanything.support.OAuthClientSim
import ie.bookanything.support.OAuthClientSim.Companion.data
import ie.bookanything.support.OAuthClientSim.Companion.isError
import ie.bookanything.support.OAuthClientSim.Companion.text
import ie.bookanything.support.Roles
import ie.bookanything.support.TestUser
import ie.bookanything.support.a
import ie.bookanything.support.arr
import ie.bookanything.support.assertStatus
import ie.bookanything.support.jsonOf
import ie.bookanything.support.o
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.withApp
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Approvals (section 20.8): a change a member's AI app proposes goes ahead only when the member approves it on
 * bookanything, signed in; an owner can let kinds of single change go ahead once the app confirms them.
 */
class AgentApprovalsTest {
    private fun overrides(resourceId: String) =
        Fixtures.sqlOne("SELECT count(*) FROM availability_overrides WHERE resource_id = ?::uuid", resourceId) { it.getInt(1) }

    private class Connected(val sim: OAuthClientSim, val token: String) {
        suspend fun call(tool: String, vararg args: Pair<String, Any?>): JsonObject = sim.call(token, tool, jsonObj(*args))

        suspend fun ok(tool: String, vararg args: Pair<String, Any?>): JsonObject {
            val res = call(tool, *args)
            assertFalse(isError(res), "$tool: ${text(res)}")
            return data(res)
        }
    }

    private suspend fun connect(api: Api, user: TestUser, name: String = "Claude"): Connected {
        val sim = OAuthClientSim.business(api).register(name)
        return Connected(sim, sim.connect(user).s("access_token"))
    }

    private fun absent(value: JsonElement?) = value == null || value is JsonNull

    private fun requests(clinic: Clinic) = "${clinic.base}/agent-requests"

    @Test
    fun `by default every change waits for the member to approve it on bookanything`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val owner = connect(api, clinic.owner)
        val alex = clinic.resource("Alex")

        val proposed = owner.ok("block_time", "resourceId" to alex, "date" to "2026-10-09", "reason" to "Training")
        val id = proposed.s("proposalId")
        assertEquals("awaiting_approval", proposed.s("status"))
        assertEquals("http://localhost:3000/dashboard/${clinic.slug}/approvals/$id", proposed.s("approvalUrl"))
        assertTrue(proposed.s("next").contains("approvalUrl"))

        // The app can't make it happen: confirming leaves it waiting, with the link to give the member.
        val waiting = owner.ok("confirm_action", "proposalId" to id)
        assertEquals("awaiting_approval", waiting.s("status"))
        assertEquals(proposed.s("approvalUrl"), waiting.s("approvalUrl"))
        assertEquals(0, overrides(alex))
        // Nor can its access token approve it: it is only valid at the MCP.
        assertStatus(HttpStatusCode.Unauthorized, api.post("${requests(clinic)}/$id/approve", jsonOf(), owner.token))

        // The member sees it, with the app's name, and approves it while signed in.
        val listed = api.get(requests(clinic), clinic.owner.token).obj()["items"]!!.a.single().o
        assertEquals("Claude", listed.s("app"))
        assertEquals("true", listed["needsApproval"]!!.jsonPrimitive.content)
        assertEquals("pending", listed["action"]!!.o.s("status"))
        assertEquals("Block time", listed["action"]!!.o["proposal"]!!.o.s("title"))
        assertTrue(listed["action"]!!.o["proposal"].toString().contains("Training"))
        val approved = api.post("${requests(clinic)}/$id/approve", jsonOf(), clinic.owner.token).obj()
        assertEquals("confirmed", approved["action"]!!.o.s("status"))
        assertEquals(1, overrides(alex))

        // The app sees what happened; approving again changes nothing.
        val done = owner.ok("get_proposal", "proposalId" to id)
        assertEquals("confirmed", done.s("status"))
        assertTrue(absent(done["approvalUrl"]), done.toString())
        assertEquals("confirmed", api.post("${requests(clinic)}/$id/approve", jsonOf(), clinic.owner.token).obj()["action"]!!.o.s("status"))
        assertEquals(1, overrides(alex))

        // Audited as AI through the app, approved by the member.
        val audit = Fixtures.sqlOne(
            "SELECT actor_type::text || ' ' || (summary->>'via') || ' ' || (summary->>'approvedBy') FROM audit_events " +
                "WHERE action = 'assistant.action_confirmed' AND entity_id = ?::uuid",
            id,
        ) { it.getString(1) }
        assertEquals("ai oauth:${owner.sim.clientId} member", audit)
    }

    @Test
    fun `a declined request never happens, and only the member who asked can see or decide it`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val roles = Roles.of(api, clinic)
        val admin = connect(api, roles.admin)
        val alex = clinic.resource("Alex")
        val id = admin.ok("block_time", "resourceId" to alex, "date" to "2026-10-09").s("proposalId")

        // Someone else in the business (even the owner) can't see or decide it.
        assertTrue(api.get(requests(clinic), clinic.owner.token).obj()["items"]!!.a.isEmpty())
        assertStatus(HttpStatusCode.NotFound, api.get("${requests(clinic)}/$id", clinic.owner.token))
        assertStatus(HttpStatusCode.NotFound, api.post("${requests(clinic)}/$id/approve", jsonOf(), clinic.owner.token))
        // Nor can Bo's confirm route.
        assertStatus(HttpStatusCode.NotFound, api.post("${clinic.base}/assistant/actions/$id/confirm", jsonOf(), roles.admin.token))

        val declined = api.post("${requests(clinic)}/$id/decline", jsonOf(), roles.admin.token).obj()
        assertEquals("rejected", declined["action"]!!.o.s("status"))
        assertEquals("rejected", admin.ok("get_proposal", "proposalId" to id).s("status"))
        val late = admin.call("confirm_action", "proposalId" to id)
        assertTrue(isError(late) && text(late).contains("declined"), text(late))
        assertStatus(HttpStatusCode.Conflict, api.post("${requests(clinic)}/$id/approve", jsonOf(), roles.admin.token))
        assertEquals(0, overrides(alex))
    }

    @Test
    fun `an owner lets kinds of single change go ahead once the app confirms, but never several at once`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        assertStatus(
            HttpStatusCode.OK,
            api.patch(clinic.base, jsonOf("aiAgentsAutoApprove" to listOf("time_off", "bookings")), clinic.owner.token),
        )
        val owner = connect(api, clinic.owner)
        val alex = clinic.resource("Alex")

        val single = owner.ok("block_time", "resourceId" to alex, "date" to "2026-10-09")
        assertEquals("awaiting_confirmation", single.s("status"))
        assertTrue(absent(single["approvalUrl"]), single.toString())
        assertEquals("confirmed", owner.ok("confirm_action", "proposalId" to single.s("proposalId")).s("status"))
        assertEquals(1, overrides(alex))

        // Approving several requests at once is a bulk change: it waits for the member even though bookings are allowed.
        val first = Fixtures.book(api, clinic, "Approval consult", "2026-10-05T11:00:00+01:00")["booking"]!!.o.s("id")
        val second = Fixtures.book(api, clinic, "Approval consult", "2026-10-06T11:00:00+01:00")["booking"]!!.o.s("id")
        val bulk = owner.ok("approve_bookings", "bookingIds" to listOf(first, second))
        assertEquals("awaiting_approval", bulk.s("status"))
        assertEquals("awaiting_approval", owner.ok("confirm_action", "proposalId" to bulk.s("proposalId")).s("status"))
        // A kind the owner didn't allow waits too.
        val notes = owner.ok("update_booking_notes", "bookingId" to first, "internalNotes" to "VIP")
        assertEquals("awaiting_approval", notes.s("status"))

        // Rules tightened after a proposal apply when the app confirms it.
        val later = owner.ok("block_time", "resourceId" to alex, "date" to "2026-10-12").s("proposalId")
        assertStatus(HttpStatusCode.OK, api.patch(clinic.base, jsonOf("aiAgentsAutoApprove" to emptyList<String>()), clinic.owner.token))
        assertEquals("awaiting_approval", owner.ok("confirm_action", "proposalId" to later).s("status"))
        assertEquals(1, overrides(alex))
    }

    @Test
    fun `the member approves what will happen now, so a change that moved on since is shown again first`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        Roles.of(api, clinic) // Jordan Casey has booked
        val owner = connect(api, clinic.owner)
        val customer = owner.ok("find_customers", "query" to "Jordan")["data"]!!.o["customers"]!!.a.first().o.s("id")
        val id = owner.ok("update_customer", "customerId" to customer, "notes" to "Prefers mornings").s("proposalId")

        // Someone edits the record in the dashboard meanwhile: approving refuses, and the page shows it as it is now.
        assertStatus(
            HttpStatusCode.OK,
            api.patch("${clinic.base}/customers/$customer", jsonOf("notes" to "Allergic to latex"), clinic.owner.token),
        )
        assertStatus(HttpStatusCode.Conflict, api.post("${requests(clinic)}/$id/approve", jsonOf(), clinic.owner.token))
        val shown = api.get("${requests(clinic)}/$id", clinic.owner.token).obj()["action"]!!.o["proposal"].toString()
        assertTrue(shown.contains("Allergic to latex"), shown)

        assertEquals("confirmed", api.post("${requests(clinic)}/$id/approve", jsonOf(), clinic.owner.token).obj()["action"]!!.o.s("status"))
        val notes = Fixtures.sqlOne("SELECT notes FROM customers WHERE id = ?::uuid", customer) { it.getString(1) }
        assertEquals("Prefers mornings", notes)
    }

    @Test
    fun `a disconnected app's requests can't be approved, nor can one where agents were switched off since`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val owner = connect(api, clinic.owner)
        val alex = clinic.resource("Alex")
        val first = owner.ok("block_time", "resourceId" to alex, "date" to "2026-10-09").s("proposalId")
        val second = owner.ok("block_time", "resourceId" to alex, "date" to "2026-10-10").s("proposalId")

        assertStatus(HttpStatusCode.OK, api.patch(clinic.base, jsonOf("aiAgentsAccess" to "off"), clinic.owner.token))
        assertStatus(HttpStatusCode.Forbidden, api.post("${requests(clinic)}/$first/approve", jsonOf(), clinic.owner.token))
        assertStatus(HttpStatusCode.OK, api.patch(clinic.base, jsonOf("aiAgentsAccess" to "admins"), clinic.owner.token))

        val app = api.get("/v1/me/connected-apps", clinic.owner.token).arr().single { it.s("clientId") == owner.sim.clientId }
        assertStatus(HttpStatusCode.NoContent, api.delete("/v1/me/connected-apps/${app.s("id")}", clinic.owner.token))
        val listed = api.get("${requests(clinic)}/$second", clinic.owner.token).obj()
        assertEquals("true", listed["appDisconnected"]!!.jsonPrimitive.content)
        assertStatus(HttpStatusCode.Conflict, api.post("${requests(clinic)}/$second/approve", jsonOf(), clinic.owner.token))
        // Declining still works, to clear it away.
        assertStatus(HttpStatusCode.OK, api.post("${requests(clinic)}/$second/decline", jsonOf(), clinic.owner.token))
        assertEquals(0, overrides(alex))
    }
}
