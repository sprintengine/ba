package ie.bookanything.http

import ie.bookanything.support.Fixtures
import ie.bookanything.support.assertError
import ie.bookanything.support.jsonOf
import ie.bookanything.support.parse
import ie.bookanything.support.withApp
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.test.fail

/** Every malformed input must produce a 4xx with a safe error body, never a 500. */
class InvalidInputTest {
    private suspend fun bad(
        res: HttpResponse, code: String = "INVALID_REQUEST", status: HttpStatusCode = HttpStatusCode.BadRequest, field: String? = null,
    ) {
        val body = res.bodyAsText()
        if (res.status != status) fail("Expected $status $code, got ${res.status}: $body")
        val error = parse(body).jsonObject["error"]!!.jsonObject
        assertEquals(code, error["code"]!!.jsonPrimitive.content, body)
        if (field != null) assertTrue(error["fields"]!!.jsonObject.containsKey(field), "expected field $field in $body")
        assertTrue(
            !body.contains("SQL", ignoreCase = false) && !body.contains("Exception") && !body.contains("at ie."), "leaks internals: $body",
        )
    }

    @Test
    fun `public endpoints reject malformed input with 400`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val svc = clinic.service("Consult")
        val a = "${clinic.public}/availability"
        bad(api.get("$a?serviceId=$svc&from=2026-13-01&to=2026-10-07"), field = "from")
        bad(api.get("$a?serviceId=$svc&from=2026-10-07&to=07/10/2026"), field = "to")
        bad(api.get("$a?serviceId=$svc&from=2026-10-07"), field = "to")
        bad(api.get("$a?serviceId=not-a-uuid&from=2026-10-07&to=2026-10-07"), field = "serviceId")
        bad(api.get("$a?serviceId=$svc&from=2026-10-09&to=2026-10-07"), field = "to")
        bad(api.get("$a?serviceId=$svc&from=2026-10-01&to=2026-11-30"), field = "to")
        bad(api.get("$a?serviceId=$svc&from=2026-10-07&to=2026-10-07&addonIds=x,y"), field = "addonIds")
        bad(api.get("$a?serviceId=$svc&from=2026-10-07&to=2026-10-07&groupId=${UUID.randomUUID()}"), field = "groupId")
        bad(api.get("$a?serviceId=$svc&from=2026-10-07&to=2026-10-07&resourceId=${clinic.resource("Room")}"), field = "resourceId")
        bad(api.get("$a?serviceId=$svc&from=2026-10-07&to=2026-10-07&optionId=${UUID.randomUUID()}"), field = "optionId")
        assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.get("$a?serviceId=${UUID.randomUUID()}&from=2026-10-07&to=2026-10-07"))
        assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.get("/v1/public/businesses/no-such-business-here"))

        val b = "${clinic.public}/bookings"
        val good = Fixtures.bookingBody(clinic, "Consult", "2026-10-07T10:00:00+01:00")
        bad(api.post(b, good.replace("2026-10-07T10:00:00+01:00", "tomorrow at ten")), field = "start")
        bad(api.post(b, good.replace("2026-10-07T10:00:00+01:00", "2026-10-07T25:00:00+01:00")), field = "start")
        bad(api.post(b, "{"))
        bad(api.post(b, "[]"))
        bad(api.post(b, ""))
        bad(api.post(b, jsonOf("serviceId" to svc, "start" to "2026-10-07T10:00:00+01:00")), field = "customer")
        bad(api.post(b, good.replace("@example.test", "")), field = "customer.email")
        bad(api.post(b, good.replace("\"Jordan Casey\"", "\"\"")), field = "customer.name")
        bad(api.post(b, good.replace(clinic.service("Consult"), "zzz")), field = "serviceId")
        bad(
            api.post(
                b,
                Fixtures.bookingBody(clinic, "Consult", "2026-10-07T10:00:00+01:00", answers = mapOf(UUID.randomUUID().toString() to "x")),
            ),
        )
        bad(
            api.post(b, Fixtures.bookingBody(clinic, "Consult", "2026-10-07T10:00:00+01:00", answers = emptyMap())),
            field = "answers.${clinic.questions.getValue("Reason for visit")}",
        )
        bad(
            api.post(
                b,
                Fixtures.bookingBody(
                    clinic, "Consult", "2026-10-07T10:00:00+01:00",
                    answers = mapOf(
                        clinic.questions.getValue("Reason for visit") to "x", clinic.questions.getValue("Referred by") to "Carrier pigeon",
                    ),
                ),
            ),
        )
        bad(api.post(b, good.replace("\"addonIds\":[]", "\"addonIds\":\"all\"")))
        bad(api.post(b, good.replace("\"groupId\":null", "\"groupId\":42")))
        // Unsupported content type is a client error too.
        val plain = api.client.post(b) { contentType(ContentType.Text.Plain); setBody("hello") }
        assertTrue(plain.status.value in 400..499, "got ${plain.status}")
        assertError(
            HttpStatusCode.NotFound, "NOT_FOUND", api.post(b, good.replace(clinic.service("Consult"), UUID.randomUUID().toString())),
        )
        // Slot in the past / not aligned
        assertError(
            HttpStatusCode.Conflict, "SLOT_UNAVAILABLE", api.post(b, Fixtures.bookingBody(clinic, "Consult", "2026-10-01T10:00:00+01:00")),
        )
        assertError(
            HttpStatusCode.Conflict, "SLOT_UNAVAILABLE", api.post(b, Fixtures.bookingBody(clinic, "Consult", "2026-10-07T10:07:00+01:00")),
        )
    }

    @Test
    fun `list and report ranges cover at most 366 days, counting both ends`() = withApp { api ->
        // Regression: the check counted the days between from and to, so 367 calendar days were accepted although the
        // contract (openapi.yaml) says at most 366.
        val clinic = Fixtures.clinic(api)
        val t = clinic.owner.token
        for (path in listOf("bookings", "reports/summary")) {
            assertEquals(HttpStatusCode.OK, api.get("${clinic.base}/$path?from=2026-10-01&to=2027-10-01", t).status, path)
            bad(api.get("${clinic.base}/$path?from=2026-10-01&to=2027-10-02", t), field = "to")
        }
    }

    @Test
    fun `dashboard endpoints reject malformed input with 400`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val t = clinic.owner.token
        val base = clinic.base
        // GET /v1/businesses/{idOrSlug} reads a non-id as a slug (none here: 404); every other business route wants an id.
        bad(api.get("/v1/businesses/not-a-uuid/overview", t), field = "businessId")
        bad(api.patch("/v1/businesses/not-a-uuid", jsonOf("name" to "X"), t), field = "businessId")
        bad(api.patch(base, jsonOf("timezone" to "Mars/Olympus"), t), code = "INVALID_TIMEZONE", field = "timezone")
        bad(api.patch(base, jsonOf("timezone" to "+05:00"), t), code = "INVALID_TIMEZONE")
        bad(api.patch(base, jsonOf("currency" to "euro"), t), field = "currency")
        bad(api.patch(base, jsonOf("status" to "suspended"), t), field = "status")
        bad(api.patch(base, jsonOf("slug" to "Bad Slug!"), t), field = "slug")
        bad(api.patch(base, jsonOf("name" to 42), t), field = "name")
        bad(api.patch(base, jsonOf("policies" to mapOf("lateCancellationRefundPercent" to 150)), t))
        bad(
            api.patch(base, jsonOf("branding" to mapOf("primaryColor" to "red", "logoUrl" to null, "coverImageUrl" to null)), t),
            field = "branding.primaryColor",
        )
        bad(api.patch(base, jsonOf("contactEmail" to "not-an-email"), t), field = "contactEmail")
        bad(api.get("$base/bookings?status=bogus", t), field = "status")
        bad(api.get("$base/bookings?from=2026-10-01&to=2028-01-01", t), field = "to")
        bad(api.get("$base/bookings?cursor=@@@", t), field = "cursor")
        bad(api.get("$base/bookings?limit=0", t), field = "limit")
        bad(api.get("$base/bookings?limit=ten", t), field = "limit")
        bad(api.get("$base/bookings/123", t), field = "bookingId")
        bad(api.get("$base/customers?cursor=nope", t), field = "cursor")
        bad(api.get("$base/availability?serviceId=${clinic.service("Consult")}&from=2026-10-07", t), field = "to")
        bad(api.get("$base/reports/summary?from=2026-10-01&to=2027-12-31", t), field = "to")
        bad(api.post("$base/resources", jsonOf("kind" to "robot", "name" to "R2"), t), field = "kind")
        bad(api.post("$base/resources", jsonOf("kind" to "person", "name" to "X", "color" to "blue"), t), field = "color")
        bad(
            api.post("$base/resources", jsonOf("kind" to "person", "name" to "X", "memberId" to UUID.randomUUID().toString()), t),
            field = "memberId",
        )
        bad(
            api.put(
                "$base/resources/${clinic.resource("Alex")}/rules",
                jsonOf("rules" to listOf(mapOf("dayOfWeek" to 8, "startTime" to "17:00", "endTime" to "09:00"))), t,
            ),
        )
        bad(
            api.put(
                "$base/resources/${clinic.resource("Alex")}/rules",
                jsonOf("rules" to listOf(mapOf("dayOfWeek" to 1, "startTime" to "9am", "endTime" to "17:00"))), t,
            ),
        )
        bad(
            api.put(
                "$base/resources/${clinic.resource("Alex")}/rules",
                jsonOf(
                    "rules" to listOf(
                        mapOf(
                            "dayOfWeek" to 1, "startTime" to "09:00", "endTime" to "17:00",
                            "audienceGroupIds" to listOf(UUID.randomUUID().toString()),
                        ),
                    ),
                ),
                t,
            ),
            field = "rules",
        )
        bad(
            api.post("$base/resources/${clinic.resource("Alex")}/overrides", jsonOf("date" to "2026-02-30", "isAvailable" to false), t),
            field = "date",
        )
        bad(
            api.post("$base/resources/${clinic.resource("Alex")}/overrides", jsonOf("date" to "2026-10-12", "isAvailable" to true), t),
            field = "startTime",
        )
        bad(
            api.post(
                "$base/closures", jsonOf("date" to "2026-12-25", "isAvailable" to true, "startTime" to "09:00", "endTime" to "10:00"),
                t,
            ),
            field = "isAvailable",
        )
        bad(
            api.post(
                "$base/services",
                jsonOf("name" to "X", "durationMinutes" to 30, "paymentMode" to "deposit", "priceCents" to 1000, "depositCents" to 5000), t,
            ),
            field = "depositCents",
        )
        bad(api.post("$base/services", jsonOf("name" to "X", "durationMinutes" to 3), t), field = "durationMinutes")
        bad(api.post("$base/services", jsonOf("name" to "X", "durationMinutes" to 30, "paymentMode" to "barter"), t), field = "paymentMode")
        bad(
            api.post(
                "$base/services",
                jsonOf(
                    "name" to "X", "durationMinutes" to 30,
                    "requirements" to listOf(
                        mapOf("label" to "A", "customerSelectable" to true, "resourceIds" to listOf(clinic.resource("Alex"))),
                        mapOf("label" to "B", "customerSelectable" to true, "resourceIds" to listOf(clinic.resource("Blake"))),
                    ),
                ),
                t,
            ),
            field = "requirements",
        )
        bad(api.post("$base/questions", jsonOf("label" to "Pick", "kind" to "select"), t), field = "options")
        bad(api.post("$base/questions", jsonOf("label" to "Q", "kind" to "essay"), t), field = "kind")
        bad(api.post("$base/customer-groups", jsonOf("name" to ""), t), field = "name")
        bad(api.post("$base/team/invitations", jsonOf("email" to "nobody", "role" to "staff"), t), field = "email")
        bad(api.post("$base/team/invitations", jsonOf("email" to "x@example.test", "role" to "superuser"), t), field = "role")
        bad(
            api.post(
                "$base/bookings",
                jsonOf(
                    "serviceId" to clinic.service("Consult"), "start" to "2026-10-07T10:00:00+01:00", "paymentMode" to "iou",
                    "customer" to mapOf("name" to "X"),
                ),
                t,
            ),
            field = "paymentMode",
        )
        bad(
            api.post("$base/bookings", jsonOf("serviceId" to clinic.service("Consult"), "start" to "2026-10-07T10:00:00+01:00"), t),
            field = "customer",
        )
        bad(api.post("$base/billing/checkout", jsonOf("plan" to "platinum", "returnUrl" to "http://localhost:3000/x"), t), field = "plan")
        bad(api.post("$base/payments/connect", jsonOf("returnUrl" to "https://evil.example/steal"), t), field = "returnUrl")
        assertError(
            HttpStatusCode.Conflict, "PAYMENTS_NOT_CONFIGURED",
            api.post("$base/billing/checkout", jsonOf("plan" to "pro", "returnUrl" to "http://localhost:3000/x"), t),
        )
        bad(
            api.post("/v1/businesses", jsonOf("name" to "Tz Test", "timezone" to "Nowhere/Land"), t), code = "INVALID_TIMEZONE",
            field = "timezone",
        )
        bad(api.post("/v1/businesses", jsonOf("name" to "", "timezone" to "Europe/Dublin"), t), field = "name")
        bad(
            api.post(
                "/v1/businesses",
                jsonOf(
                    "name" to "Bad refs",
                    "services" to listOf(
                        mapOf(
                            "name" to "S", "durationMinutes" to 30,
                            "requirements" to listOf(mapOf("label" to "X", "resourceKeys" to listOf("ghost"))),
                        ),
                    ),
                ),
                t,
            ),
        )
    }
}
