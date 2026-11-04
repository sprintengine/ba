package ie.bookanything.me

import ie.bookanything.http.Patch
import ie.bookanything.jobs.JobWorker
import ie.bookanything.support.Fixtures
import ie.bookanything.support.Fixtures.book
import ie.bookanything.support.Roles
import ie.bookanything.support.TestEnv
import ie.bookanything.support.TestUser
import ie.bookanything.support.access
import ie.bookanything.support.arr
import ie.bookanything.support.assertError
import ie.bookanything.support.assertStatus
import ie.bookanything.support.b
import ie.bookanything.support.devToken
import ie.bookanything.support.inParallel
import ie.bookanything.support.jsonOf
import ie.bookanything.support.o
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.sOrNull
import ie.bookanything.support.unique
import ie.bookanything.support.withApp
import ie.bookanything.team.TeamCommands
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class MeTest {
    @Test
    fun `guest bookings are linked to an account when the verified email signs in`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val email = "${unique("guest")}@example.test"
        book(api, clinic, "Consult", "2026-10-07T09:00:00+01:00", email = email.uppercase())
        book(api, clinic, "Consult", "2026-10-06T09:00:00+01:00", email = email)
        val user = TestUser(devToken("dev_${unique("linker")}", email, "Linked Guest"), email)
        val me = api.get("/v1/me", user.token).obj()
        assertTrue(me.b("hasCustomerBookings"))
        assertEquals(0, me["memberships"]!!.jsonArray.size)
        val mine = api.get("/v1/me/bookings", user.token).obj()
        assertEquals(2, mine["upcoming"]!!.jsonArray.size)
        assertEquals("2026-10-06T09:00:00+01:00", mine["upcoming"]!!.jsonArray[0].s("start"))
        val bookingId = mine["upcoming"]!!.jsonArray[1].s("id")

        // Customers manage their own bookings from the account.
        val moved = api.post("/v1/me/bookings/$bookingId/reschedule", jsonOf("start" to "2026-10-07T11:00:00+01:00"), user.token)
        assertStatus(HttpStatusCode.OK, moved)
        assertEquals("2026-10-07T11:00:00+01:00", moved.obj().s("start"))
        val cancelled = api.post("/v1/me/bookings/$bookingId/cancel", jsonOf("reason" to "Sorted itself out"), user.token).obj()
        assertEquals("cancelled", cancelled.s("status"))
        assertEquals(1, api.get("/v1/me/bookings", user.token).obj()["past"]!!.jsonArray.size)

        // Someone else cannot touch them.
        val other = TestUser.create("other")
        assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.post("/v1/me/bookings/$bookingId/cancel", null, other.token))
        assertEquals(0, api.get("/v1/me/bookings", other.token).obj()["upcoming"]!!.jsonArray.size)
    }

    @Test
    fun `a guest booking made after signing in is linked when my bookings are listed`() = withApp { api ->
        // Linking runs when the user row is written and on /me/bookings, no longer on every GET /me.
        val clinic = Fixtures.clinic(api)
        val user = TestUser.create("later")
        assertStatus(HttpStatusCode.OK, api.get("/v1/me", user.token))
        val booked = book(api, clinic, "Consult", "2026-10-07T09:00:00+01:00", email = user.email)["booking"]!!.s("id")
        assertEquals(listOf(booked), api.get("/v1/me/bookings", user.token).obj()["upcoming"]!!.jsonArray.map { it.s("id") })
        assertTrue(api.get("/v1/me", user.token).obj().b("hasCustomerBookings"))
    }

    @Test
    fun `a long history never pushes an upcoming booking out of my bookings`() = withApp { api ->
        // Regression: one query ordered by start and cut at 500 kept the oldest bookings and dropped upcoming ones.
        val clinic = Fixtures.clinic(api)
        val email = "${unique("regular")}@example.test"
        val upcoming = book(api, clinic, "Consult", "2026-10-07T09:00:00+01:00", email = email)["booking"]!!.s("id")
        Fixtures.sql(
            """
            INSERT INTO bookings (business_id, reference, customer_id, service_id, start_at, end_at, status, currency)
            SELECT business_id, reference || '-' || n, customer_id, service_id, start_at - make_interval(days => 30 + n),
                end_at - make_interval(days => 30 + n), 'completed', currency
            FROM bookings, generate_series(1, 501) n WHERE id = ?::uuid
            """.trimIndent(),
            upcoming,
        )
        val user = TestUser(devToken("dev_${unique("regular")}", email, "Regular"), email)

        val mine = api.get("/v1/me/bookings", user.token).obj()
        assertEquals(listOf(upcoming), mine["upcoming"]!!.jsonArray.map { it.s("id") })
        val past = mine["past"]!!.jsonArray
        assertEquals(MeService.PAST_LIMIT, past.size)
        assertEquals("2026-09-06T09:00:00+01:00", past.first().s("start")) // the latest first: 31 days before
    }
}

