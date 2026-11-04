package ie.bookanything.booking

import ie.bookanything.support.Api
import ie.bookanything.support.Clinic
import ie.bookanything.support.Money
import ie.bookanything.support.RecordingPaymentProvider
import ie.bookanything.support.TestEnv
import ie.bookanything.support.a
import ie.bookanything.support.assertError
import ie.bookanything.support.assertStatus
import ie.bookanything.support.createBusiness
import ie.bookanything.support.everyDay
import ie.bookanything.support.i
import ie.bookanything.support.jsonOf
import ie.bookanything.support.o
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.sOrNull
import ie.bookanything.support.testBusiness
import ie.bookanything.support.withApp
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import java.time.Duration
import java.time.OffsetDateTime
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * What a booking costs, end to end: public availability (duration and offer price of the selection) → booking (price,
 * deposit, status) → the amount the payment provider is asked to charge → what the customer has paid.
 */
class QuotePricingTest {
    private val wed = "2026-10-07"

    /** A car wash: options replace the duration and price, add-ons add both; one bay, so bookings must not overlap. */
    private val carWash = testBusiness("Suds Car Wash") {
        val bay = space("Bay", hours = everyDay("08:00", "20:00"))
        service("Wash", 30) {
            price(2000); option("Large car", 45, 2500); option("Van", 60, 3500); addon("Wax", 15, 800); addon("Interior", 30, 1500)
            needs("Bay", bay); every(15)
        }
        service("Valet", 60) {
            deposit(10_000, 3000); option("Mini", 30, 2000); option("Full", 60, 10_000); addon("Polish", 30, 4000)
            needs("Bay", bay); every(15)
        }
        service("Tyre check", 15) { needs("Bay", bay) }
        service("Pay at the bay", 30) { atVenue(1500); addon("Wax", 15, 800); needs("Bay", bay); every(15) }
        // Paid online, but only its options carry a price.
        service("Detail", 30) { price(0); option("Full detail", 60, 9000); needs("Bay", bay); every(15) }
    }

    /** One priced selection and what it must cost. [dueNow] null: nothing is charged online. */
    private data class Case(
        val name: String, val service: String, val option: String?, val addons: List<String>, val time: String,
        val minutes: Int, val price: Int, val dueNow: Int?, val status: String, val paymentStatus: String,
    )

    private val cases = listOf(
        Case("option replaces duration and price", "Wash", "Large car", emptyList(), "08:00", 45, 2500, 2500, "held", "pending"),
        Case("add-on adds minutes and price", "Wash", "Large car", listOf("Wax"), "09:00", 60, 3300, 3300, "held", "pending"),
        Case("two add-ons on the biggest option", "Wash", "Van", listOf("Wax", "Interior"), "10:00", 105, 5800, 5800, "held", "pending"),
        Case("deposit service charges only the deposit", "Valet", "Full", listOf("Polish"), "12:00", 90, 14_000, 3000, "held", "pending"),
        Case("a deposit above the price is capped at the price", "Valet", "Mini", emptyList(), "14:00", 30, 2000, 2000, "held", "pending"),
        Case("free services charge nothing", "Tyre check", null, emptyList(), "15:00", 15, 0, null, "confirmed", "not_required"),
        Case(
            "an online-payment service priced by its option charges it", "Detail", "Full detail", emptyList(), "17:00", 60, 9000, 9000,
            "held", "pending",
        ),
        Case(
            "pay at the venue charges nothing online", "Pay at the bay", null, listOf("Wax"), "16:00", 45, 2300, null, "confirmed",
            "pay_at_venue",
        ),
    )

