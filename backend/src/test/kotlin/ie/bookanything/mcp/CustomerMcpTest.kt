package ie.bookanything.mcp

import ie.bookanything.oauth.jsonObj
import ie.bookanything.support.Fixtures
import ie.bookanything.support.MarketplaceFixtures
import ie.bookanything.support.OAuthClientSim
import ie.bookanything.support.OAuthClientSim.Companion.data
import ie.bookanything.support.OAuthClientSim.Companion.isError
import ie.bookanything.support.OAuthClientSim.Companion.text
import ie.bookanything.support.TestUser
import ie.bookanything.support.a
import ie.bookanything.support.arr
import ie.bookanything.support.assertStatus
import ie.bookanything.support.i
import ie.bookanything.support.jsonOf
import ie.bookanything.support.o
import ie.bookanything.support.s
import ie.bookanything.support.withApp
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class CustomerMcpTest {
    /** The user approves [proposalId] on bookanything, signed in; returns what the app then sees (get_proposal). */
    private suspend fun approve(
        api: ie.bookanything.support.Api, sim: OAuthClientSim, token: String, user: TestUser, proposalId: String,
    ): JsonObject {
        assertStatus(HttpStatusCode.OK, api.post("/v1/me/agent-requests/$proposalId/approve", jsonOf(), user.token))
        val outcome = data(sim.call(token, "get_proposal", jsonObj("proposalId" to proposalId)))
        assertEquals("confirmed", outcome.s("status"), outcome.toString())
        return outcome
    }

    @Test
    fun `a connected assistant finds, books, lists, moves and cancels as the signed-in customer`() = withApp { api ->
        val clinic = MarketplaceFixtures.listedClinic(api, MarketplaceFixtures.isolatedPoint())
        api.post(
            "${clinic.base}/offers",
            jsonOf(
                "name" to "Tuesday afternoons", "serviceIds" to listOf(clinic.service("Paid consult")),
                "discount" to mapOf("type" to "percent", "percent" to 20),
                "schedule" to mapOf("daysOfWeek" to listOf(2), "timeWindows" to listOf(mapOf("start" to "13:00", "end" to "17:00"))),
            ),
            clinic.owner.token,
        )
        val user = TestUser.create("customer", "Riley Customer")
        val sim = OAuthClientSim(api).register("Booking Assistant")
        val token = sim.connect(user).s("access_token")

        // MCP lifecycle over stateless Streamable HTTP.
        val init = sim.rpc(
            token, "initialize",
            jsonObj(
                "protocolVersion" to "2025-11-25", "capabilities" to emptyMap<String, String>(),
                "clientInfo" to mapOf("name" to "test", "version" to "1"),
            ),
        )
        assertEquals("2025-11-25", init.s("protocolVersion"))
        assertEquals("bookanything", init["serverInfo"]!!.o.s("name"))
        assertTrue(init.s("instructions").contains("approvalUrl"))
        val tools = sim.rpc(token, "tools/list")["tools"]!!.a.map { it.s("name") }
        assertEquals(
            listOf(
                "search_marketplace", "get_business", "check_availability", "book", "list_my_bookings", "get_next_appointment",
                "find_times_to_move", "get_payment_link", "reschedule_booking", "cancel_booking", "confirm_action", "cancel_action",
                "get_proposal",
            ),
            tools,
        )

        // Search → business → availability.
        val found = data(sim.call(token, "search_marketplace", jsonObj("query" to clinic.slug)))
        assertEquals(clinic.slug, found["items"]!!.a.single().o["business"]!!.o.s("slug"))
        val business = data(sim.call(token, "get_business", jsonObj("slug" to clinic.slug)))
        assertEquals("Tuesday afternoons", business["deals"]!!.a.single().s("name"))
        val consult = business["services"]!!.a.first { it.s("name") == "Consult" }.o
        val question = consult["questions"]!!.a.first { it.s("label") == "Reason for visit" }.s("id")
        val slots = data(
            sim.call(
                token, "check_availability",
                jsonObj("slug" to clinic.slug, "serviceId" to clinic.service("Paid consult"), "from" to "2026-10-06"),
            ),
        )
        val discounted = slots["days"]!!.a.single().o["slots"]!!.a.first { it.s("start") == "2026-10-06T14:00:00+01:00" }.o
        assertEquals(4000, discounted["offer"]!!.o.i("priceCents"))

        // A paid booking: prepared with the deal price, then approved by the user on bookanything, held for payment.
        val paidRequest = data(
            sim.call(
                token, "book",
                jsonObj("slug" to clinic.slug, "serviceId" to clinic.service("Paid consult"), "start" to "2026-10-06T14:00:00+01:00"),
            ),
        )
        assertEquals("awaiting_approval", paidRequest.s("status"))
        assertTrue(paidRequest["changes"].toString().contains("€40"), paidRequest.toString())
        assertTrue(data(sim.call(token, "list_my_bookings"))["bookings"]!!.a.isEmpty(), "nothing booked yet")
        val paid = approve(api, sim, token, user, paidRequest.s("proposalId"))
        val payUrl = paid["links"]!!.a.first { it.s("label") == "Pay now" }.s("url")
        assertTrue(payUrl.startsWith("http://localhost:3000/dev/checkout/"), payUrl)
        assertEquals(4000, paid["booking"]!!.o.i("priceCents"))
        assertEquals(5000, paid["booking"]!!.o.i("originalPriceCents"))
        // Approving again changes nothing: still the one booking.
        assertStatus(HttpStatusCode.OK, api.post("/v1/me/agent-requests/${paidRequest.s("proposalId")}/approve", jsonOf(), user.token))
        assertEquals(1, data(sim.call(token, "list_my_bookings"))["bookings"]!!.a.size)
        // The payment link again, e.g. when the first one was lost.
        val link = data(sim.call(token, "get_payment_link", jsonObj("bookingId" to paid["booking"]!!.o.s("id"))))
        assertEquals(payUrl, link.s("paymentUrl"))

        // A free booking, confirmed, answering the required question (refused up front without it).
        val missing = sim.call(
            token, "book", jsonObj("slug" to clinic.slug, "serviceId" to clinic.service("Consult"), "start" to "2026-10-07T10:00:00+01:00"),
        )
        assertTrue(isError(missing) && text(missing).startsWith("INVALID_REQUEST"), text(missing))
        val freeRequest = data(
            sim.call(
                token, "book",
                jsonObj(
                    "slug" to clinic.slug, "serviceId" to clinic.service("Consult"),
                    "start" to "2026-10-07T10:00:00+01:00", "answers" to mapOf(question to "Stiff neck"),
                ),
            ),
        )
        val free = approve(api, sim, token, user, freeRequest.s("proposalId"))
        assertEquals("confirmed", free["booking"]!!.o.s("status"))
        val freeId = free["booking"]!!.o.s("id")
        // Booked as this user, via the API, audited with the client.
        assertEquals("api", Fixtures.sqlOne("SELECT source::text FROM bookings WHERE id = ?", UUID.fromString(freeId)) { it.getString(1) })
        assertEquals(
            user.email,
            Fixtures.sqlOne(
                "SELECT c.email::text FROM bookings b JOIN customers c ON c.id = b.customer_id WHERE b.id = ?",
                UUID.fromString(freeId),
            ) { it.getString(1) },
        )
        val audit = Fixtures.sqlOne(
            "SELECT actor_type::text || ' ' || (summary->>'via') FROM audit_events WHERE entity_id = ? AND action = 'booking.created'",
            UUID.fromString(freeId),
        ) { it.getString(1) }
        assertEquals("api oauth:${sim.clientId}", audit)

        // Listing and the next appointment.
        val mine = data(sim.call(token, "list_my_bookings"))["bookings"]!!.a
        assertEquals(listOf(paid["booking"]!!.o.s("id"), freeId), mine.map { it.s("id") })
        assertEquals(paid["booking"]!!.o.s("id"), data(sim.call(token, "get_next_appointment"))["booking"]!!.o.s("id"))

        // Reschedule (customer rules).
        // The times this booking can move to (its own time isn't counted as taken), then the move.
        val movable = data(sim.call(token, "find_times_to_move", jsonObj("bookingId" to freeId, "from" to "2026-10-07")))
        val starts = movable["days"]!!.a.single().o["slots"]!!.a.map { it.s("start") }
        assertTrue("2026-10-07T11:00:00+01:00" in starts, starts.toString())
        val unknown = UUID.randomUUID().toString()
        val someoneElses = sim.call(token, "find_times_to_move", jsonObj("bookingId" to unknown, "from" to "2026-10-07"))
        assertTrue(isError(someoneElses) && text(someoneElses).startsWith("NOT_FOUND"), text(someoneElses))
        val move = data(sim.call(token, "reschedule_booking", jsonObj("bookingId" to freeId, "start" to "2026-10-07T11:00:00+01:00")))
        assertEquals("awaiting_approval", move.s("status"))
        assertEquals("2026-10-07T11:00:00+01:00", approve(api, sim, token, user, move.s("proposalId"))["booking"]!!.o.s("start"))

        // Cancel: the request shows the refund; nothing changes until the user approves it.
        val cancel = data(sim.call(token, "cancel_booking", jsonObj("bookingId" to freeId, "reason" to "Feeling better")))
        assertTrue(cancel["changes"].toString().contains("Refund"), cancel.toString())
        assertEquals("confirmed", data(sim.call(token, "list_my_bookings"))["bookings"]!!.a.first { it.s("id") == freeId }.s("status"))
        assertEquals("cancelled", approve(api, sim, token, user, cancel.s("proposalId"))["booking"]!!.o.s("status"))

        // Another customer's booking is not found; unknown arguments are rejected.
        val someoneElse = Fixtures.book(api, clinic, "Consult", "2026-10-08T10:00:00+01:00")["booking"]!!.o.s("id")
        val notMine = sim.call(token, "cancel_booking", jsonObj("bookingId" to someoneElse))
        assertTrue(isError(notMine) && text(notMine).startsWith("NOT_FOUND"), text(notMine))
        assertTrue(
            text(
                sim.call(
                    token, "reschedule_booking",
                    jsonObj("bookingId" to someoneElse, "start" to "2026-10-08T11:00:00+01:00"),
                ),
            ).startsWith("NOT_FOUND"),
        )
        val extra = sim.call(token, "list_my_bookings", jsonObj("status" to "upcoming", "includeOthers" to true))
        assertTrue(isError(extra) && text(extra).contains("includeOthers"), text(extra))
        assertEquals(
            JsonNull,
            data(
                sim.call(
                    OAuthClientSim(api).register().connect(TestUser.create("nobody")).s("access_token"),
                    "get_next_appointment",
                ),
            )["booking"],
        )
    }

    @Test
    fun `the assistant books paying at the venue when the service allows it`() = withApp { api ->
        val clinic = MarketplaceFixtures.listedClinic(api, MarketplaceFixtures.isolatedPoint())
        val customer = TestUser.create("customer")
        val token = OAuthClientSim(api).register().connect(customer).s("access_token")
        val sim = OAuthClientSim(api)
        val args = jsonObj(
            "slug" to clinic.slug, "serviceId" to clinic.service("Paid consult"), "start" to "2026-10-06T14:00:00+01:00",
            "payment" to "at_venue",
        )
        val refused = sim.call(token, "book", args)
        assertTrue(isError(refused) && text(refused).startsWith("INVALID_REQUEST"), text(refused))

        val service = api.get("${clinic.base}/services", clinic.owner.token).arr().single { it.s("name") == "Paid consult" }.o
        api.put(
            "${clinic.base}/services/${service.s("id")}",
            JsonObject(service + ("allowPayAtVenue" to JsonPrimitive(true))).toString(),
            clinic.owner.token,
        ).also { assertEquals(HttpStatusCode.OK, it.status) }
        // This customer lets their apps book once they say yes in the app: the app confirms it itself.
        assertStatus(HttpStatusCode.OK, api.patch("/v1/me/agent-settings", jsonOf("autoApprove" to listOf("bookings")), customer.token))
        val request = data(sim.call(token, "book", args))
        assertEquals("awaiting_confirmation", request.s("status"))
        val booked = data(sim.call(token, "confirm_action", jsonObj("proposalId" to request.s("proposalId"))))
        assertEquals("confirmed", booked.s("status"))
        assertTrue(booked["links"]!!.a.none { it.s("label") == "Pay now" })
        assertEquals("pay_at_venue", booked["booking"]!!.o.s("paymentStatus"))
    }

    @Test
    fun `customer availability and bookings use the customer's own group`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val user = TestUser.create("member")
        // The customer is a known "Members" customer of this business.
        api.post(
            "${clinic.base}/customers",
            jsonOf("name" to "Known Member", "email" to user.email, "phone" to null, "groupId" to clinic.groups.getValue("Members")),
            clinic.owner.token,
        )
        val token = OAuthClientSim(api).register().connect(user).s("access_token")
        val sim = OAuthClientSim(api)
        val members = sim.call(
            token, "check_availability",
            jsonObj("slug" to clinic.slug, "serviceId" to clinic.service("Members only"), "from" to "2026-10-06"),
        )
        assertTrue(data(members)["days"]!!.a.single().o["slots"]!!.a.isNotEmpty(), "members see the members-only service's times")
        val other = TestUser.create("guest")
        val guestToken = OAuthClientSim(api).register().connect(other).s("access_token")
        assertTrue(
            data(
                sim.call(
                    guestToken, "check_availability",
                    jsonObj(
                        "slug" to clinic.slug, "serviceId" to clinic.service("Members only"),
                        "from" to "2026-10-06",
                    ),
                ),
            )["days"]!!.a.single().o["slots"]!!.a.isEmpty(),
        )
        val groupArg = sim.call(
            guestToken, "check_availability",
            jsonObj(
                "slug" to clinic.slug, "serviceId" to clinic.service("Members only"),
                "from" to "2026-10-06", "groupId" to clinic.groups.getValue("Members"),
            ),
        )
        assertTrue(isError(groupArg), "the group comes from the account, not the assistant")
        assertEquals(HttpStatusCode.OK, sim.mcp(token, "tools/list").status)
    }
}