class TeamTest {
    @Test
    fun `invitations are accepted automatically for the verified email and via token`() {
        val env = TestEnv()
        withApp(env) { api ->
            val clinic = Fixtures.clinic(api)
            val admin = TestUser.create("admin", "Ada Admin")
            val invited = api.post("${clinic.base}/team/invitations", jsonOf("email" to admin.email, "role" to "admin"), clinic.owner.token)
            assertStatus(HttpStatusCode.Created, invited)
            assertEquals("invited", invited.obj().s("status"))
            assertError(
                HttpStatusCode.Conflict, "CONFLICT",
                api.post("${clinic.base}/team/invitations", jsonOf("email" to admin.email, "role" to "staff"), clinic.owner.token),
            )

            JobWorker(env.ctx).drain()
            val mail = env.email.sent.single { it.template == "team_invitation" && it.to == admin.email }
            val token = Regex("/invitations/([A-Za-z0-9_-]+)").find(mail.text)!!.groupValues[1]

            val me = api.get("/v1/me", admin.token).obj()
            assertEquals("admin", me["memberships"]!!.jsonArray.single().s("role"))
            // /v1/me accepted it at sign-in, before the emailed link was opened: the link still answers the user who
            // joined through it (this was a 404, shown as "already used"), and no one else.
            val again = api.post("/v1/invitations/$token/accept", null, admin.token)
            assertStatus(HttpStatusCode.OK, again)
            assertEquals(clinic.id, again.obj().s("joinedBusinessId"))
            assertEquals(clinic.id, again.obj()["memberships"]!!.jsonArray.single().s("businessId"))
            assertError(
                HttpStatusCode.NotFound, "NOT_FOUND", api.post("/v1/invitations/$token/accept", null, TestUser.create("other").token),
            )

            // Admins cannot invite or promote owners; owners can't be left without an owner.
            assertError(
                HttpStatusCode.Forbidden, "FORBIDDEN",
                api.post("${clinic.base}/team/invitations", jsonOf("email" to "boss@example.test", "role" to "owner"), admin.token),
            )
            val team = api.get("${clinic.base}/team", admin.token).arr()
            val ownerMember = team.single { it.s("role") == "owner" }.s("id")
            assertError(HttpStatusCode.Forbidden, "FORBIDDEN", api.delete("${clinic.base}/team/$ownerMember", admin.token))
            assertError(HttpStatusCode.Conflict, "POLICY_VIOLATION", api.delete("${clinic.base}/team/$ownerMember", clinic.owner.token))
            assertError(
                HttpStatusCode.Conflict, "POLICY_VIOLATION",
                api.patch("${clinic.base}/team/$ownerMember", jsonOf("role" to "admin"), clinic.owner.token),
            )

            // Explicit token acceptance for a user whose account email differs.
            val staffEmail = "${unique("stf")}@example.test"
            val staffInvite = api.post(
                "${clinic.base}/team/invitations",
                jsonOf("email" to staffEmail, "role" to "staff", "resourceId" to clinic.resource("Blake")), admin.token,
            ).obj()
            assertEquals(clinic.resource("Blake"), staffInvite.sOrNull("resourceId"))
            JobWorker(env.ctx).drain()
            val staffToken = Regex("/invitations/([A-Za-z0-9_-]+)").find(
                env.email.sent.single { it.to == staffEmail }.text,
            )!!.groupValues[1]
            // Free plan: owner + admin + pending staff = 3 seats → a fourth invite is refused.
            assertError(
                HttpStatusCode.Conflict, "PLAN_LIMIT_REACHED",
                api.post("${clinic.base}/team/invitations", jsonOf("email" to "fourth@example.test", "role" to "staff"), admin.token),
            )
            val personal = TestUser.create("personal")
            val accepted = api.post("/v1/invitations/$staffToken/accept", null, personal.token)
            assertStatus(HttpStatusCode.OK, accepted)
            assertEquals("staff", accepted.obj()["memberships"]!!.jsonArray.single().s("role"))
            assertEquals(clinic.id, accepted.obj().s("joinedBusinessId"))
            val staffMember = api.get("${clinic.base}/team", clinic.owner.token).arr().single { it.s("role") == "staff" }
            assertEquals("active", staffMember.s("status"))

            // Role change and removal.
            assertEquals(
                "admin",
                api.patch("${clinic.base}/team/${staffMember.s("id")}", jsonOf("role" to "admin"), clinic.owner.token).obj().s("role"),
            )
            assertStatus(HttpStatusCode.NoContent, api.delete("${clinic.base}/team/${staffMember.s("id")}", clinic.owner.token))
            assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.get(clinic.base, personal.token))
            // The link they joined through doesn't bring them back.
            assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.post("/v1/invitations/$staffToken/accept", null, personal.token))
            assertError(
                HttpStatusCode.NotFound, "NOT_FOUND", api.post("/v1/invitations/not-a-valid-token-at-all-000/accept", null, personal.token),
            )
        }
    }
}

