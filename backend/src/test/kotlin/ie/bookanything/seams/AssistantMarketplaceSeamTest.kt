package ie.bookanything.seams

import ie.bookanything.ai.ChatBlock
import ie.bookanything.seed.DemoSeeder
import ie.bookanything.support.Api
import ie.bookanything.support.Bo
import ie.bookanything.support.Clinic
import ie.bookanything.support.FakeModelClient
import ie.bookanything.support.Fixtures
import ie.bookanything.support.MarketplaceFixtures
import ie.bookanything.support.MutableClock
import ie.bookanything.support.Roles
import ie.bookanything.support.TestCredits
import ie.bookanything.support.TestEnv
import ie.bookanything.support.TestUser
import ie.bookanything.support.a
import ie.bookanything.support.arr
import ie.bookanything.support.assertStatus
import ie.bookanything.support.devToken
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
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Where Bo and AI metering (docs/architecture.md sections 16-17) meet the marketplace and deals (sections 18-19):
 * Bo's bookings are priced like the dashboard's, both features' routes share one role matrix, and the demo seed
 * (sites, marketplace listings, deals) stays idempotent with Bo reading what it seeds.
 */
class AssistantMarketplaceSeamTest {
    private val model = FakeModelClient()
    private val env = TestEnv(clock = MutableClock(ie.bookanything.support.DEFAULT_NOW), modelClient = model) // Monday 5 Oct 2026

    private fun toolResults(): List<JsonObject> = model.conversations.last().messages.flatMap { it.blocks }
        .filterIsInstance<ChatBlock.ToolResult>().map { parse(it.content).jsonObject }

    private fun JsonObject.deal(): String? = this["deal"]?.takeUnless { it is JsonNull }?.jsonPrimitive?.content

    private fun changes(action: JsonObject) = action["proposal"]!!.o["changes"]!!.a.associate { it.s("label") to it.s("after") }

    /** A 20% Tuesday-afternoon deal on "Paid consult" (€50). */
    private suspend fun tuesdayDeal(api: Api, clinic: Clinic) = assertStatus(
        HttpStatusCode.Created,
        api.post(
            "${clinic.base}/offers",
            jsonOf(
                "name" to "Tuesday afternoons", "serviceIds" to listOf(clinic.service("Paid consult")),
                "discount" to mapOf("type" to "percent", "percent" to 20),
                "schedule" to mapOf("daysOfWeek" to listOf(2), "timeWindows" to listOf(mapOf("start" to "13:00", "end" to "17:00"))),
            ),
            clinic.owner.token,
        ),
    )