    @Test
    fun `the price quoted for a selection is what the booking costs and what the provider is asked to charge`() {
        val payments = RecordingPaymentProvider()
        val env = TestEnv(payments = payments)
        withApp(env) { api ->
            val shop = api.createBusiness(carWash)
            for (c in cases) {
                val optionId = c.option?.let { Money.ids(api, shop, c.service).getValue(it) }
                val addonIds = Money.ids(api, shop, c.service, "addons").let { ids -> c.addons.map(ids::getValue) }
                val start = "${wed}T${c.time}:00+01:00"

                val availability = availability(api, shop, c.service, optionId, addonIds)
                assertEquals(c.minutes, availability.i("durationMinutes"), c.name)
                val slot = availability["days"]!!.a.single().o["slots"]!!.a.map { it.o }.single { it.s("start") == start }
                assertEquals(c.minutes.toLong(), minutesBetween(slot.s("start"), slot.s("end")), c.name)

                val result = Money.book(api, shop, c.service, start, optionId, addonIds)
                val booking = result["booking"]!!.o
                assertEquals(c.status, booking.s("status"), c.name)
                assertEquals(c.paymentStatus, booking.s("paymentStatus"), c.name)
                assertEquals(c.price, booking.i("priceCents"), c.name)
                assertEquals(c.minutes.toLong(), minutesBetween(booking.s("start"), booking.s("end")), c.name)
                assertEquals(c.option, booking["option"].takeIf { it != JsonNull }?.o?.s("name"), c.name)
                assertEquals(c.addons, booking["addons"]!!.a.map { it.s("name") }, c.name)
                if (c.dueNow == null) {
                    assertNull(result["next"]!!.sOrNull("checkoutUrl"), c.name)
                    assertTrue(payments.checkouts.none { it.bookingId.toString() == booking.s("id") }, c.name)
                    continue
                }
                assertEquals(c.dueNow, payments.chargedFor(booking.s("id")), c.name)
                if (c.service == "Valet") assertEquals(c.dueNow, booking.i("depositCents"), c.name)
                Money.pay(api, result)
                val paid = Money.view(api, result)
                assertEquals("confirmed", paid.s("status"), c.name)
                assertEquals(c.dueNow, paid.i("amountPaidCents"), c.name)
                assertEquals("paid", paid.s("paymentStatus"), c.name)
                assertEquals(listOf("charge succeeded ${c.dueNow}"), Money.ledger(booking.s("id")), c.name)
            }
        }
    }

    @Test
    fun `a service with options can't be booked without one, and unknown options or add-ons are field errors`() = withApp { api ->
        val shop = api.createBusiness(carWash)
        val start = "${wed}T08:00:00+01:00"
        val wax = Money.ids(api, shop, "Wash", "addons").getValue("Wax")
        val polish = Money.ids(api, shop, "Valet", "addons").getValue("Polish")
        val mini = Money.ids(api, shop, "Valet").getValue("Mini")
        suspend fun post(body: String) = api.post("${shop.public}/bookings", body)
        assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", post(Money.bookingBody(shop, "Wash", start, addonIds = listOf(wax))))
        assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", post(Money.bookingBody(shop, "Wash", start, optionId = mini)))
        val large = Money.ids(api, shop, "Wash").getValue("Large car")
        assertError(
            HttpStatusCode.BadRequest, "INVALID_REQUEST",
            post(Money.bookingBody(shop, "Wash", start, optionId = large, addonIds = listOf(polish))),
        )
        // The same add-on twice is counted once.
        val twice = Money.book(api, shop, "Wash", start, optionId = large, addonIds = listOf(wax, wax))["booking"]!!.o
        assertEquals(3300, twice.i("priceCents"))
        assertEquals(1, twice["addons"]!!.a.size)
    }