class TeamOwnerRaceTest {
    @Test
    fun `two owners demoting each other at the same time leave the business an owner`() {
        val env = TestEnv()
        withApp(env) { api ->
            val clinic = Fixtures.clinic(api)
            val second = Roles.member(api, clinic, "owner")
            val team = api.get("${clinic.base}/team", clinic.owner.token).arr()
            val firstId = UUID.fromString(team.single { it.s("email") == clinic.owner.email }.s("id"))
            val secondId = UUID.fromString(team.single { it.s("email") == second.email }.s("id"))
            val accesses = listOf(env.access(clinic.owner, clinic.id), env.access(second, clinic.id))
            val commands = TeamCommands(env.ctx.tokens)
            val demote = Patch(JsonObject(mapOf("role" to JsonPrimitive("admin"))))
            val businessId = UUID.fromString(clinic.id)
            val firstUpdated = CountDownLatch(1)
            val secondDone = AtomicBoolean(false)
            // The first owner's demotion of the second is made but not committed while the second demotes the first.
            val results = inParallel(2) { i ->
                runCatching {
                    if (i == 0) {
                        env.db.txBlocking(businessId) { conn ->
                            commands.update(conn, accesses[0], secondId, demote)
                            firstUpdated.countDown()
                            awaitTrue { secondDone.get() || waitingOnALock(env) }
                        }
                    } else {
                        firstUpdated.await(20, TimeUnit.SECONDS)
                        try {
                            env.db.txBlocking(businessId) { conn -> commands.update(conn, accesses[1], firstId, demote) }
                        } finally {
                            secondDone.set(true)
                        }
                    }
                }
            }
            val owners = Fixtures.sqlOne(
                "SELECT count(*) FROM business_members WHERE business_id = ? AND status = 'active' AND role = 'owner'", businessId,
            ) { it.getLong(1) }
            assertEquals(1L, owners, "results: $results")
            assertEquals("A business needs at least one owner.", results[1].exceptionOrNull()?.message)
        }
    }

    private fun waitingOnALock(env: TestEnv): Boolean = env.db.txBlocking(readOnly = true) { conn ->
        conn.prepareStatement(
            "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'",
        ).use { st -> st.executeQuery().use { rs -> rs.next() && rs.getLong(1) > 0 } }
    }