    @Test
    fun `Bo books into an offer window with the deal previewed, and the booking keeps the discounted price snapshot`() =
        withApp(env) { api ->
            val clinic = Fixtures.clinic(api)
            tuesdayDeal(api, clinic)
            val alex = clinic.resource("Alex")
            model.script(
                """{"rules": [{"match": ["book"], "steps": [
            {"tools": [{"name": "check_availability", "input": {"serviceId": "${clinic.service("Paid consult")}", "date": "2026-10-06", "days": 1, "resourceId": "$alex", "optionId": null}}]},
            {"tools": [{"name": "create_booking", "input": {
                "serviceId": "${clinic.service("Paid consult")}", "optionId": null, "start": "2026-10-06T14:00:00+01:00", "resourceIds": ["$alex"],
                "customerId": null, "newCustomer": {"name": "Robin Example", "email": "robin@example.test", "phone": null},
                "paymentMode": "collect_online", "notifyCustomer": false, "internalNotes": null}}]},
            {"text": "Ready to confirm."}
        ]}]}""",
            )
            val events = Bo.send(
                api, clinic, clinic.owner.token, Bo.thread(api, clinic, clinic.owner.token), "Book Robin in on Tuesday afternoon",
            )

            // check_availability names the deal on the times it covers, and only those.
            val slots = toolResults().first()["days"]!!.a.single().o["slots"]!!.a.map { it.o }
            val deal = "Tuesday afternoons (20% off): €40 instead of €50"
            assertEquals(deal, slots.single { it.s("time") == "14:00" }.deal())
            assertNull(slots.single { it.s("time") == "10:00" }.deal())

            // The proposal previews the price the booking engine will charge.
            val action = events.single { it.type == "proposal" }.data["action"]!!.o
            assertEquals("$deal · pay online (a payment link is emailed)", changes(action)["Price"])
            assertTrue(action["proposal"]!!.o["warnings"]!!.a.any { it.jsonPrimitive.content.contains("held until the customer pays") })

            // Confirming books through BookingEngine.create: discounted price, snapshot and audit, as the ai actor.
            assertStatus(HttpStatusCode.OK, Bo.confirm(api, clinic, clinic.owner.token, action.s("id")))
            val id = Fixtures.sqlOne(
                "SELECT id::text FROM bookings WHERE business_id = ?::uuid AND source = 'ai'", clinic.id,
            ) { it.getString(1) }!!
            val detail = api.get("${clinic.base}/bookings/$id", clinic.owner.token).obj()
            assertEquals(listOf(4000, 5000), listOf(detail.i("priceCents"), detail.i("originalPriceCents")))
            assertEquals(
                listOf("Tuesday afternoons", "20% off", "1000"),
                detail["offer"]!!.o.let { listOf(it.s("name"), it.s("label"), it.s("discountCents")) },
            )
            assertEquals("held", detail.s("status"))
            val audit = Fixtures.sqlOne(
                "SELECT actor_type::text || '|' || (summary->>'offer') || '|' || (summary->>'discountCents') FROM audit_events WHERE " +
                    "entity_id = ?::uuid AND action = 'booking.created'",
                id,
            ) { it.getString(1) }
            assertEquals("ai|Tuesday afternoons|1000", audit)
            assertEquals(1, api.get("${clinic.base}/offers", clinic.owner.token).arr().single().i("redemptions"))

            // Bo's read tools show the snapshot, and its payment link asks for the discounted amount.
            model.script(
                """{"rules": [{"match": ["*"], "steps": [
            {"tools": [{"name": "get_schedule", "input": {"date": "2026-10-06", "days": 1, "resourceId": null}}]},
            {"tools": [{"name": "send_payment_link", "input": {"bookingId": "$id"}}]},
            {"text": "Done."}
        ]}]}""",
            )
            val linkEvents = Bo.send(api, clinic, clinic.owner.token, Bo.thread(api, clinic, clinic.owner.token), "Send Robin the link")
            val scheduled = toolResults().first()["days"]!!.a.single().o["bookings"]!!.a.single().o
            assertEquals(listOf("€40", deal), listOf(scheduled.s("price"), scheduled.deal()))
            assertEquals("€40", changes(linkEvents.single { it.type == "proposal" }.data["action"]!!.o)["Amount"])

            // The dashboard prices the same time the same way: staff availability flags the deal and a staff booking gets it.
            val staffSlot = api.get(
                "${clinic.base}/availability?serviceId=${clinic.service("Paid consult")}&from=2026-10-06&to=2026-10-06&resourceId=$alex",
                clinic.owner.token,
            )
                .obj()["days"]!!.a.single().o["slots"]!!.a.first { it.s("start").contains("T15:00") }.o
            assertEquals(4000, staffSlot["offer"]!!.o.i("priceCents"))
            val dashboard = api.post(
                "${clinic.base}/bookings",
                jsonOf(
                    "serviceId" to clinic.service("Paid consult"), "start" to "2026-10-06T15:00:00+01:00", "resourceIds" to listOf(alex),
                    "customer" to mapOf("name" to "Sam Sample", "email" to "sam@example.test"), "paymentMode" to "at_venue",
                    "notifyCustomer" to false,
                ),
                clinic.owner.token,
            )
            assertStatus(HttpStatusCode.Created, dashboard)
            assertEquals(listOf(4000, 5000), dashboard.obj().let { listOf(it.i("priceCents"), it.i("originalPriceCents")) })
        }

    @Test
    fun `AI usage, assistant, marketplace and offer routes share one role matrix`() = withApp(env) { api ->
        val clinic = Fixtures.clinic(api)
        MarketplaceFixtures.setPlan(clinic, "pro")
        val roles = Roles.of(api, clinic)
        model.script("""{"rules": [{"match": ["*"], "steps": [{"text": "Hi."}]}]}""")
        val b = clinic.base
        Roles.check(roles, "GET /ai/usage", "admin", HttpStatusCode.OK) { t -> api.get("$b/ai/usage", t) }
        Roles.check(roles, "GET /assistant", "staff", HttpStatusCode.OK) { t -> api.get("$b/assistant", t) }
        Roles.check(roles, "GET /marketplace", "admin", HttpStatusCode.OK) { t -> api.get("$b/marketplace", t) }
        Roles.check(roles, "PUT /marketplace", "admin", HttpStatusCode.OK) { t ->
            api.put("$b/marketplace", jsonOf("listed" to true, "category" to "physio"), t)
        }
        Roles.check(roles, "GET /offers", "admin", HttpStatusCode.OK) { t -> api.get("$b/offers", t) }
        Roles.check(roles, "POST /offers/preview", "admin", HttpStatusCode.OK) { t ->
            api.post(
                "$b/offers/preview",
                jsonOf(
                    "offer" to mapOf(
                        "name" to "Draft", "serviceIds" to listOf(clinic.service("Paid consult")),
                        "discount" to mapOf("type" to "percent", "percent" to 10), "schedule" to mapOf("daysOfWeek" to listOf(2)),
                    ),
                    "days" to 7,
                ),
                t,
            )
        }
        // Public marketplace reads stay open to everyone, signed in or not.
        for ((who, token) in roles.all) {
            assertEquals(HttpStatusCode.OK, api.get("/v1/public/marketplace/search?q=${clinic.slug}", token).status, who)
            assertEquals(HttpStatusCode.OK, api.get("${clinic.public}/offers", token).status, who)
        }
        // Both read the same plan: the Pro plan that allows the listing also sets the AI allowance.
        val usage = api.get("$b/ai/usage", clinic.owner.token).obj()
        assertEquals(
            listOf("pro", TestCredits.shown(TestCredits.micro(TestCredits.allowances.pro))),
            listOf(usage.s("plan"), usage["credits"]!!.o.s("limit")),
        )
        assertEquals("true", api.get("$b/marketplace", clinic.owner.token).obj().s("listed"))
    }

