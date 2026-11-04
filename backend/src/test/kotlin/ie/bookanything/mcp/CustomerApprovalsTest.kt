package ie.bookanything.mcp

import ie.bookanything.oauth.jsonObj
import ie.bookanything.support.MarketplaceFixtures
import ie.bookanything.support.OAuthClientSim
import ie.bookanything.support.OAuthClientSim.Companion.data
import ie.bookanything.support.OAuthClientSim.Companion.isError
import ie.bookanything.support.OAuthClientSim.Companion.text
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
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** A customer's AI app only asks; the customer approves on bookanything, signed in (section 20.8). */
class CustomerApprovalsTest {
    private suspend fun bookings(api: ie.bookanything.support.Api, user: TestUser) =
        api.get("/v1/me/bookings", user.token).obj().let { it["upcoming"]!!.a.size + it["past"]!!.a.size }

    @Test
    fun `the customer is told, sees it on bookanything, and decides it there, which the app can't`() = withApp { api ->
        val clinic = MarketplaceFixtures.listedClinic(api, MarketplaceFixtures.isolatedPoint())
        val user = TestUser.create("customer", "Riley Customer")
        val sim = OAuthClientSim(api).register("Claude")
        val token = sim.connect(user).s("access_token")
        val args = jsonObj("slug" to clinic.slug, "serviceId" to clinic.service("Paid consult"), "start" to "2026-10-06T14:00:00+01:00")

        val request = data(sim.call(token, "book", args))
        val id = request.s("proposalId")
        assertEquals("http://localhost:3000/my/approvals/$id", request.s("approvalUrl"))
        // Confirming from the app leaves it waiting; its token can't approve it on the website.
        assertEquals("awaiting_approval", data(sim.call(token, "confirm_action", jsonObj("proposalId" to id))).s("status"))
        assertStatus(HttpStatusCode.Unauthorized, api.post("/v1/me/agent-requests/$id/approve", jsonOf(), token))
        assertEquals(0, bookings(api, user))

        // In the bell, linking to the approval page.
        val n = api.get("/v1/me/notifications", user.token).obj()["items"]!!.a.single().o
        assertEquals("agent_approval", n.s("kind"))
        assertEquals("/my/approvals/$id", n.s("link"))
        assertTrue(n.s("title").startsWith("Claude wants to: Book Paid consult"), n.s("title"))

        // Listed on their approvals page; nobody else's.
        val listed = api.get("/v1/me/agent-requests", user.token).obj()["items"]!!.a.single().o
        assertEquals("Claude", listed.s("app"))
        assertEquals(clinic.slug, listed["business"]!!.o.s("slug"))
        assertEquals("pending", listed["action"]!!.o.s("status"))
        val stranger = TestUser.create("stranger")
        assertStatus(HttpStatusCode.NotFound, api.get("/v1/me/agent-requests/$id", stranger.token))
        assertStatus(HttpStatusCode.NotFound, api.post("/v1/me/agent-requests/$id/approve", jsonOf(), stranger.token))

        // Declined: never happens, and the bell clears.
        assertEquals("rejected", api.post("/v1/me/agent-requests/$id/decline", jsonOf(), user.token).obj()["action"]!!.o.s("status"))
        assertEquals("rejected", data(sim.call(token, "get_proposal", jsonObj("proposalId" to id))).s("status"))
        assertStatus(HttpStatusCode.Conflict, api.post("/v1/me/agent-requests/$id/approve", jsonOf(), user.token))
        assertEquals(0, api.get("/v1/me/notifications", user.token).obj()["unreadCount"]!!.jsonPrimitive.content.toInt())
        assertEquals(0, bookings(api, user))

        // Another app of theirs can't see it.
        val other = OAuthClientSim(api).register("Other")
        val otherToken = other.connect(user).s("access_token")
        val peek = other.call(otherToken, "get_proposal", jsonObj("proposalId" to id))
        assertTrue(isError(peek) && text(peek).startsWith("NOT_FOUND"), text(peek))
    }

    @Test
    fun `a disconnected app's requests can't be approved, and customers choose what goes ahead without them`() = withApp { api ->
        val clinic = MarketplaceFixtures.listedClinic(api, MarketplaceFixtures.isolatedPoint())
        val user = TestUser.create("customer", "Riley Customer")
        val sim = OAuthClientSim(api).register("Claude")
        val token = sim.connect(user).s("access_token")
        val args = jsonObj("slug" to clinic.slug, "serviceId" to clinic.service("Paid consult"), "start" to "2026-10-06T14:00:00+01:00")
        val id = data(sim.call(token, "book", args)).s("proposalId")

        assertTrue(api.get("/v1/me/agent-settings", user.token).obj()["autoApprove"]!!.a.isEmpty())
        suspend fun allow(vararg kinds: String) = api.patch("/v1/me/agent-settings", jsonOf("autoApprove" to kinds.toList()), user.token)
        assertStatus(HttpStatusCode.BadRequest, allow("everything"))
        assertStatus(HttpStatusCode.OK, allow("cancellations"))
        // Cancellations go ahead once the app confirms; bookings still wait.
        assertEquals("awaiting_approval", data(sim.call(token, "book", args)).s("status"))

        val app = api.get("/v1/me/connected-apps", user.token).arr().single { it.s("clientId") == sim.clientId }
        assertStatus(HttpStatusCode.NoContent, api.delete("/v1/me/connected-apps/${app.s("id")}", user.token))
        assertEquals("true", api.get("/v1/me/agent-requests/$id", user.token).obj()["appDisconnected"]!!.jsonPrimitive.content)
        assertStatus(HttpStatusCode.Conflict, api.post("/v1/me/agent-requests/$id/approve", jsonOf(), user.token))
        assertEquals(0, bookings(api, user))
    }
}
