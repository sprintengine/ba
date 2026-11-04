package ie.bookanything.assistant.tools

import ie.bookanything.AppContext
import ie.bookanything.ai.ChatBlock
import ie.bookanything.auth.BusinessAccess
import ie.bookanything.auth.CurrentUser
import ie.bookanything.auth.DevTokenVerifier
import ie.bookanything.auth.Role
import ie.bookanything.auth.TokenService
import ie.bookanything.config.AppConfig
import ie.bookanything.db.Db
import ie.bookanything.http.ApiException
import ie.bookanything.notifications.LogEmailSender
import ie.bookanything.notifications.NoopSmsSender
import ie.bookanything.payments.NoPaymentProvider
import ie.bookanything.support.MutableClock
import ie.bookanything.support.SiteFixtures
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import java.io.PrintWriter
import java.sql.Connection
import java.util.UUID
import java.util.logging.Logger
import javax.sql.DataSource
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/**
 * Input validation and permission gating of every tool, without a database: a context whose data source refuses
 * connections proves each check happens before anything is read or changed.
 */
class ToolGuardsTest {
    private class NoDatabase : DataSource {
        override fun getConnection(): Connection = throw AssertionError("the database must not be touched")
        override fun getConnection(username: String?, password: String?): Connection = connection
        override fun getLogWriter(): PrintWriter? = null
        override fun setLogWriter(out: PrintWriter?) = Unit
        override fun setLoginTimeout(seconds: Int) = Unit
        override fun getLoginTimeout() = 0
        override fun getParentLogger(): Logger = Logger.getGlobal()
        override fun <T : Any?> unwrap(iface: Class<T>?): T = throw UnsupportedOperationException()
        override fun isWrapperFor(iface: Class<*>?) = false
    }

    private val config = AppConfig.fromEnvironment(mapOf("APP_ENV" to "development"))
    private val db = Db(NoDatabase())
    private val clock = MutableClock(ie.bookanything.support.DEFAULT_NOW)
    private val app = AppContext(
        config, db, clock, TokenService(config.tokenSecret), DevTokenVerifier(), NoPaymentProvider(), LogEmailSender("x@y.z"),
        NoopSmsSender(),
    )
    private val contexts = ToolContexts(db, clock, app.booking, NoPaymentProvider())
    private val alex = UUID.randomUUID()
    private val blake = UUID.randomUUID()

    private fun access(role: Role) = BusinessAccess(
        CurrentUser(UUID.randomUUID(), "dev_user", "user@example.test", true, "Test User"), SiteFixtures.business(), UUID.randomUUID(),
        role,
        if (role == Role.STAFF) setOf(alex) else emptySet(),
    )
    private fun ctx(role: Role = Role.OWNER) = contexts.forMember(access(role))
    private fun input(json: String): JsonObject = Json.parseToJsonElement(json).jsonObject

    /** The API error a tool raises for [json], with its field problems. */
    private fun refuse(tool: AssistantTool<*>, json: String, role: Role = Role.OWNER): ApiException = assertFailsWith<ApiException> {
        when (tool) {
            is ReadTool<*> -> ToolInputs.read(tool, ctx(role), input(json))
            is WriteTool<*> -> ToolInputs.propose(tool, ctx(role), input(json))
        }
    }

    private fun assertField(e: ApiException, field: String) = assertTrue(
        field in e.fields, "expected a problem with $field, got ${e.code} ${e.fields} ${e.message}",
    )

    @Test
    fun `tool inputs are decoded strictly`() {
        assertEquals(
            "INVALID_REQUEST", refuse(GetSchedule, """{"date": "2026-10-05", "days": 1, "resourceId": null, "extra": true}""").code,
        )
        assertEquals("INVALID_REQUEST", refuse(GetSchedule, """{"date": "2026-10-05", "days": "one", "resourceId": null}""").code)
        assertEquals(
            "INVALID_REQUEST",
            refuse(CancelBookings, """{"bookingIds": [], "reason": null, "refund": "half", "notifyCustomer": true}""").code,
        )
        assertEquals("INVALID_REQUEST", refuse(UpdateMemory, """{"action": "shout", "memoryId": null, "text": "x"}""").code)
    }

    @Test
    fun `read tools validate before reading`() {
        assertField(refuse(GetSchedule, """{"date": "5 October", "days": 1, "resourceId": null}"""), "date")
        assertField(refuse(GetSchedule, """{"date": "2026-10-05", "days": 8, "resourceId": null}"""), "days")
        assertField(refuse(GetSchedule, """{"date": "2026-10-05", "days": 1, "resourceId": "alex"}"""), "resourceId")
        assertField(refuse(FindBookings, """{"query": null, "status": "lost", "from": null, "to": null, "customerId": null}"""), "status")
        assertField(
            refuse(FindBookings, """{"query": null, "status": null, "from": "2026-10-09", "to": "2026-10-01", "customerId": null}"""), "to",
        )
        assertField(refuse(FindCustomers, """{"query": "   "}"""), "query")
        assertField(
            refuse(
                CheckAvailability,
                """{"serviceId": "${UUID.randomUUID()}", "date": "2026-10-05", "days": 0, "resourceId": null, "optionId": null}""",
            ),
            "days",
        )
        assertField(refuse(GetStats, """{"from": "2026-01-01", "to": "2026-12-31"}"""), "to")
    }