    @Test
    fun `seed-demo with the site, marketplace and deal seeds is idempotent, and Bo reads the seeded deal`() = withApp(env) { api ->
        val seeder = DemoSeeder(env.ctx)
        seeder.seed()
        val counts = { demoCounts() }
        val first = counts()
        seeder.seed()
        seeder.seed()
        assertEquals(first, counts())
        assertTrue(
            first.getValue("offers") >= 2 && first.getValue("marketplace_listings") >= 3 && first.getValue("business_sites") >= 4,
            first.toString(),
        )

        // Gleam's seeded "Off-peak Tuesday afternoons" deal shows on the dashboard's availability for Tuesday 6 October,
        // and Bo, as the demo owner, books into it at the discounted price.
        val owner = TestUser(devToken("dev_owner", "owner@bookanything.test", "Avery Morgan"), "owner@bookanything.test")
        val id = Fixtures.sqlOne("SELECT id::text FROM businesses WHERE slug = 'gleam-car-wash'") { it.getString(1) }!!
        val services = api.get("/v1/businesses/$id/services", owner.token).arr().associate { it.s("name") to it.s("id") }
        val gleam = Clinic(id, "gleam-car-wash", owner, services, emptyMap(), emptyMap(), emptyMap())
        val slots = api.get(
            "${gleam.base}/availability?serviceId=${gleam.service("Exterior wash")}&from=2026-10-06&to=2026-10-06", owner.token,
        )
            .obj()["days"]!!.a.single().o["slots"]!!.a.map { it.o }
        val (discounted, full) = slots.partition { it["offer"] != null && it["offer"] !is JsonNull }
        assertTrue(discounted.isNotEmpty() && discounted.all { it.s("start").substring(11, 16) in "13:00".."16:59" }, discounted.toString())
        assertTrue(full.none { it.s("start").substring(11, 16) in "13:00".."16:59" })
        val start = discounted.first().s("start")
        model.script(
            """{"rules": [{"match": ["*"], "steps": [
            {"tools": [{"name": "create_booking", "input": {
                "serviceId": "${gleam.service("Exterior wash")}", "optionId": null, "start": "$start", "resourceIds": null, "customerId": null,
                "newCustomer": {"name": "Robin Example", "email": null, "phone": null}, "paymentMode": "at_venue", "notifyCustomer": false, "internalNotes": null}}]},
            {"text": "Ready."}
        ]}]}""",
        )
        val events = Bo.send(
            api, gleam, owner.token, Bo.thread(api, gleam, owner.token), "Book Robin in for an exterior wash on Tuesday afternoon",
        )
        val action = events.single { it.type == "proposal" }.data["action"]!!.o
        assertTrue(changes(action)["Price"]!!.startsWith("Off-peak Tuesday afternoons (20% off): "), changes(action).toString())
        assertStatus(HttpStatusCode.OK, Bo.confirm(api, gleam, owner.token, action.s("id")))
        val snapshot = Fixtures.sqlOne(
            "SELECT offer_snapshot->>'name' FROM bookings WHERE business_id = ?::uuid AND source = 'ai'", id,
        ) { it.getString(1) }
        assertEquals("Off-peak Tuesday afternoons", snapshot)

        // Seeding again leaves Bo's conversation, its booking and its two metered model calls alone, and adds nothing.
        seeder.seed()
        val plusBo = mapOf("bookings" to 1, "customers" to 1, "ai_usage" to 2).mapValues { (t, n) -> first.getValue(t) + n }
        assertEquals(first + plusBo, counts())
        assertEquals(1L, Fixtures.sqlOne("SELECT count(*) FROM assistant_threads WHERE business_id = ?::uuid", id) { it.getLong(1) })
    }

    /** Row counts of the tables the demo seed writes, for the demo owners' businesses. */
    private fun demoCounts(): Map<String, Long> {
        val demo = "SELECT m.business_id FROM business_members m JOIN users u ON u.id = m.user_id " +
            "WHERE m.role = 'owner' AND u.email IN ('owner@bookanything.test', 'market@bookanything.test')"
        val tables = listOf(
            "bookings", "customers", "resources", "services", "business_members", "business_sites", "site_versions",
            "business_locations", "marketplace_listings", "offers", "offer_services", "ai_usage",
        )
        return mapOf("businesses" to Fixtures.sqlOne("SELECT count(*) FROM businesses WHERE id IN ($demo)") { it.getLong(1) }!!) +
            tables.associateWith { t -> Fixtures.sqlOne("SELECT count(*) FROM $t WHERE business_id IN ($demo)") { it.getLong(1) }!! }
    }
}
