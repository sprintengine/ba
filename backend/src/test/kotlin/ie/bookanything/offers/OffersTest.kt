package ie.bookanything.offers

import ie.bookanything.support.Api
import ie.bookanything.support.Clinic
import ie.bookanything.support.Fixtures
import ie.bookanything.support.MarketplaceFixtures
import ie.bookanything.support.TestEnv
import ie.bookanything.support.TestUser
import ie.bookanything.support.a
import ie.bookanything.support.arr
import ie.bookanything.support.assertError
import ie.bookanything.support.assertStatus
import ie.bookanything.support.i
import ie.bookanything.support.jsonOf
import ie.bookanything.support.o
import ie.bookanything.support.obj
import ie.bookanything.support.parse
import ie.bookanything.support.s
import ie.bookanything.support.withApp
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class OffersTest {
    private fun offerBody(
        clinic: Clinic, services: List<String> = listOf("Paid consult"),
        discount: Map<
            String,
            Any,
            > = mapOf("type" to "percent", "percent" to 20),
        days: List<Int> = listOf(2), windows: List<Map<String, String>> = listOf(mapOf("start" to "13:00", "end" to "17:00")),
        lastMinuteHours: Int? = null, max: Int? = null, name: String = "Tuesday afternoons", active: Boolean = true,
    ) = jsonOf(
        "name" to name, "description" to "Quieter afternoons", "serviceIds" to services.map { clinic.service(it) }, "discount" to discount,
        "schedule" to mapOf("daysOfWeek" to days, "timeWindows" to windows, "lastMinuteHours" to lastMinuteHours),
        "validFrom" to null, "validUntil" to null, "maxRedemptions" to max, "active" to active,
    )

    private suspend fun create(api: Api, clinic: Clinic, body: String = offerBody(clinic)): JsonObject {
        val res = api.post("${clinic.base}/offers", body, clinic.owner.token)
        assertStatus(HttpStatusCode.Created, res)
        return res.obj()
    }

    private suspend fun slot(api: Api, clinic: Clinic, service: String, date: String, time: String): JsonObject =
        api.get(
            "${clinic.public}/availability?serviceId=${clinic.service(service)}&from=$date&to=$date",
        ).obj()["days"]!!.a.single().o["slots"]!!.a
            .first { it.s("start").contains("T$time") }.o

    @Test
    fun `offers CRUD by role`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val admin = MarketplaceFixtures.member(api, clinic, "admin")
        val staff = MarketplaceFixtures.member(api, clinic, "staff")
        val stranger = TestUser.create("stranger")

        val created = create(api, clinic)
        assertEquals("20% off", created.s("label"))
        assertEquals("Tue, 13:00–17:00", created.s("summary"))
        assertEquals("off_peak", created.s("kind"))
        assertEquals(0, created.i("redemptions"))
        val id = created.s("id")

        // Admins manage offers too.
        val byAdmin = api.post(
            "${clinic.base}/offers",
            offerBody(clinic, name = "Admin deal", discount = mapOf("type" to "fixed", "amountCents" to 500)), admin.token,
        )
        assertStatus(HttpStatusCode.Created, byAdmin)
        assertEquals("€5 off", byAdmin.obj().s("label"))
        assertEquals(2, api.get("${clinic.base}/offers", admin.token).arr().size)
        val updated = api.put("${clinic.base}/offers/$id", offerBody(clinic, name = "Renamed", days = listOf(2, 4)), admin.token)
        assertEquals("Tue and Thu, 13:00–17:00", updated.obj().s("summary"))
        assertEquals("paused", api.post("${clinic.base}/offers/$id/pause", null, clinic.owner.token).obj().s("status"))
        assertEquals("active", api.post("${clinic.base}/offers/$id/resume", null, admin.token).obj().s("status"))

        // Staff, strangers and signed-out users can't.
        for ((token, status, code) in listOf(
            Triple(staff.token, HttpStatusCode.Forbidden, "FORBIDDEN"),
            Triple(stranger.token, HttpStatusCode.NotFound, "NOT_FOUND"), Triple(null, HttpStatusCode.Unauthorized, "UNAUTHENTICATED"),
        )) {
            assertError(status, code, api.get("${clinic.base}/offers", token))
            assertError(status, code, api.post("${clinic.base}/offers", offerBody(clinic), token))
            assertError(status, code, api.put("${clinic.base}/offers/$id", offerBody(clinic), token))
            assertError(status, code, api.post("${clinic.base}/offers/$id/pause", null, token))
            assertError(status, code, api.delete("${clinic.base}/offers/$id", token))
        }

        // Validation and tenancy.
        val bad = api.post(
            "${clinic.base}/offers",
            offerBody(
                clinic, discount = mapOf("type" to "percent", "percent" to 150),
                windows = listOf(mapOf("start" to "17:00", "end" to "13:00")),
            ),
            clinic.owner.token,
        )
        assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", bad)
        assertTrue(
            "discount.percent" in bad.obj()["error"]!!.o["fields"]!!.o &&
                "schedule.timeWindows[0].end" in bad.obj()["error"]!!.o["fields"]!!.o,
        )
        val other = Fixtures.clinic(api)
        assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", api.post("${clinic.base}/offers", offerBody(other), clinic.owner.token))
        assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.put("${other.base}/offers/$id", offerBody(other), other.owner.token))

        assertStatus(HttpStatusCode.NoContent, api.delete("${clinic.base}/offers/$id", clinic.owner.token))
        assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.delete("${clinic.base}/offers/$id", clinic.owner.token))
        val audit = api.get("${clinic.base}/audit", clinic.owner.token).obj()["items"]!!.a.map { it.s("action") }
        assertTrue(
            listOf("offer.created", "offer.updated", "offer.paused", "offer.resumed", "offer.deleted").all { it in audit },
            audit.toString(),
        )
    }

    @Test
    fun `the preview lists exactly the slots the offer discounts`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val preview = api.post(
            "${clinic.base}/offers/preview",
            jsonOf(
                "offer" to kotlinx.serialization.json.Json.parseToJsonElement(offerBody(clinic)),
                "from" to "2026-10-05", "days" to 7,
            ),
            clinic.owner.token,
        )
        assertStatus(HttpStatusCode.OK, preview)
        val p = preview.obj()
        val starts = p["days"]!!.a.flatMap { d -> d.o["slots"]!!.a.map { it.s("start") } }
        assertTrue(starts.isNotEmpty())
        assertTrue(
            starts.all {
                it.startsWith("2026-10-06T13") || it.startsWith("2026-10-06T14") || it.startsWith("2026-10-06T15") ||
                    it.startsWith("2026-10-06T16")
            },
            starts.toString(),
        )
        assertEquals(starts.size, p.i("affectedSlots"))
        assertTrue(p.i("totalSlots") > p.i("affectedSlots"))
        val first = p["days"]!!.a.first().o["slots"]!!.a.first().o
        assertEquals(5000, first.i("originalPriceCents"))
        assertEquals(4000, first.i("priceCents"))
        assertError(
            HttpStatusCode.BadRequest, "INVALID_REQUEST",
            api.post(
                "${clinic.base}/offers/preview",
                jsonOf("offer" to kotlinx.serialization.json.Json.parseToJsonElement(offerBody(clinic)), "days" to 30), clinic.owner.token,
            ),
        )
    }

    @Test
    fun `discounted bookings are charged, refunded and reported at the discounted price`() {
        val env = TestEnv()
        withApp(env) { api ->
            val clinic = Fixtures.clinic(api)
            val offer = create(api, clinic)
            // Public offers and flagged slots.
            assertEquals("Tuesday afternoons", api.get("${clinic.public}/offers").arr().single().s("name"))
            val discounted = slot(api, clinic, "Paid consult", "2026-10-06", "14:00")
            assertEquals(4000, discounted["offer"]!!.o.i("priceCents"))
            assertEquals(5000, discounted["offer"]!!.o.i("originalPriceCents"))
            assertEquals(JsonNull, slot(api, clinic, "Paid consult", "2026-10-06", "10:00")["offer"])

            // Book the discounted slot and pay through the dev checkout.
            val result = Fixtures.book(api, clinic, "Paid consult", "2026-10-06T14:00:00+01:00")
            val booking = result["booking"]!!.o
            assertEquals(4000, booking.i("priceCents"))
            assertEquals(5000, booking.i("originalPriceCents"))
            assertEquals("Tuesday afternoons", booking["offer"]!!.o.s("name"))
            assertEquals(1000, booking["offer"]!!.o.i("discountCents"))
            val paymentId = result["next"]!!.o.s("checkoutUrl").substringAfterLast('/')
            assertEquals(4000, api.get("/v1/public/dev-payments/$paymentId").obj()["payment"]!!.o.i("amountCents"))
            api.post("/v1/public/dev-payments/$paymentId/complete", jsonOf("outcome" to "succeeded"))
            val token = result.s("manageToken")
            assertEquals(4000, api.get("/v1/public/manage/$token").obj().i("amountPaidCents"))
            assertEquals(1, api.get("${clinic.base}/offers", clinic.owner.token).arr().single().i("redemptions"))

            // The staff view records the applied offer in the price snapshot.
            val staffView = api.get("${clinic.base}/bookings/${booking.s("id")}", clinic.owner.token).obj()
            assertEquals(5000, staffView.i("originalPriceCents"))
            assertEquals(offer.s("id"), staffView["offer"]!!.o.s("id"))

            // Rescheduling keeps the price, so only to times the same offer covers.
            val manageSlots = api.get("/v1/public/manage/$token/availability?from=2026-10-06&to=2026-10-07").obj()["days"]!!.a
                .flatMap { d -> d.o["slots"]!!.a.map { it.s("start") } }
            assertTrue(
                manageSlots.isNotEmpty() && manageSlots.all { it.startsWith("2026-10-06T1") && it >= "2026-10-06T13" },
                manageSlots.toString(),
            )
            assertError(
                HttpStatusCode.Conflict, "POLICY_VIOLATION",
                api.post("/v1/public/manage/$token/reschedule", jsonOf("start" to "2026-10-07T10:00:00+01:00")),
            )
            assertStatus(HttpStatusCode.OK, api.post("/v1/public/manage/$token/reschedule", jsonOf("start" to "2026-10-06T15:00:00+01:00")))

            // Cancelling more than 24 hours ahead refunds the discounted amount in full.
            val cancelled = api.post("/v1/public/manage/$token/cancel", jsonOf("reason" to "Plans changed")).obj()
            assertEquals(4000, cancelled.i("amountRefundedCents"))
            assertEquals(
                0, api.get("${clinic.base}/offers", clinic.owner.token).arr().single().i("redemptions"),
                "a cancelled booking frees its redemption",
            )

            // Late cancellation (50% policy) refunds half of the discounted price.
            val late = Fixtures.book(api, clinic, "Paid consult", "2026-10-06T16:00:00+01:00")
            api.post(
                "/v1/public/dev-payments/${late["next"]!!.o.s("checkoutUrl").substringAfterLast('/')}/complete",
                jsonOf("outcome" to "succeeded"),
            )
            env.clock.advanceMinutes(60 * 12)
            assertEquals(2000, api.post("/v1/public/manage/${late.s("manageToken")}/cancel", null).obj().i("amountRefundedCents"))

            // Deposits are computed from the discounted price.
            val deposit = create(
                api, clinic,
                offerBody(
                    clinic, services = listOf("Deposit consult"),
                    discount = mapOf(
                        "type" to "percent", "percent" to 80,
                    ),
                    days = emptyList(), windows = emptyList(), name = "Deposit deal",
                ),
            )
            val dep = Fixtures.book(api, clinic, "Deposit consult", "2026-10-08T10:00:00+01:00")
            assertEquals(1600, dep["booking"]!!.o.i("priceCents"))
            assertEquals(1600, dep["booking"]!!.o.i("depositCents"))
            assertEquals(deposit.s("id"), dep["booking"]!!.o["offer"]!!.o.s("id"))
            val depPayment = dep["next"]!!.o.s("checkoutUrl").substringAfterLast('/')
            assertEquals(1600, api.get("/v1/public/dev-payments/$depPayment").obj()["payment"]!!.o.i("amountCents"))
            api.post("/v1/public/dev-payments/$depPayment/complete", jsonOf("outcome" to "succeeded"))

            // Reports: 4000 paid and refunded, 4000 paid and 2000 refunded, 1600 paid.
            val totals = api.get("${clinic.base}/reports/summary?from=2026-10-01&to=2026-10-31", clinic.owner.token).obj()["totals"]!!.o
            assertEquals(4000 - 4000 + 4000 - 2000 + 1600, totals.i("revenueCents"))
        }
    }

    @Test
    fun `capped offers stop at their redemption limit and the best offer wins`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val capped = create(
            api, clinic,
            offerBody(
                clinic, services = listOf("Approval consult"), days = emptyList(), windows = emptyList(),
                discount = mapOf("type" to "fixed", "amountCents" to 1000), max = 1, name = "First customer",
            ),
        )
        create(
            api, clinic,
            offerBody(
                clinic, services = listOf("Approval consult"), days = emptyList(), windows = emptyList(),
                discount = mapOf("type" to "percent", "percent" to 10), name = "Ten percent",
            ),
        )
        // €10 beats 10% of €30; once the capped offer is used up, 10% applies.
        val first = Fixtures.book(api, clinic, "Approval consult", "2026-10-07T10:00:00+01:00")["booking"]!!.o
        assertEquals(2000, first.i("priceCents"))
        assertEquals(capped.s("id"), first["offer"]!!.o.s("id"))
        val second = Fixtures.book(api, clinic, "Approval consult", "2026-10-07T11:00:00+01:00")["booking"]!!.o
        assertEquals(2700, second.i("priceCents"))
        assertEquals("Ten percent", second["offer"]!!.o.s("name"))
        assertEquals(1, api.get("${clinic.base}/offers", clinic.owner.token).arr().first { it.s("id") == capped.s("id") }.i("redemptions"))
        // A paused offer no longer applies.
        api.get("${clinic.base}/offers", clinic.owner.token).arr().forEach {
            api.post("${clinic.base}/offers/${it.s("id")}/pause", null, clinic.owner.token)
        }
        val third = Fixtures.book(api, clinic, "Approval consult", "2026-10-07T12:00:00+01:00")["booking"]!!.o
        assertEquals(3000, third.i("priceCents"))
        assertEquals(JsonNull, third["offer"])
        assertEquals(JsonNull, third["originalPriceCents"])
        assertEquals(0, api.get("${clinic.public}/offers").arr().size, "paused offers are not public")
    }

    @Test
    fun `a booking shown a deal that has since run out is refused, not made at the full price`() = withApp { api ->
        // Regression: the customer saw "€20 with First customer", someone else took the deal's last redemption, and the
        // booking was made (and charged) at €30 without a word.
        val clinic = Fixtures.clinic(api)
        create(
            api, clinic,
            offerBody(
                clinic, services = listOf("Approval consult"), days = emptyList(), windows = emptyList(),
                discount = mapOf("type" to "fixed", "amountCents" to 1000), max = 1, name = "First customer",
            ),
        )
        suspend fun book(time: String, expected: Int?) = api.post(
            "${clinic.public}/bookings",
            JsonObject(
                parse(Fixtures.bookingBody(clinic, "Approval consult", "2026-10-07T$time:00+01:00")).jsonObject +
                    ("expectedTotalCents" to JsonPrimitive(expected)),
            ).toString(),
        )
        assertEquals(2000, slot(api, clinic, "Approval consult", "2026-10-07", "10:00")["offer"]!!.o.i("priceCents"))
        assertEquals(2000, slot(api, clinic, "Approval consult", "2026-10-07", "11:00")["offer"]!!.o.i("priceCents"))

        // The first customer gets the deal at the price they were shown.
        val first = book("10:00", 2000)
        assertStatus(HttpStatusCode.Created, first)
        assertEquals(2000, first.obj()["booking"]!!.o.i("priceCents"))

        // The second was shown the same deal at 11:00: it's gone, so nothing is booked and they're told the price.
        val refused = book("11:00", 2000)
        assertError(HttpStatusCode.Conflict, "PRICE_CHANGED", refused)
        assertTrue("€30" in refused.obj()["error"]!!.o.s("message"), refused.obj().toString())
        assertTrue(Fixtures.slots(api, clinic, "Approval consult", "2026-10-07").any { it.startsWith("2026-10-07T11:00") })

        // Booking again at the price now shown goes through; without an expected total it is booked as before.
        val again = book("11:00", 3000)
        assertStatus(HttpStatusCode.Created, again)
        assertEquals(3000, again.obj()["booking"]!!.o.i("priceCents"))
        assertStatus(HttpStatusCode.Created, book("12:00", null))
        assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", book("13:00", -1))
    }

    @Test
    fun `last-minute offers discount only slots starting soon`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        create(api, clinic, offerBody(clinic, days = emptyList(), windows = emptyList(), lastMinuteHours = 4, name = "Last minute"))
        // Now is Monday 09:00; 11:00 is within four hours, tomorrow is not.
        assertEquals(4000, slot(api, clinic, "Paid consult", "2026-10-05", "11:00")["offer"]!!.o.i("priceCents"))
        assertEquals(JsonNull, slot(api, clinic, "Paid consult", "2026-10-06", "11:00")["offer"])
        val offers = api.get("${clinic.public}/offers").arr()
        assertEquals("last_minute", offers.single().s("kind"))
    }
}