    private fun awaitTrue(condition: () -> Boolean) {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(20)
        while (!condition()) {
            check(System.nanoTime() < deadline) { "timed out" }
            Thread.onSpinWait()
        }
    }
}

class TeamAuditTest {
    @Test
    fun `an accepted owner invitation is audited as an owner, other roles as members`() = withApp { api ->
        // Regression: invitation acceptance always recorded actor_type 'member', while every other action by an owner
        // is recorded as 'owner'.
        val clinic = Fixtures.clinic(api)
        val actorOf = { memberId: String ->
            Fixtures.sqlOne(
                "SELECT actor_type::text FROM audit_events WHERE action = 'team.invitation_accepted' AND entity_id = ?::uuid", memberId,
            ) { it.getString(1) }
        }
        val partner = TestUser.create("partner", "Pat Partner")
        val invitations = "${clinic.base}/team/invitations"
        val owner = api.post(invitations, jsonOf("email" to partner.email, "role" to "owner"), clinic.owner.token).obj()
        val admin = TestUser.create("admin", "Ada Admin")
        val member = api.post(invitations, jsonOf("email" to admin.email, "role" to "admin"), clinic.owner.token).obj()
        api.get("/v1/me", partner.token)
        api.get("/v1/me", admin.token)
        assertEquals("owner", actorOf(owner.s("id")))
        assertEquals("member", actorOf(member.s("id")))
    }
}

class GdprTest {
    @Test
    fun `customer erase anonymises personal data and export returns it first`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val email = "${unique("gdpr")}@example.test"
        val booking = book(api, clinic, "Consult", "2026-10-07T09:00:00+01:00", email = email)
        val token = booking.s("manageToken")
        val customerId = api.get("${clinic.base}/bookings/${booking["booking"]!!.s("id")}", clinic.owner.token).obj()["customer"]!!.s("id")

        val export = api.get("${clinic.base}/customers/$customerId/export", clinic.owner.token)
        assertStatus(HttpStatusCode.OK, export)
        val data = export.obj()
        assertEquals(email, data["customer"]!!.s("email"))
        assertEquals("Sore shoulder", data["bookings"]!!.jsonArray[0].o["answers"]!!.jsonArray[0].s("value"))