    @Test
    fun `offers discount the whole selection, the best one wins and a price never goes below zero`() {
        val payments = RecordingPaymentProvider()
        val env = TestEnv(payments = payments)
        withApp(env) { api ->
            val shop = api.createBusiness(carWash)
            val wash = Money.ids(api, shop, "Wash")
            val addons = Money.ids(api, shop, "Wash", "addons")
            val valet = Money.ids(api, shop, "Valet")
            val polish = Money.ids(api, shop, "Valet", "addons").getValue("Polish")
            // Mornings: 20% off or €10 off the Wash, whichever is more; afternoons: €99.99 off; evenings: 90% off the Valet.
            offer(api, shop, "Wash", "Twenty percent", mapOf("type" to "percent", "percent" to 20), "08:00", "12:00")
            offer(api, shop, "Wash", "Tenner off", mapOf("type" to "fixed", "amountCents" to 1000), "08:00", "12:00")
            offer(api, shop, "Wash", "On the house", mapOf("type" to "fixed", "amountCents" to 9999), "13:00", "14:00")
            offer(api, shop, "Valet", "Nearly free valet", mapOf("type" to "percent", "percent" to 90), "17:00", "19:00")

            data class OfferCase(
                val name: String, val service: String, val option: String, val addons: List<String>, val time: String,
                val original: Int, val price: Int, val offer: String, val dueNow: Int?,
            )
            val offerCases = listOf(
                OfferCase(
                    "fixed beats percent on a small price", "Wash", "Large car", emptyList(), "08:00", 2500, 1500, "Tenner off", 1500,
                ),
                OfferCase(
                    "percent beats fixed on a big price and covers add-ons", "Wash", "Van", listOf("Wax", "Interior"), "09:00",
                    5800, 4640, "Twenty percent", 4640,
                ),
                OfferCase(
                    "a discount larger than the price makes it free", "Wash", "Large car", listOf("Wax"), "13:00", 3300, 0, "On the house",
                    null,
                ),
                OfferCase(
                    "a deposit above the discounted price is capped at it", "Valet", "Full", listOf("Polish"), "17:00", 14_000, 1400,
                    "Nearly free valet", 1400,
                ),
            )
            for (c in offerCases) {
                val optionId = (if (c.service == "Wash") wash else valet).getValue(c.option)
                val addonIds = c.addons.map { if (c.service == "Wash") addons.getValue(it) else polish }
                val start = "${wed}T${c.time}:00+01:00"
                val slot = availability(api, shop, c.service, optionId, addonIds)["days"]!!.a.single().o["slots"]!!.a.map { it.o }
                    .single { it.s("start") == start }
                val slotOffer = slot["offer"]!!.o
                assertEquals(
                    "${c.offer}: ${c.original} to ${c.price}",
                    "${slotOffer.s("name")}: ${slotOffer.i("originalPriceCents")} to ${slotOffer.i("priceCents")}", c.name,
                )

                val result = Money.book(api, shop, c.service, start, optionId, addonIds)
                val booking = result["booking"]!!.o
                assertEquals(c.price, booking.i("priceCents"), c.name)
                assertEquals(c.original, booking.i("originalPriceCents"), c.name)
                assertEquals(c.original - c.price, booking["offer"]!!.o.i("discountCents"), c.name)
                if (c.dueNow == null) {
                    assertEquals(listOf("confirmed", "not_required"), listOf(booking.s("status"), booking.s("paymentStatus")), c.name)
                    assertNull(result["next"]!!.sOrNull("checkoutUrl"), c.name)
                    assertTrue(Money.ledger(booking.s("id")).isEmpty(), c.name)
                } else {
                    assertEquals("held", booking.s("status"), c.name)
                    assertEquals(c.dueNow, payments.chargedFor(booking.s("id")), c.name)
                }
            }
        }
    }

    @Test
    fun `a staff booking that collects online charges the same quote as a public one`() {
        val payments = RecordingPaymentProvider()
        val env = TestEnv(payments = payments)
        withApp(env) { api ->
            val shop = api.createBusiness(carWash)
            val res = api.post(
                "${shop.base}/bookings",
                jsonOf(
                    "serviceId" to shop.service("Wash"), "optionId" to Money.ids(api, shop, "Wash").getValue("Van"),
                    "addonIds" to listOf(Money.ids(api, shop, "Wash", "addons").getValue("Interior")), "start" to "${wed}T11:00:00+01:00",
                    "customer" to mapOf("name" to "Walk In", "email" to "walk.in@example.test"), "paymentMode" to "collect_online",
                    "notifyCustomer" to false,
                ),
                shop.owner.token,
            )
            assertStatus(HttpStatusCode.Created, res)
            val booking = res.obj()
            assertEquals("held", booking.s("status"))
            assertEquals(5000, booking.i("priceCents"))
            assertEquals(90L, minutesBetween(booking.s("start"), booking.s("end")))
            assertEquals(5000, payments.chargedFor(booking.s("id")))
        }
    }

    private suspend fun availability(api: Api, shop: Clinic, service: String, optionId: String?, addonIds: List<String>): JsonObject {
        val query = buildString {
            append("${shop.public}/availability?serviceId=${shop.service(service)}&from=$wed&to=$wed")
            optionId?.let { append("&optionId=$it") }
            if (addonIds.isNotEmpty()) append("&addonIds=${addonIds.joinToString(",")}")
        }
        val res = api.get(query)
        assertStatus(HttpStatusCode.OK, res)
        return res.obj()
    }

    private suspend fun offer(api: Api, shop: Clinic, service: String, name: String, discount: Map<String, Any>, from: String, to: String) {
        val body = jsonOf(
            "name" to name, "description" to null, "serviceIds" to listOf(shop.service(service)), "discount" to discount,
            "schedule" to
                mapOf(
                    "daysOfWeek" to emptyList<Int>(), "timeWindows" to listOf(mapOf("start" to from, "end" to to)),
                    "lastMinuteHours" to null,
                ),
            "validFrom" to null, "validUntil" to null, "maxRedemptions" to null, "active" to true,
        )
        assertStatus(HttpStatusCode.Created, api.post("${shop.base}/offers", body, shop.owner.token))
    }

    private fun minutesBetween(start: String, end: String): Long =
        Duration.between(OffsetDateTime.parse(start), OffsetDateTime.parse(end)).toMinutes()
}
