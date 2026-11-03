package ie.bookanything.business

import ie.bookanything.jobs.JobWorker
import ie.bookanything.support.Fixtures
import ie.bookanything.support.Fixtures.book
import ie.bookanything.support.TestEnv
import ie.bookanything.support.TestUser
import ie.bookanything.support.arr
import ie.bookanything.support.assertError
import ie.bookanything.support.assertStatus
import ie.bookanything.support.b
import ie.bookanything.support.i
import ie.bookanything.support.jsonOf
import ie.bookanything.support.o
import ie.bookanything.support.obj
import ie.bookanything.support.runTask
import ie.bookanything.support.s
import ie.bookanything.support.sOrNull
import ie.bookanything.support.unique
import ie.bookanything.support.withApp
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class TemplatesTest {
    @Test
    fun `every template creates a valid business with bookable availability`() = withApp { api ->
        val templates = api.get("/v1/public/templates").arr()
        assertEquals(
            setOf("physio", "car_wash", "music_lessons", "gp_practice", "salon", "fitness_class", "generic"),
            templates.map { it.s("key") }.toSet(),
        )
        val owner = TestUser.create("tpl-owner")
        for (t in templates) {
            val key = t.s("key")
            val business = api.createFromTemplate(key, owner)
            assertEquals("active", business.s("status"))
            assertEquals("owner", business.s("myRole"))
            val slug = business.s("slug")
            val services = api.get("/v1/public/businesses/$slug/services").arr()
            assertTrue(services.isNotEmpty(), "$key has public services")
            val groups = business["customerGroups"]!!.jsonArray.map { it.s("id") }
            var anySlots = false
            for (svc in services) {
                val allowed = svc.o["allowedGroupIds"]!!.jsonArray.map { it.toString().trim('"') }
                val groupParams = if (allowed.isNotEmpty()) listOf("&groupId=${allowed[0]}") else listOf("") + groups.map { "&groupId=$it" }
                val option = svc.o["options"]!!.jsonArray.firstOrNull()?.s("id")?.let { "&optionId=$it" }.orEmpty()
                for (g in groupParams) {
                    val res = api.get(
                        "/v1/public/businesses/$slug/availability?serviceId=${svc.s("id")}&from=2026-10-06&to=2026-10-19$option$g",
                    )
                    assertStatus(HttpStatusCode.OK, res)
                    val count = res.obj()["days"]!!.jsonArray.sumOf { it.o["slots"]!!.jsonArray.size }
                    if (count > 0) anySlots = true
                    if (g.isEmpty() && allowed.isEmpty()) {
                        assertTrue(
                            count > 0 || groups.isNotEmpty(), "$key/${svc.s("name")} has slots for guests",
                        )
                    }
                }
            }
            assertTrue(anySlots, "$key has bookable slots")
            // The dashboard views load for every template.
            val base = "/v1/businesses/${business.s("id")}"
            assertStatus(HttpStatusCode.OK, api.get("$base/overview", owner.token))
            assertStatus(HttpStatusCode.OK, api.get("$base/services", owner.token))
            assertStatus(HttpStatusCode.OK, api.get("$base/reports/summary?from=2026-10-01&to=2026-10-31", owner.token))
        }
        assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.get("/v1/public/templates/nope"))
    }

    @Test
    fun `AI draft falls back to the best matching template`() = withApp { api ->
        val user = TestUser.create("drafter")
        val res = api.post(
            "/v1/ai/business-draft",
            jsonOf("description" to "We are Shiny Wheels, a mobile car valeting and car wash business"), user.token,
        )
        assertStatus(HttpStatusCode.OK, res)
        val draft = res.obj()
        assertEquals("template", draft.s("source"))
        assertEquals("car_wash", draft.s("industry"))
        assertEquals("Shiny Wheels", draft.s("name"))
        // The draft can be created as-is.
        assertStatus(
            HttpStatusCode.Created,
            api.post("/v1/businesses", JsonObject(draft + mapOf("slug" to JsonPrimitive(unique("shiny")))).toString(), user.token),
        )
        assertError(
            HttpStatusCode.BadRequest, "INVALID_REQUEST", api.post("/v1/ai/business-draft", jsonOf("description" to ""), user.token),
        )
        assertError(HttpStatusCode.Unauthorized, "UNAUTHENTICATED", api.post("/v1/ai/business-draft", jsonOf("description" to "x")))
    }
}

