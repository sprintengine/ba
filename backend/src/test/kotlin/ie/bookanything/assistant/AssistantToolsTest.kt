package ie.bookanything.assistant

import ie.bookanything.ai.ChatBlock
import ie.bookanything.support.Bo
import ie.bookanything.support.Clinic
import ie.bookanything.support.FakeModelClient
import ie.bookanything.support.Fixtures
import ie.bookanything.support.Money
import ie.bookanything.support.MutableClock
import ie.bookanything.support.RecordingPaymentProvider
import ie.bookanything.support.SseEvent
import ie.bookanything.support.TestEnv
import ie.bookanything.support.a
import ie.bookanything.support.arr
import ie.bookanything.support.assertStatus
import ie.bookanything.support.jsonOf
import ie.bookanything.support.o
import ie.bookanything.support.obj
import ie.bookanything.support.parse
import ie.bookanything.support.s
import ie.bookanything.support.withApp
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Each tool through the whole path: model call → tool → (proposal → confirm) → the existing command. */
class AssistantToolsTest {
    private val model = FakeModelClient()
    private val env = TestEnv(clock = MutableClock(ie.bookanything.support.DEFAULT_NOW), modelClient = model)

    private fun one(tool: String, input: String) = """{"rules": [{"match": ["*"], "steps": [
        {"tools": [{"name": "$tool", "input": $input}]}, {"text": "Done."}]}]}"""

    /** Runs one tool call as the owner and returns the stream and the tool result the model got. */
    private suspend fun call(
        api: ie.bookanything.support.Api, clinic: Clinic, tool: String, input: String,
        token: String = clinic.owner.token,
    ): Pair<List<SseEvent>, ChatBlock.ToolResult> {
        model.script(one(tool, input))
        val events = Bo.send(api, clinic, token, Bo.thread(api, clinic, token), "Go")
        val result = model.conversations.last().messages.last().blocks.filterIsInstance<ChatBlock.ToolResult>().single()
        return events to result
    }

    private fun data(result: ChatBlock.ToolResult): JsonObject = parse(result.content).jsonObject

    private suspend fun proposeAndConfirm(api: ie.bookanything.support.Api, clinic: Clinic, tool: String, input: String): Pair<
        JsonObject,
        JsonObject,
        > {
        val (events, _) = call(api, clinic, tool, input)
        val action = events.single { it.type == "proposal" }.data["action"]!!.o
        val confirmed = Bo.confirm(api, clinic, clinic.owner.token, action.s("id"))
        assertStatus(HttpStatusCode.OK, confirmed)
        val result = confirmed.obj()
        assertEquals("confirmed", result.s("status"), result.toString())
        return action["proposal"]!!.o to result["result"]!!.o
    }