    @Test
    fun `write tools validate before proposing`() {
        val service = UUID.randomUUID()
        val booking = """{"serviceId": "$service", "optionId": null, "start": "2026-10-06T10:00:00+01:00", "resourceIds": null, "customerId": null,
            "newCustomer": null, "paymentMode": "at_venue", "notifyCustomer": true, "internalNotes": null}"""
        assertField(refuse(CreateBooking, booking), "customer")
        assertField(
            refuse(
                CreateBooking,
                booking.replace("\"newCustomer\": null", """"newCustomer": {"name": "", "email": "not-an-email", "phone": null}"""),
            ),
            "customer.email",
        )
        assertField(
            refuse(
                CreateBooking,
                booking.replace("2026-10-06T10:00:00+01:00", "tomorrow morning").replace(
                    "\"newCustomer\": null",
                    """"newCustomer": {"name": "Robin", "email": null, "phone": null}""",
                ),
            ),
            "start",
        )
        assertField(
            refuse(CancelBookings, """{"bookingIds": [], "reason": null, "refund": "policy", "notifyCustomer": true}"""), "bookingIds",
        )
        assertField(
            refuse(
                CancelBookings,
                """{"bookingIds": [${(1..21).joinToString { "\"${UUID.randomUUID()}\"" }}], "reason": null, "refund": "policy", "notifyCustomer": true}""",
            ),
            "bookingIds",
        )
        assertField(
            refuse(
                BlockTime,
                """{"resourceId": "$alex", "date": "2026-10-06", "startTime": "12:00", "endTime": "09:00", "reason": null}""",
            ),
            "endTime",
        )
        assertField(
            refuse(BlockTime, """{"resourceId": "$alex", "date": "2026-10-06", "startTime": "12:00", "endTime": null, "reason": null}"""),
            "endTime",
        )
        assertField(refuse(CloseDate, """{"date": "someday", "reason": null}"""), "date")
        assertField(refuse(UpdateOpeningHours, """{"resourceIds": ["$alex"], "days": [{"dayOfWeek": 8, "intervals": []}]}"""), "days")
        assertField(
            refuse(
                UpdateOpeningHours,
                """{"resourceIds": ["$alex"], "days": [{"dayOfWeek": 1, "intervals": [{"start": "17:00", "end": "09:00"}]}]}""",
            ),
            "rules[0].endTime",
        )
        assertField(refuse(UpdateOpeningHours, """{"resourceIds": [], "days": [{"dayOfWeek": 1, "intervals": []}]}"""), "resourceIds")
        assertEquals(
            "INVALID_REQUEST", refuse(UpdateService, """{"serviceId": "$service", "priceCents": null, "durationMinutes": null}""").code,
        )
        assertField(refuse(UpdateMemory, """{"action": "add", "memoryId": null, "text": "   "}"""), "text")
        assertField(refuse(UpdateMemory, """{"action": "add", "memoryId": null, "text": "${"x".repeat(281)}"}"""), "text")
        assertField(refuse(UpdateMemory, """{"action": "delete", "memoryId": "m1", "text": null}"""), "memoryId")
    }

    @Test
    fun `staff are held to their own calendar and admin tools refuse them`() {
        val onBlake = """{"serviceId": "${UUID.randomUUID()}", "optionId": null, "start": "2026-10-06T10:00:00+01:00", "resourceIds": ["$blake"], "customerId": null,
            "newCustomer": {"name": "Robin", "email": null, "phone": null}, "paymentMode": "at_venue", "notifyCustomer": true, "internalNotes": null}"""
        assertEquals("FORBIDDEN", refuse(CreateBooking, onBlake, Role.STAFF).code)
        assertEquals(
            "FORBIDDEN",
            refuse(
                RescheduleBooking,
                """{"bookingId": "${UUID.randomUUID()}", "start": "2026-10-06T10:00:00+01:00", "resourceIds": ["$blake"], "notifyCustomer": true}""",
                Role.STAFF,
            ).code,
        )
        assertEquals("FORBIDDEN", refuse(CloseDate, """{"date": "2026-10-06", "reason": null}""", Role.STAFF).code)
        assertEquals(
            "FORBIDDEN",
            refuse(UpdateService, """{"serviceId": "${UUID.randomUUID()}", "priceCents": 100, "durationMinutes": null}""", Role.STAFF).code,
        )
        assertEquals("FORBIDDEN", refuse(UpdateMemory, """{"action": "add", "memoryId": null, "text": "x"}""", Role.STAFF).code)

        // The runner never offers or runs a tool above the member's role, whatever the model asks for.
        val runner = ToolRunner(ToolRegistry.DEFAULT) { _, _, _, _ -> throw AssertionError("no proposal may be stored") }
        for (tool in listOf("close_date", "get_stats", "update_service", "update_memory", "drop_database")) {
            val out = runner.run(ctx(Role.STAFF), UUID.randomUUID(), ChatBlock.ToolUse("t", tool, input("{}")))
            assertTrue(out is ToolCallResult.Failed && out.result.isError && out.result.content.contains("UNAVAILABLE"), "$tool: $out")
        }
        val admin = ToolRegistry.DEFAULT.available(Role.ADMIN).map { it.name }
        assertTrue(ToolRegistry.DEFAULT.available(Role.STAFF).all { it.name in admin })
    }
}