class BusinessSettingsTest {
    @Test
    fun `slugs are validated, reserved and unique with suggestions`() = withApp { api ->
        val owner = TestUser.create("slugger")
        val clinic = Fixtures.clinic(api, owner)
        val taken = api.get("/v1/businesses/slug-available?slug=${clinic.slug}", owner.token).obj()
        assertEquals(false, taken.b("available"))
        assertTrue(taken.s("suggestion").startsWith(clinic.slug))
        assertEquals(false, api.get("/v1/businesses/slug-available?slug=dashboard", owner.token).obj().b("available"))
        // GET /v1/businesses/{idOrSlug} reads a UUID as an id, so no slug may look like one.
        val idShaped = "0b9f5c2e-6d1a-4c3b-9e8f-7a6b5c4d3e2f"
        val asId = api.get("/v1/businesses/slug-available?slug=$idShaped", owner.token).obj()
        assertEquals(false, asId.b("available"))
        assertEquals("$idShaped-booking", asId.s("suggestion"))
        // Next.js serves metadata routes at the site root: a business there would never be reachable.
        for (slug in listOf("opengraph-image", "twitter-image", "icon", "apple-icon", "manifest", "robots", "sitemap")) {
            assertEquals(false, api.get("/v1/businesses/slug-available?slug=$slug", owner.token).obj().b("available"), slug)
        }
        assertEquals(true, api.get("/v1/businesses/slug-available?slug=${unique("fresh")}", owner.token).obj().b("available"))
        val setup = api.get("/v1/public/templates/generic").obj()
        val dup = api.post("/v1/businesses", JsonObject(setup + mapOf("slug" to JsonPrimitive(clinic.slug))).toString(), owner.token)
        assertError(HttpStatusCode.Conflict, "SLUG_TAKEN", dup)
        val reserved = api.post("/v1/businesses", JsonObject(setup + mapOf("slug" to JsonPrimitive("admin"))).toString(), owner.token)
        assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", reserved)
        // No slug: generated from the name.
        val auto = api.post(
            "/v1/businesses", JsonObject(setup + mapOf("name" to JsonPrimitive("Café Ünïcode & Co"))).toString(), owner.token,
        )
        assertStatus(HttpStatusCode.Created, auto)
        assertTrue(auto.obj().s("slug").startsWith("cafe-unicode-and-co"))
    }

    @Test
    fun `a settings change applies to the business as it is when it commits, keeping a concurrent brand colour`() {
        // Regression: PATCH wrote every column from the business read before its transaction, so a brand colour set
        // meanwhile (publishing the site does) was written back to the old one.
        val env = TestEnv()
        withApp(env) { api ->
            val clinic = Fixtures.clinic(api)
            val id = UUID.fromString(clinic.id)
            val coloured = CountDownLatch(1)
            val colour = thread {
                env.db.txBlocking(id) { conn ->
                    BusinessRepository.setPrimaryColor(conn, id, "#123456")
                    coloured.countDown()
                    awaitTrue { waitingForBusinesses(env) } // commit only once the PATCH waits for this row
                }
            }
            assertTrue(coloured.await(20, TimeUnit.SECONDS))
            val res = api.patch(clinic.base, jsonOf("name" to "Renamed while colouring"), clinic.owner.token)
            colour.join()
            assertStatus(HttpStatusCode.OK, res)
            assertEquals("Renamed while colouring", res.obj().s("name"))
            assertEquals("#123456", res.obj()["branding"]!!.s("primaryColor"))
            assertEquals("#123456", api.get(clinic.base, clinic.owner.token).obj()["branding"]!!.s("primaryColor"))
        }
    }

    private fun waitingForBusinesses(env: TestEnv): Boolean = env.db.txBlocking(readOnly = true) { conn ->
        conn.prepareStatement(
            "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' " +
                "AND query ILIKE '%businesses%'",
        ).use { st -> st.executeQuery().use { rs -> rs.next() && rs.getLong(1) > 0 } }
    }

    private fun awaitTrue(condition: () -> Boolean) {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(20)
        while (!condition()) {
            check(System.nanoTime() < deadline) { "timed out" }
            Thread.onSpinWait()
        }
    }