        val staff = TestUser.create("gdpr-staff")
        assertStatus(HttpStatusCode.NoContent, api.delete("${clinic.base}/customers/$customerId", clinic.owner.token))
        assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.get("${clinic.base}/customers/$customerId", clinic.owner.token))
        val detail = api.get("${clinic.base}/bookings/${booking["booking"]!!.s("id")}", clinic.owner.token).obj()
        assertEquals("Erased customer", detail["customer"]!!.s("name"))
        assertEquals(null, detail["customer"]!!.sOrNull("email"))
        assertEquals(0, detail["answers"]!!.jsonArray.size)
        assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.get("/v1/public/manage/$token"))
        assertTrue(api.get("${clinic.base}/customers?q=gdpr", clinic.owner.token).obj()["items"]!!.jsonArray.isEmpty())
        // The email can be used again for a fresh customer record.
        book(api, clinic, "Consult", "2026-10-08T09:00:00+01:00", email = email)
        assertError(HttpStatusCode.Unauthorized, "UNAUTHENTICATED", api.delete("${clinic.base}/customers/$customerId"))
        assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.delete("${clinic.base}/customers/$customerId", staff.token))
    }

    @Test
    fun `customer erase also forgets cancellation reasons, their history's reasons and addresses, and the email log`() {
        val env = TestEnv()
        withApp(env) { api ->
            val clinic = Fixtures.clinic(api)
            val owner = clinic.owner.token
            val email = "${unique("gdpr.log")}@example.test"
            val name = "Dana ${unique("Erasable")}"
            val body = Fixtures.bookingBody(clinic, "Consult", "2026-10-07T09:00:00+01:00", email = email, name = name)
            val firstRes = api.post("${clinic.public}/bookings", body)
            assertStatus(HttpStatusCode.Created, firstRes)
            val first = firstRes.obj()
            val firstId = first["booking"]!!.s("id")
            val customerId = api.get("${clinic.base}/bookings/$firstId", owner).obj()["customer"]!!.s("id")
            api.post("/v1/public/manage/${first.s("manageToken")}/cancel", jsonOf("reason" to "My hospital appointment moved"))
            val held = api.post(
                "${clinic.base}/bookings",
                jsonOf(
                    "serviceId" to clinic.service("Paid consult"), "start" to "2026-10-08T10:00:00+01:00", "customerId" to customerId,
                    "answers" to emptyMap<String, String>(), "paymentMode" to "collect_online", "notifyCustomer" to false,
                ),
                owner,
            ).obj()
            assertStatus(HttpStatusCode.OK, api.post("${clinic.base}/bookings/${held.s("id")}/send-payment-link", null, owner))
            JobWorker(env.ctx).drain()
            fun logRows(sql: String, vararg params: Any?) = Fixtures.sqlAll(sql, *params)
            assertTrue(logRows("SELECT to_address FROM email_log WHERE to_address = ?", email).isNotEmpty())

            assertStatus(HttpStatusCode.NoContent, api.delete("${clinic.base}/customers/$customerId", owner))
            val cancelled = api.get("${clinic.base}/bookings/$firstId", owner).obj()
            assertEquals(null, cancelled.sOrNull("cancellationReason"))
            val heldHistory = api.get("${clinic.base}/bookings/${held.s("id")}", owner).obj()["history"]!!.jsonArray
            val history = (cancelled["history"]!!.jsonArray + heldHistory).map { it.o["summary"]!!.o }
            assertTrue(history.none { "reason" in it || "to" in it }, history.toString())
            assertTrue(history.any { "by" in it }, "the rest of the history stays")
            val businessId = UUID.fromString(clinic.id)
            assertEquals(emptyList(), logRows("SELECT to_address FROM email_log WHERE lower(to_address) = ?", email))
            val erased = logRows("SELECT to_address FROM email_log WHERE business_id = ? AND to_address = 'Erased customer'", businessId)
            assertTrue(erased.isNotEmpty())
            val subjects = logRows("SELECT subject FROM email_log WHERE business_id = ?", businessId)
            assertTrue(subjects.any { it.contains(": Erased customer, ") } && subjects.none { it.contains(name) }, subjects.toString())
        }
    }

    @Test
    fun `customers can be created, searched and paginated`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val t = clinic.owner.token
        listOf("Avery Lane", "Casey Rowe", "Drew Ellis").forEach { name ->
            assertStatus(
                HttpStatusCode.Created,
                api.post(
                    "${clinic.base}/customers",
                    jsonOf("name" to name, "email" to "${name.lowercase().replace(' ', '.')}@example.test", "phone" to "+353 87 123 4567"),
                    t,
                ),
            )
        }
        assertError(
            HttpStatusCode.Conflict, "CONFLICT",
            api.post("${clinic.base}/customers", jsonOf("name" to "Dup", "email" to "avery.lane@example.test"), t),
        )
        val page1 = api.get("${clinic.base}/customers?limit=2", t).obj()
        assertEquals(listOf("Avery Lane", "Casey Rowe"), page1["items"]!!.jsonArray.map { it.s("name") })
        val page2 = api.get("${clinic.base}/customers?limit=2&cursor=${page1.s("nextCursor")}", t).obj()
        assertEquals(listOf("Drew Ellis"), page2["items"]!!.jsonArray.map { it.s("name") })
        assertEquals(null, page2.sOrNull("nextCursor"))
        assertEquals(listOf("Casey Rowe"), api.get("${clinic.base}/customers?q=rowe", t).obj()["items"]!!.jsonArray.map { it.s("name") })
        val id = page1["items"]!!.jsonArray[0].s("id")
        assertEquals("VIP notes", api.patch("${clinic.base}/customers/$id", jsonOf("notes" to "VIP notes"), t).obj().s("notes"))
        assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", api.patch("${clinic.base}/customers/$id", jsonOf("email" to "nope"), t))
    }
}
