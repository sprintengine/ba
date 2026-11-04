package ie.bookanything.assistant

import ie.bookanything.ai.ChatBlock
import ie.bookanything.assistant.tools.CreateBooking
import ie.bookanything.assistant.tools.Execution
import ie.bookanything.assistant.tools.ToolContexts
import ie.bookanything.assistant.tools.ToolInputs
import ie.bookanything.audit.Actor
import ie.bookanything.http.ApiException
import ie.bookanything.support.Bo
import ie.bookanything.support.FakeModelClient
import ie.bookanything.support.Fixtures
import ie.bookanything.support.MutableClock
import ie.bookanything.support.Roles
import ie.bookanything.support.TestCredits
import ie.bookanything.support.TestEnv
import ie.bookanything.support.a
import ie.bookanything.support.access
import ie.bookanything.support.arr
import ie.bookanything.support.assertError
import ie.bookanything.support.assertStatus
import ie.bookanything.support.jsonOf
import ie.bookanything.support.o
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.withApp
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** Who can reach Bo's routes, and what staff can see and do through it. */
class AssistantAccessTest {
    private val model = FakeModelClient()
    private val env = TestEnv(clock = MutableClock(ie.bookanything.support.DEFAULT_NOW), modelClient = model)

    @Test
    fun `every assistant route with every kind of caller`() = withApp(env) { api ->
        val clinic = Fixtures.clinic(api)
        val roles = Roles.of(api, clinic)
        model.script(
            """{"rules": [
            {"match": ["remember"], "steps": [{"tools": [{"name": "update_memory", "input": {"action": "add", "memoryId": null, "text": "Parking at the back"}}]}, {"text": "Ready."}]},
            {"match": ["*"], "steps": [{"text": "Hi."}]}
        ]}""",
        )
        val base = "${clinic.base}/assistant"
        val members = setOf(roles.owner.token, roles.admin.token, roles.staff.token)
        val ownerThread = Bo.thread(api, clinic, roles.owner.token)

        /** Members use a thread of their own; outsiders try the owner's. */
        suspend fun threadFor(token: String?) = if (token in members) Bo.thread(api, clinic, token!!) else ownerThread

        Roles.check(roles, "GET /assistant", "staff", HttpStatusCode.OK) { t -> api.get(base, t) }
        Roles.check(roles, "GET /assistant/threads", "staff", HttpStatusCode.OK) { t -> api.get("$base/threads", t) }
        Roles.check(roles, "POST /assistant/threads", "staff", HttpStatusCode.Created) { t -> api.post("$base/threads", null, t) }
        Roles.check(roles, "GET /assistant/threads/{id}", "staff", HttpStatusCode.OK) { t -> api.get("$base/threads/${threadFor(t)}", t) }
        Roles.check(roles, "POST /assistant/threads/{id}/messages", "staff", HttpStatusCode.OK) { t ->
            api.post("$base/threads/${threadFor(t)}/messages", jsonOf("text" to "Hello"), t)
        }
        Roles.check(
            roles, "DELETE /assistant/threads/{id}", "staff", HttpStatusCode.NoContent,
        ) { t -> api.delete("$base/threads/${threadFor(t)}", t) }
        Roles.check(roles, "GET /assistant/memory", "staff", HttpStatusCode.OK) { t -> api.get("$base/memory", t) }
        Roles.check(roles, "POST /assistant/memory", "admin", HttpStatusCode.Created) { t ->
            api.post("$base/memory", jsonOf("text" to "Parking at the back"), t)
        }
        val entries = api.get("$base/memory", roles.owner.token).arr().map { it.s("id") }
        Roles.check(roles, "PATCH /assistant/memory/{id}", "admin", HttpStatusCode.OK) { t ->
            api.patch("$base/memory/${entries.first()}", jsonOf("text" to "Parking behind"), t)
        }
        Roles.check(roles, "DELETE /assistant/memory/{id}", "admin", HttpStatusCode.NoContent) { t ->
            api.post(
                "$base/memory", jsonOf("text" to "Temporary"), roles.owner.token,
            ).obj().s("id").let { api.delete("$base/memory/$it", t) }
        }
        Roles.check(roles, "POST /assistant/nudges/{id}/dismiss", "admin", HttpStatusCode.NoContent) { t ->
            val id = Fixtures.sqlOne(
                "SELECT id::text FROM assistant_nudges WHERE business_id = ? AND dismissed_at IS NULL LIMIT 1", clinic.id,
            ) { it.getString(1) }
                ?: Fixtures.sqlOne(
                    "INSERT INTO assistant_nudges (business_id, key, kind, payload) VALUES (?, ?, 'site_not_published', '{}') RETURNING " +
                        "id::text",
                    UUID.fromString(clinic.id), "probe-${UUID.randomUUID()}",
                ) { it.getString(1) }!!
            api.post("$base/nudges/$id/dismiss", null, t)
        }
        // Proposals: only the member who asked may confirm or reject (anyone else: 404).
        for (route in listOf("confirm", "reject")) {
            val events = Bo.send(api, clinic, roles.owner.token, Bo.thread(api, clinic, roles.owner.token), "Please remember this")
            val action = events.single { it.type == "proposal" }.data["action"]!!.o.s("id")
            for ((who, token) in roles.all.drop(1)) {
                val want = if (who == "anonymous") HttpStatusCode.Unauthorized else HttpStatusCode.NotFound
                assertEquals(want, api.post("$base/actions/$action/$route", null, token).status, "$route as $who")
            }
            assertStatus(HttpStatusCode.OK, api.post("$base/actions/$action/$route", null, roles.owner.token))
        }
    }