    private fun items(proposal: JsonObject) = proposal["items"]!!.a.map { "${it.s("title")} | ${it.o["detail"]?.toString()?.trim('"')}" }
    private fun changes(proposal: JsonObject) = proposal["changes"]!!.a.map {
        "${it.s("label")}: ${it.o["before"]?.toString()?.trim('"')} → ${it.o["after"]?.toString()?.trim('"')}"
    }
    private fun auditActor(action: String, entity: String) =
        Fixtures.sqlOne("SELECT actor_type::text FROM audit_events WHERE action = ? AND entity_id = ?", action, entity) { it.getString(1) }

    @Test
    fun `read tools return compact views`() = withApp(env) { api ->
        val clinic = Fixtures.clinic(api)
        val availability = data(
            call(
                api, clinic, "check_availability",
                """{"serviceId": "${clinic.service("Consult")}", "date": "2026-10-06", "days": 2, "resourceId": "${clinic.resource("Blake")}", "optionId": null}""",
            ).second,
        )
        assertEquals("Consult", availability.s("service"))
        assertEquals(
            listOf("2026-10-06T13:00:00+01:00", "13:00", "Blake, Room"),
            availability["firstFree"]!!.o.let {
                listOf(it.s("start"), it.s("time"), it["with"]!!.a.joinToString(", ") { w -> w.toString().trim('"') })
            },
        )
        val services = data(call(api, clinic, "list_services", "{}").second)["services"]!!.a
        assertTrue(services.any { it.s("name") == "Paid consult" && it.s("price") == "€50" && it.s("paymentMode") == "full" })
        val alex = data(call(api, clinic, "list_resources", "{}").second)["resources"]!!.a.first { it.s("name") == "Alex" }
        assertEquals(listOf("09:00–17:00"), alex.o["weeklyHours"]!!.a[0].o["intervals"]!!.a.map { it.toString().trim('"') })
        assertEquals(
            listOf("09:00–12:00 (some customer groups only)"),
            alex.o["weeklyHours"]!!.a[5].o["intervals"]!!.a.map { it.toString().trim('"') },
        )
        assertEquals("24", data(call(api, clinic, "get_policies", "{}").second)["policies"]!!.o.s("cancellationNoticeHours"))
        val stats = data(call(api, clinic, "get_stats", """{"from": "2026-10-01", "to": "2026-10-31"}""").second)
        assertEquals("€0", stats.s("revenue"))
        val overview = data(call(api, clinic, "business_overview", "{}").second)
        assertEquals(listOf("2026-10-05", "€0"), listOf(overview.s("today"), overview.s("revenue30Days")))
        // Invalid input comes back as an error the model can fix.
        val (events, bad) = call(api, clinic, "get_schedule", """{"date": "5 October", "days": 9, "resourceId": null, "colour": "red"}""")
        assertTrue(bad.isError && bad.content.contains("INVALID_REQUEST"), bad.content)
        assertEquals("error", events.last { it.type == "tool" }.data["tool"]!!.o.s("status"))
        val (_, range) = call(api, clinic, "get_schedule", """{"date": "2026-10-05", "days": 9, "resourceId": null}""")
        assertTrue(range.isError && range.content.contains("\"days\":\"Must be between 1 and 7\""), range.content)
    }

    @Test
    fun `reschedule and bulk cancel`() = withApp(env) { api ->
        val clinic = Fixtures.clinic(api)
        val a = Fixtures.book(api, clinic, "Consult", "2026-10-06T10:00:00+01:00", resourceId = clinic.resource("Alex"))["booking"]!!.o
        val b = Fixtures.book(api, clinic, "Consult", "2026-10-06T14:00:00+01:00", resourceId = clinic.resource("Blake"))["booking"]!!.o
        val (moved, movedResult) = proposeAndConfirm(
            api, clinic, "reschedule_booking",
            """{"bookingId": "${a.s("id")}", "start": "2026-10-06T12:00:00+01:00", "resourceIds": null, "notifyCustomer": false}""",
        )
        assertEquals("When: Tue 6 Oct, 10:00–11:00 → Tue 6 Oct, 12:00–13:00", changes(moved).first())
        assertTrue(movedResult.s("message").startsWith("Moved ${a.s("reference")} to Tue 6 Oct, 12:00–13:00"))
        assertEquals("ai", auditActor("booking.rescheduled", a.s("id")))

        val (cancel, _) = proposeAndConfirm(
            api, clinic, "cancel_bookings",
            """{"bookingIds": ["${a.s("id")}", "${b.s("id")}"], "reason": "Closed for training", "refund": "policy", "notifyCustomer": true}""",
        )
        assertEquals(listOf("Cancel 2 bookings", "true"), listOf(cancel.s("title"), cancel.s("destructive")))
        assertEquals(
            listOf(
                "${a.s("reference")} · Consult · Tue 6 Oct, 12:00–13:00 · Jordan Casey | Nothing to refund",
                "${b.s("reference")} · Consult · Tue 6 Oct, 14:00–15:00 · Jordan Casey | Nothing to refund",
            ),
            items(cancel),
        )
        assertEquals(
            listOf("cancelled", "cancelled"),
            listOf(a, b).map { x -> Fixtures.sqlOne("SELECT status::text FROM bookings WHERE id = ?", x.s("id")) { it.getString(1) } },
        )
        assertEquals("ai", auditActor("booking.cancelled", b.s("id")))
    }

    @Test
    fun `the schedule is short rows without contact details, cut at 60 bookings`() = withApp(env) { api ->
        val clinic = Fixtures.clinic(api)
        // 61 half-hour bookings with Alex: Tuesday to Thursday 09:00–17:00 has 48, Friday the rest.
        val starts = listOf("06", "07", "08", "09").flatMap { day ->
            (9..16).flatMap { h -> listOf("00", "30").map { m -> "2026-10-${day}T${h.toString().padStart(2, '0')}:$m:00+01:00" } }
        }.take(61)
        for (start in starts) Fixtures.book(api, clinic, "Approval consult", start, resourceId = clinic.resource("Alex"))
        val schedule = data(call(api, clinic, "get_schedule", """{"date": "2026-10-06", "days": 7, "resourceId": null}""").second)
        assertEquals(listOf("60", "true"), listOf(schedule.s("total"), schedule.s("truncated")))
        val row = schedule["days"]!!.a.first().o["bookings"]!!.a.first().o
        assertEquals("09:00–09:30", row.s("time"))
        assertEquals(listOf("id", "name"), row["customer"]!!.o.keys.toList())
        assertTrue(listOf("answers", "when").none { it in row.keys }, row.keys.toString())
        assertTrue("@example.test" !in schedule.toString(), "no email addresses")
    }

    @Test
    fun `the booking card shows everything a new booking stores`() = withApp(env) { api ->
        val clinic = Fixtures.clinic(api)
        val note = "Prefers the ground floor room. ".repeat(10).trim()
        val (events, _) = call(
            api, clinic, "create_booking",
            """{"serviceId": "${clinic.service("Consult")}", "optionId": null, "start": "2026-10-06T10:00:00+01:00",
                "resourceIds": null, "customerId": null,
                "newCustomer": {"name": "Robin Example", "email": "robin@example.test", "phone": "+353 87 123 4567"},
                "paymentMode": "at_venue", "notifyCustomer": true, "internalNotes": "$note"}""",
        )
        val changes = changes(events.single { it.type == "proposal" }.data["action"]!!.o["proposal"]!!.o)
        assertTrue("Email: null → robin@example.test" in changes, changes.toString())
        assertTrue(changes.any { it.startsWith("Phone: null → +353") }, changes.toString())
        assertEquals("Team note: null → ${note.take(200)}…", changes.last())
    }

    @Test
    fun `a confirmed bulk cancel refunds each booking once the confirmation has committed`() {
        val payments = RecordingPaymentProvider()
        val model = FakeModelClient()
        val env = TestEnv(clock = MutableClock(ie.bookanything.support.DEFAULT_NOW), modelClient = model, payments = payments)
        withApp(env) { api ->
            val clinic = Fixtures.clinic(api)
            val paid = listOf("2026-10-06T10:00:00+01:00", "2026-10-07T10:00:00+01:00").map {
                Money.bookingId(Money.paidBooking(api, clinic, "Paid consult", it))
            }
            val ids = paid.joinToString(", ") { "\"$it\"" }
            model.script(one("cancel_bookings", """{"bookingIds": [$ids], "reason": null, "refund": "full", "notifyCustomer": false}"""))
            val events = Bo.send(api, clinic, clinic.owner.token, Bo.thread(api, clinic, clinic.owner.token), "Go")
            val action = events.single { it.type == "proposal" }.data["action"]!!.o.s("id")

            // Each refund is recorded with its cancellation and made at the provider once the confirmation has committed,
            // before the confirm request answers.
            val confirmed = Bo.confirm(api, clinic, clinic.owner.token, action).obj()
            assertEquals("confirmed", confirmed.s("status"), confirmed.toString())
            assertTrue(confirmed["result"]!!.o.s("message").endsWith("Refunds are on their way."), confirmed.toString())
            assertEquals(2, payments.refunds.size, "one refund per booking, made after the commit")
            paid.forEach { id ->
                assertEquals(listOf("charge succeeded 5000", "refund succeeded 5000"), Money.ledger(id))
                val status = Fixtures.sqlOne("SELECT payment_status::text FROM bookings WHERE id = ?::uuid", id) { it.getString(1) }
                assertEquals("refunded", status)
            }
        }
    }

    @Test
    fun `a bulk cancel that can't cancel every booking refunds nobody`() {
        val payments = RecordingPaymentProvider()
        val model = FakeModelClient()
        withApp(TestEnv(clock = MutableClock(ie.bookanything.support.DEFAULT_NOW), modelClient = model, payments = payments)) { api ->
            val clinic = Fixtures.clinic(api)
            val paid = listOf("2026-10-06T10:00:00+01:00", "2026-10-06T14:00:00+01:00", "2026-10-07T10:00:00+01:00").map {
                Money.bookingId(Money.paidBooking(api, clinic, "Paid consult", it))
            }
            val ids = paid.joinToString(", ") { "\"$it\"" }
            model.script(one("cancel_bookings", """{"bookingIds": [$ids], "reason": null, "refund": "full", "notifyCustomer": false}"""))
            val events = Bo.send(api, clinic, clinic.owner.token, Bo.thread(api, clinic, clinic.owner.token), "Go")
            val action = events.single { it.type == "proposal" }.data["action"]!!.o.s("id")
            // Before the owner confirms, the last booking stops being cancellable.
            Fixtures.sql("UPDATE bookings SET status = 'completed' WHERE id = ?", UUID.fromString(paid.last()))

            val confirmed = Bo.confirm(api, clinic, clinic.owner.token, action).obj()
            assertEquals("failed", confirmed.s("status"))
            assertEquals(0, payments.refunds.size, "no refund reaches the provider")
            assertEquals(
                listOf("confirmed", "confirmed"),
                paid.take(2).map { id -> Fixtures.sqlOne("SELECT status::text FROM bookings WHERE id = ?", id) { it.getString(1) } },
            )
        }
    }

    @Test
    fun `payment links go to held bookings`() = withApp(env) { api ->
        val clinic = Fixtures.clinic(api)
        val created = api.post(
            "${clinic.base}/bookings",
            jsonOf(
                "serviceId" to clinic.service("Paid consult"), "start" to "2026-10-06T10:00:00+01:00",
                "resourceIds" to listOf(clinic.resource("Alex")),
                "customer" to mapOf("name" to "Robin Example", "email" to "robin@example.test"), "paymentMode" to "collect_online",
                "notifyCustomer" to false,
            ),
            clinic.owner.token,
        )
        assertStatus(HttpStatusCode.Created, created)
        val id = created.obj().s("id")
        val (proposal, result) = proposeAndConfirm(api, clinic, "send_payment_link", """{"bookingId": "$id"}""")
        assertEquals(listOf("To: null → robin@example.test", "Amount: null → €50"), changes(proposal))
        assertEquals("Sent the payment link to robin@example.test.", result.s("message"))
        assertEquals("ai", auditActor("booking.payment_link_sent", id))
        // A booking that isn't waiting for payment can't get one.
        val paid = Fixtures.book(api, clinic, "Consult", "2026-10-06T14:00:00+01:00")["booking"]!!.o.s("id")
        val (_, refused) = call(api, clinic, "send_payment_link", """{"bookingId": "$paid"}""")
        assertTrue(refused.isError && refused.content.contains("POLICY_VIOLATION"))
    }

    @Test
    fun `time off, closures and opening hours list what they affect`() = withApp(env) { api ->
        val clinic = Fixtures.clinic(api)
        val booked = Fixtures.book(api, clinic, "Consult", "2026-10-06T10:00:00+01:00", resourceId = clinic.resource("Alex"))["booking"]!!.o
        val (block, blocked) = proposeAndConfirm(
            api, clinic, "block_time",
            """{"resourceId": "${clinic.resource("Alex")}", "date": "2026-10-06", "startTime": "09:00", "endTime": "12:00", "reason": "Dentist"}""",
        )
        assertEquals(
            listOf(
                "${booked.s("reference")} · Consult · Tue 6 Oct, 10:00–11:00 · Jordan Casey | Stays booked: move or cancel it if needed",
            ),
            items(block),
        )
        assertEquals("Blocked 2026-10-06, 09:00–12:00.", blocked.s("message"))
        val slots = api.get(
            "${clinic.base}/availability?serviceId=${clinic.service("Consult")}&from=2026-10-06&to=2026-10-06&resourceId=${clinic.resource("Alex")}",
            clinic.owner.token,
        )
            .obj()["days"]!!.a.single().o["slots"]!!.a.map { it.s("start").substring(11, 16) }
        assertTrue(slots.none { it < "12:00" }, slots.toString())

        val (close, _) = proposeAndConfirm(api, clinic, "close_date", """{"date": "2026-10-06", "reason": "Training day"}""")
        assertEquals(1, items(close).size)
        assertEquals(
            "Training day",
            Fixtures.sqlOne(
                "SELECT reason FROM availability_overrides WHERE business_id = ? AND resource_id IS NULL",
                clinic.id,
            ) { it.getString(1) },
        )

        val (hours, _) = proposeAndConfirm(
            api, clinic, "update_opening_hours",
            """{"resourceIds": ["${clinic.resource("Alex")}"], "days": [{"dayOfWeek": 5, "intervals": [{"start": "09:00", "end": "13:00"}]}, {"dayOfWeek": 3, "intervals": []}]}""",
        )
        assertEquals(listOf("Alex · Wednesday | 09:00–17:00 → closed", "Alex · Friday | 09:00–17:00 → 09:00–13:00"), items(hours))
        val rules = api.get("${clinic.base}/resources/${clinic.resource("Alex")}/availability", clinic.owner.token).obj()["rules"]!!.a
            .map { "${it.s("dayOfWeek")} ${it.s("startTime")}-${it.s("endTime")} ${it.o["audienceGroupIds"]!!.a.size}" }
        assertEquals(
            listOf("1 09:00-17:00 0", "2 09:00-17:00 0", "4 09:00-17:00 0", "5 09:00-13:00 0", "6 09:00-12:00 1"), rules,
            "other days keep their rules, including group windows",
        )
    }

    @Test
    fun `service prices and business memory`() = withApp(env) { api ->
        val clinic = Fixtures.clinic(api)
        val (service, _) = proposeAndConfirm(
            api, clinic, "update_service", """{"serviceId": "${clinic.service("Consult")}", "priceCents": 4500, "durationMinutes": null}""",
        )
        assertEquals(listOf("Price: €0 → €45"), changes(service))
        assertEquals(
            "4500", api.get("${clinic.base}/services", clinic.owner.token).arr().first { it.s("name") == "Consult" }.s("priceCents"),
        )
        assertEquals("ai", auditActor("service.updated", clinic.service("Consult")))

        val (add, added) = proposeAndConfirm(
            api, clinic, "update_memory", """{"action": "add", "memoryId": null, "text": "We close early on Fridays"}""",
        )
        assertEquals("Remember this", add.s("title"))
        assertEquals("I'll remember: We close early on Fridays", added.s("message"))
        val id = api.get("${clinic.base}/assistant/memory", clinic.owner.token).arr().first().s("id")
        proposeAndConfirm(api, clinic, "update_memory", """{"action": "update", "memoryId": "$id", "text": "We close at 2pm on Fridays"}""")
        val (forget, _) = proposeAndConfirm(api, clinic, "update_memory", """{"action": "delete", "memoryId": "$id", "text": null}""")
        assertEquals(listOf("Memory: We close at 2pm on Fridays → null"), changes(forget))
        assertEquals(
            0L,
            Fixtures.sqlOne("SELECT count(*) FROM assistant_memory WHERE business_id = ?", UUID.fromString(clinic.id)) { it.getLong(1) },
        )
    }
}