    @Test
    fun `settings update, drafts are hidden publicly and delete suspends`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val t = clinic.owner.token
        val updated = api.patch(
            clinic.base,
            jsonOf(
                "name" to "Renamed Clinic", "contactEmail" to "hi@clinic.test", "timezone" to "Europe/London",
                "address" to mapOf("line1" to "1 Main St", "line2" to null, "city" to "Dublin", "postcode" to "D01"),
                "branding" to mapOf("primaryColor" to "#FF0000", "logoUrl" to "https://cdn.example.test/logo.png", "coverImageUrl" to null),
            ),
            t,
        )
        assertStatus(HttpStatusCode.OK, updated)
        val b = updated.obj()
        assertEquals("Renamed Clinic", b.s("name"))
        assertEquals("Europe/London", b.s("timezone"))
        assertEquals("#ff0000", b["branding"]!!.s("primaryColor"))
        assertEquals("1 Main St", b["address"]!!.s("line1"))
        assertEquals(true, b.b("showBadge"))
        assertEquals(true, b.b("paymentsEnabled"))

        // Nested objects merge: only holdMinutes changes.
        val merged = api.patch(clinic.base, jsonOf("policies" to mapOf("holdMinutes" to 20)), t).obj()["policies"]!!.o
        assertEquals(20, merged.i("holdMinutes"))
        assertEquals(50, merged.i("lateCancellationRefundPercent"))
        assertStatus(HttpStatusCode.OK, api.patch(clinic.base, jsonOf("status" to "draft"), t))
        assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.get(clinic.public))
        assertStatus(HttpStatusCode.OK, api.get(clinic.public, t)) // members can preview drafts
        assertStatus(HttpStatusCode.OK, api.patch(clinic.base, jsonOf("status" to "active"), t))
        assertStatus(HttpStatusCode.OK, api.get(clinic.public))

        val overview = api.get("${clinic.base}/overview", t).obj()
        assertEquals(
            setOf("services", "resources", "availability", "payments", "branding", "publish"),
            overview["checklist"]!!.jsonArray.map { it.s("key") }.toSet(),
        )
        assertTrue(overview["checklist"]!!.jsonArray.all { it.b("done") })

        assertError(
            HttpStatusCode.Forbidden, "FORBIDDEN",
            run {
                val admin = TestUser.create("adm")
                api.post("${clinic.base}/team/invitations", jsonOf("email" to admin.email, "role" to "admin"), t)
                api.get("/v1/me", admin.token)
                api.delete(clinic.base, admin.token)
            },
        )
        assertStatus(HttpStatusCode.NoContent, api.delete(clinic.base, t))
        assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.get(clinic.public))
        assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.get(clinic.base, t))
    }

    @Test
    fun `a business on a paid plan can't be deleted until the plan is cancelled in Billing`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        fun plan(plan: String, status: String?, subscription: String?) = Fixtures.sql(
            "UPDATE businesses SET plan = ?::business_plan, plan_status = ?, stripe_subscription_id = ?, stripe_customer_id = 'cus_x' " +
                "WHERE id = ?",
            plan, status, subscription, UUID.fromString(clinic.id),
        )
        // Stripe is billing (or retrying a failed payment for) the plan: deleting would leave it running.
        for (status in listOf("active", "trialing", "past_due")) {
            plan("pro", status, "sub_live")
            val refused = api.delete(clinic.base, clinic.owner.token)
            assertError(HttpStatusCode.Conflict, "CONFLICT", refused)
            assertTrue(refused.obj()["error"]!!.s("message").startsWith("Cancel your plan in Billing first."), status)
            assertStatus(HttpStatusCode.OK, api.get(clinic.public))
        }
        // Once Stripe has ended it (customer.subscription.deleted sets this), the business can go.
        plan("free", "canceled", null)
        assertStatus(HttpStatusCode.NoContent, api.delete(clinic.base, clinic.owner.token))
        assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.get(clinic.public))
    }

    @Test
    fun `a deleted business's customers can still see their bookings but not move or pay them, and get no reminders`() {
        val env = TestEnv()
        withApp(env) { api ->
            val clinic = Fixtures.clinic(api)
            val email = "${unique("suspended")}@example.test"
            val booked = book(api, clinic, "Consult", "2026-10-06T10:00:00+01:00", email = email)
            val held = book(api, clinic, "Paid consult", "2026-10-07T10:00:00+01:00")
            assertStatus(HttpStatusCode.NoContent, api.delete(clinic.base, clinic.owner.token))

            val manage = "/v1/public/manage/${booked.s("manageToken")}"
            val view = api.get(manage)
            assertStatus(HttpStatusCode.OK, view)
            assertEquals(false, view.obj().b("canReschedule"))
            val move = api.post("$manage/reschedule", jsonOf("start" to "2026-10-06T11:00:00+01:00"))
            assertError(HttpStatusCode.Conflict, "POLICY_VIOLATION", move)
            val pay = api.post("/v1/public/manage/${held.s("manageToken")}/pay")
            assertError(HttpStatusCode.Conflict, "POLICY_VIOLATION", pay)
            assertTrue(pay.obj()["error"]!!.s("message").contains("isn't taking bookings"))

            env.clock.advanceMinutes(2 * 60) // Tuesday 10:00 is now within a day
            JobWorker(env.ctx).runTask(env.ctx, "send-reminders")
            assertEquals(0, env.email.sent.count { it.to == email && it.template == "booking_reminder" })
        }
    }

    @Test
    fun `resources, rules, overrides, closures, groups, questions and services CRUD`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val t = clinic.owner.token
        val res = api.post(
            "${clinic.base}/resources", jsonOf("kind" to "equipment", "name" to "Ultrasound", "color" to "#123456", "capacity" to 1), t,
        )
        assertStatus(HttpStatusCode.Created, res)
        val rid = res.obj().s("id")
        val rules = api.put(
            "${clinic.base}/resources/$rid/rules",
            jsonOf(
                "rules" to listOf(
                    mapOf(
                        "dayOfWeek" to 1, "startTime" to "09:00", "endTime" to "12:00", "validFrom" to null, "validUntil" to null,
                        "audienceGroupIds" to emptyList<String>(),
                    ),
                    mapOf(
                        "dayOfWeek" to 3, "startTime" to "13:00", "endTime" to "17:30", "validFrom" to "2026-10-01",
                        "validUntil" to "2026-12-31",
                        "audienceGroupIds" to listOf(clinic.groups.getValue("Members")),
                    ),
                ),
            ),
            t,
        )
        assertStatus(HttpStatusCode.OK, rules)
        assertEquals(2, rules.obj()["rules"]!!.jsonArray.size)
        val override = api.post(
            "${clinic.base}/resources/$rid/overrides",
            jsonOf("date" to "2026-10-12", "isAvailable" to true, "startTime" to "18:00", "endTime" to "20:00"), t,
        )
        assertStatus(HttpStatusCode.Created, override)
        val closure = api.post(
            "${clinic.base}/closures", jsonOf("date" to "2026-12-25", "isAvailable" to false, "reason" to "Christmas"), t,
        )
        assertStatus(HttpStatusCode.Created, closure)
        assertEquals(null, closure.obj().sOrNull("resourceId"))
        assertEquals(1, api.get("${clinic.base}/closures", t).arr().size)
        val avail = api.get("${clinic.base}/resources/$rid/availability", t).obj()
        assertEquals(2, avail["rules"]!!.jsonArray.size)
        assertEquals("18:00", avail["overrides"]!!.jsonArray[0].s("startTime"))

        val svc = api.post(
            "${clinic.base}/services",
            jsonOf(
                "name" to "Scan", "durationMinutes" to 20, "priceCents" to 4000, "paymentMode" to "at_venue", "color" to "#abcdef",
                "options" to listOf(
                    mapOf("name" to "Single", "durationMinutes" to 20, "priceCents" to 4000),
                    mapOf("name" to "Double", "durationMinutes" to 40, "priceCents" to 7000),
                ),
                "addons" to listOf(mapOf("name" to "Report", "extraMinutes" to 10, "priceCents" to 1500)),
                "requirements" to listOf(
                    mapOf(
                        "label" to "Machine", "quantity" to 1, "customerSelectable" to false,
                        "resourceIds" to listOf(rid),
                    ),
                ),
            ),
            t,
        )
        assertStatus(HttpStatusCode.Created, svc)
        val service = svc.obj()
        val optionIds = service["options"]!!.jsonArray.map { it.s("id") }
        // PUT keeps ids of items matched by id or name.
        val put = api.put(
            "${clinic.base}/services/${service.s("id")}",
            jsonOf(
                "name" to "Scan+", "durationMinutes" to 20, "priceCents" to 4500, "paymentMode" to "at_venue",
                "options" to listOf(mapOf("id" to optionIds[0], "name" to "Single scan", "durationMinutes" to 25, "priceCents" to 4500)),
                "addons" to emptyList<Any>(),
                "requirements" to listOf(mapOf("label" to "Machine", "resourceIds" to listOf(rid))),
            ),
            t,
        ).obj()
        assertEquals(listOf(optionIds[0]), put["options"]!!.jsonArray.map { it.s("id") })
        assertEquals(0, put["addons"]!!.jsonArray.size)
        val requirement = put["requirements"]!!.jsonArray.single().o
        assertEquals(service["requirements"]!!.jsonArray.single().s("id"), requirement.s("id"), "matched by label")
        assertEquals(listOf(JsonPrimitive(rid)), requirement["resourceIds"]!!.jsonArray.toList())

        val group = api.post("${clinic.base}/customer-groups", jsonOf("name" to "Students", "restricted" to false), t)
        assertStatus(HttpStatusCode.Created, group)
        assertEquals(
            "Uni students",
            api.patch("${clinic.base}/customer-groups/${group.obj().s("id")}", jsonOf("name" to "Uni students"), t).obj().s("name"),
        )
        assertStatus(HttpStatusCode.NoContent, api.delete("${clinic.base}/customer-groups/${group.obj().s("id")}", t))
        val q = api.post(
            "${clinic.base}/questions",
            jsonOf("label" to "Allergies?", "kind" to "select", "options" to listOf("None", "Latex"), "serviceId" to service.s("id")), t,
        )
        assertStatus(HttpStatusCode.Created, q)
        assertEquals(true, api.patch("${clinic.base}/questions/${q.obj().s("id")}", jsonOf("required" to true), t).obj().b("required"))
        assertStatus(HttpStatusCode.NoContent, api.delete("${clinic.base}/questions/${q.obj().s("id")}", t))

        // Deleting a booked resource/service deactivates it instead.
        book(api, clinic, "Consult", "2026-10-07T09:00:00+01:00", resourceId = clinic.resource("Alex"))
        assertStatus(HttpStatusCode.NoContent, api.delete("${clinic.base}/resources/${clinic.resource("Alex")}", t))
        assertEquals(false, api.get("${clinic.base}/resources", t).arr().first { it.s("id") == clinic.resource("Alex") }.b("isActive"))
        assertStatus(HttpStatusCode.NoContent, api.delete("${clinic.base}/services/${clinic.service("Consult")}", t))
        assertEquals(false, api.get("${clinic.base}/services", t).arr().first { it.s("id") == clinic.service("Consult") }.b("isActive"))
        assertStatus(HttpStatusCode.NoContent, api.delete("${clinic.base}/resources/$rid", t))
        val audit = api.get("${clinic.base}/audit?limit=5", t).obj()
        assertEquals(5, audit["items"]!!.jsonArray.size)
        assertTrue(audit.sOrNull("nextCursor") != null)
    }
}