    @Test
    fun `threads, proposals and memory edits are scoped`() = withApp(env) { api ->
        val clinic = Fixtures.clinic(api)
        val roles = Roles.of(api, clinic)
        val base = "${clinic.base}/assistant"
        val ownerThread = Bo.thread(api, clinic, roles.owner.token)
        // Conversations are private to the member who started them.
        for ((who, token) in roles.all.drop(1)) {
            val res = api.get("$base/threads/$ownerThread", token)
            val want = if (who == "anonymous") HttpStatusCode.Unauthorized else HttpStatusCode.NotFound
            assertEquals(want, res.status, "GET another member's thread as $who")
        }
        assertStatus(HttpStatusCode.OK, api.get("$base/threads/$ownerThread", roles.owner.token))
        assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.delete("$base/threads/$ownerThread", roles.admin.token))
        assertStatus(HttpStatusCode.NoContent, api.delete("$base/threads/$ownerThread", roles.owner.token))
        assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.get("$base/threads/$ownerThread", roles.owner.token))

        // Memory: admins edit, staff read; ids from another business are not found.
        val entry = api.post("$base/memory", jsonOf("text" to "We close early on Fridays"), roles.admin.token).obj()
        assertEquals(listOf("We close early on Fridays"), api.get("$base/memory", roles.staff.token).arr().map { it.s("text") })
        assertError(
            HttpStatusCode.Forbidden, "FORBIDDEN", api.patch("$base/memory/${entry.s("id")}", jsonOf("text" to "x"), roles.staff.token),
        )
        assertStatus(
            HttpStatusCode.OK,
            api.patch("$base/memory/${entry.s("id")}", jsonOf("text" to "We close at 2pm on Fridays"), roles.owner.token),
        )
        val other = Fixtures.clinic(api, owner = roles.otherOwner)
        assertError(
            HttpStatusCode.NotFound, "NOT_FOUND", api.delete("${other.base}/assistant/memory/${entry.s("id")}", roles.otherOwner.token),
        )
        assertError(
            HttpStatusCode.BadRequest, "INVALID_REQUEST", api.post("$base/memory", jsonOf("text" to "x".repeat(281)), roles.owner.token),
        )
        assertStatus(HttpStatusCode.NoContent, api.delete("$base/memory/${entry.s("id")}", roles.owner.token))

        // Nudges are for owners and admins.
        val nudges = api.get(base, roles.owner.token).obj()["nudges"]!!.a
        assertTrue(nudges.isNotEmpty())
        assertEquals(0, api.get(base, roles.staff.token).obj()["nudges"]!!.a.size)
        val nudge = nudges.first().s("id")
        assertError(HttpStatusCode.Forbidden, "FORBIDDEN", api.post("$base/nudges/$nudge/dismiss", null, roles.staff.token))
        assertError(
            HttpStatusCode.NotFound, "NOT_FOUND", api.post("${other.base}/assistant/nudges/$nudge/dismiss", null, roles.otherOwner.token),
        )
        assertStatus(HttpStatusCode.NoContent, api.post("$base/nudges/$nudge/dismiss", null, roles.admin.token))
        assertFalse(api.get(base, roles.owner.token).obj()["nudges"]!!.a.any { it.s("id") == nudge })
    }

    @Test
    fun `staff only see and change their own calendar through Bo`() = withApp(env) { api ->
        val clinic = Fixtures.clinic(api)
        val staff = Roles.member(api, clinic, "staff", "Alex")
        Fixtures.book(
            api, clinic, "Consult", "2026-10-05T11:00:00+01:00", resourceId = clinic.resource("Alex"), email = "alex.patient@example.test",
        )
        Fixtures.book(
            api, clinic, "Consult", "2026-10-05T14:00:00+01:00", resourceId = clinic.resource("Blake"),
            email = "blake.patient@example.test",
        )
        model.script(
            """{"rules": [
            {"match": ["today"], "steps": [
                {"tools": [{"name": "get_schedule", "input": {"date": "${'$'}{today}", "days": 1, "resourceId": null}},
                           {"name": "find_customers", "input": {"query": "patient"}}]},
                {"text": "Done."}]},
            {"match": ["blake"], "steps": [
                {"tools": [{"name": "create_booking", "input": {"serviceId": "${clinic.service("Consult")}", "optionId": null,
                    "start": "2026-10-06T15:00:00+01:00", "resourceIds": ["${clinic.resource("Blake")}", "${clinic.resource("Room")}"], "customerId": null,
                    "newCustomer": {"name": "Robin Example", "email": null, "phone": null}, "paymentMode": "at_venue", "notifyCustomer": false, "internalNotes": null}},
                    {"name": "block_time", "input": {"resourceId": "${clinic.resource("Blake")}", "date": "2026-10-06", "startTime": null, "endTime": null, "reason": null}},
                    {"name": "close_date", "input": {"date": "2026-10-06", "reason": "Training"}}]},
                {"text": "Done."}]}
        ]}""",
        )
        val thread = Bo.thread(api, clinic, staff.token)
        Bo.send(api, clinic, staff.token, thread, "What's on today?")
        val results = model.conversations.last().messages.last().blocks.filterIsInstance<ChatBlock.ToolResult>()
        assertTrue(
            results[0].content.contains("\"name\":\"Alex\"") && !results[0].content.contains("\"name\":\"Blake\""),
            "schedule: own bookings only",
        )
        assertTrue(
            results[1].content.contains("alex.patient") && !results[1].content.contains("blake.patient"), "customers: own customers only",
        )
        // Admin-only tools are never offered to staff.
        val offered = model.conversations.last().tools.map { it.name }.toSet()
        assertTrue(listOf("close_date", "get_stats", "update_service", "update_memory").none { it in offered })
        assertTrue(listOf("get_schedule", "create_booking", "block_time", "update_opening_hours").all { it in offered })

        val events = Bo.send(api, clinic, staff.token, thread, "Book Robin with Blake")
        val statuses = events.filter { it.type == "tool" }.map { it.data["tool"]!!.o }.filter { it.s("status") != "running" }.map {
            "${it.s("name")}:${it.s("status")}"
        }
        assertEquals(listOf("create_booking:error", "block_time:error", "close_date:error"), statuses)
        val errors = model.conversations.last().messages.last().blocks.filterIsInstance<ChatBlock.ToolResult>().map { it.content }
        assertTrue(
            errors[0].contains("FORBIDDEN") && errors[1].contains("FORBIDDEN") && errors[2].contains("UNAVAILABLE"), errors.toString(),
        )
        assertEquals(
            0L,
            Fixtures.sqlOne("SELECT count(*) FROM assistant_actions WHERE business_id = ?", UUID.fromString(clinic.id)) { it.getLong(1) },
        )
    }

    @Test
    fun `staff can't book a customer they can't see, neither on the card nor on confirming`() = withApp(env) { api ->
        val clinic = Fixtures.clinic(api)
        val staff = Roles.member(api, clinic, "staff", "Alex")
        Fixtures.book(
            api, clinic, "Consult", "2026-10-05T14:00:00+01:00", resourceId = clinic.resource("Blake"),
            email = "blake.patient@example.test",
        )
        val hidden = Fixtures.sqlOne(
            "SELECT id::text FROM customers WHERE business_id = ? AND email = 'blake.patient@example.test'", UUID.fromString(clinic.id),
        ) { it.getString(1) }
        val input = Json.parseToJsonElement(
            """{"serviceId": "${clinic.service("Consult")}", "optionId": null, "start": "2026-10-06T10:00:00+01:00",
                "resourceIds": null, "customerId": "$hidden",
                "newCustomer": null, "paymentMode": "at_venue", "notifyCustomer": false, "internalNotes": null}""",
        ).jsonObject
        val access = env.access(staff, clinic.id)
        val ctx = ToolContexts(env.db, env.clock, env.ctx.booking, env.ctx.payments).forMember(access)
        assertEquals("NOT_FOUND", assertFailsWith<ApiException> { ToolInputs.propose(CreateBooking, ctx, input) }.code)
        val refused = assertFailsWith<ApiException> {
            env.db.txBlocking(access.businessId) { conn ->
                ToolInputs.execute(CreateBooking, ctx, Execution(conn, UUID.randomUUID(), Actor.ai(access.user.id)), input)
            }
        }
        assertEquals("NOT_FOUND", refused.code)
        assertEquals(
            1L, Fixtures.sqlOne("SELECT count(*) FROM bookings WHERE customer_id = ?", UUID.fromString(hidden)) { it.getLong(1) },
        )
    }

    @Test
    fun `without a model Bo still opens with nudges, but cannot chat`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val state = api.get("${clinic.base}/assistant", clinic.owner.token).obj()
        assertEquals("false", state.s("configured"))
        assertTrue(state["nudges"]!!.a.map { it.s("kind") }.contains("site_not_published"))
        assertEquals(TestCredits.shown(TestCredits.micro(TestCredits.allowances.free)), state["credits"]!!.o.s("limit"))
        val thread = Bo.thread(api, clinic, clinic.owner.token)
        assertError(HttpStatusCode.ServiceUnavailable, "AI_NOT_CONFIGURED", Bo.post(api, clinic, clinic.owner.token, thread, "Hello"))
    }
}