class ReportsAndJobsTest {
    @Test
    fun `reports aggregate bookings, revenue and utilisation`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val held = book(api, clinic, "Paid consult", "2026-10-07T10:00:00+01:00", resourceId = clinic.resource("Alex"))
        api.post(
            "/v1/public/dev-payments/${held["next"]!!.s("checkoutUrl").substringAfterLast('/')}/complete", jsonOf("outcome" to "succeeded"),
        )
        val c = book(api, clinic, "Consult", "2026-10-08T10:00:00+01:00")
        api.post("/v1/public/manage/${c.s("manageToken")}/cancel")
        val r = api.get("${clinic.base}/reports/summary?from=2026-10-05&to=2026-10-11", clinic.owner.token).obj()
        assertEquals(2, r["totals"]!!.i("bookings"))
        assertEquals(1, r["totals"]!!.i("confirmed"))
        assertEquals(1, r["totals"]!!.i("cancelled"))
        assertEquals(5000, r["totals"]!!.i("revenueCents"))
        assertEquals(2, r["totals"]!!.i("newCustomers"))
        assertEquals(7, r["byDay"]!!.jsonArray.size)
        assertEquals(5000, r["byDay"]!!.jsonArray.first { it.s("date") == "2026-10-07" }.i("revenueCents"))
        val alex = r["byResource"]!!.jsonArray.first { it.s("resourceId") == clinic.resource("Alex") }
        assertEquals(60, alex.i("bookedMinutes"))
        // Mon–Fri 09:00–17:00 plus the Saturday 09:00–12:00 window (audience does not matter for capacity).
        assertEquals(5 * 8 * 60 + 3 * 60, alex.i("availableMinutes"))
        assertError(
            HttpStatusCode.BadRequest, "INVALID_REQUEST", api.get("${clinic.base}/reports/summary?from=2026-10-05", clinic.owner.token),
        )
    }

    @Test
    fun `the audit log pages through every event, also those recorded in one transaction`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val t = clinic.owner.token
        // Completing a payment records payment.succeeded and booking.confirmed in one transaction (the same occurred_at).
        repeat(2) { i ->
            val held = book(api, clinic, "Paid consult", "2026-10-0${7 + i}T10:00:00+01:00", resourceId = clinic.resource("Alex"))
            api.post(
                "/v1/public/dev-payments/${held["next"]!!.s("checkoutUrl").substringAfterLast('/')}/complete",
                jsonOf("outcome" to "succeeded"),
            )
        }
        val all = api.get("${clinic.base}/audit?limit=200", t).obj()["items"]!!.jsonArray.map { it.s("id") }
        val paged = mutableListOf<String>()
        var cursor: String? = null
        do {
            val page = api.get("${clinic.base}/audit?limit=1" + cursor?.let { "&cursor=$it" }.orEmpty(), t).obj()
            paged += page["items"]!!.jsonArray.map { it.s("id") }
            cursor = page.sOrNull("nextCursor")
        } while (cursor != null && paged.size <= all.size)
        assertEquals(all, paged)
    }

    @Test
    fun `reminders are sent once, past bookings auto-complete and failing jobs back off`() {
        val env = TestEnv()
        withApp(env) { api ->
            val clinic = Fixtures.clinic(api)
            val email = "${unique("remind")}@example.test"
            val b = book(api, clinic, "Consult", "2026-10-06T09:00:00+01:00", email = email)
            val worker = JobWorker(env.ctx)
            worker.drain()
            worker.runPeriodic(force = true)
            worker.drain()
            worker.runPeriodic(force = true)
            worker.drain()
            assertEquals(1, env.email.sent.count { it.to == email && it.template == "booking_reminder" })
            env.clock.instant = java.time.Instant.parse("2026-10-06T09:30:00Z")
            worker.runPeriodic(force = true)
            assertEquals("completed", api.get("/v1/public/manage/${b.s("manageToken")}").obj().s("status"))

            // A job with an unknown kind fails and is rescheduled with backoff.
            env.db.txBlocking { ie.bookanything.jobs.JobQueue.enqueue(it, "unknown_kind", JsonObject(emptyMap())) }
            worker.drain()
            val row = Fixtures.sqlOne(
                "SELECT status::text, attempts, run_at > now() FROM jobs WHERE kind = 'unknown_kind' ORDER BY created_at DESC LIMIT 1",
            ) {
                Triple(it.getString(1), it.getInt(2), it.getBoolean(3))
            }!!
            assertEquals(Triple("pending", 1, true), row)
        }
    }

    @Test
    fun `health reports the database`() = withApp { api ->
        val res = api.get("/v1/health")
        assertStatus(HttpStatusCode.OK, res)
        assertEquals("ok", res.obj().s("database"))
        assertEquals("dev", res.obj().s("version"), "the release, dev outside the release train")
        assertTrue(res.headers["X-Request-Id"]!!.isNotBlank())
        val echoed = api.client.get("/v1/health") { header("X-Request-Id", "req-abc-12345") }
        assertEquals("req-abc-12345", echoed.headers["X-Request-Id"])
    }
}
