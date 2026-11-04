package ie.bookanything.notifications

import ie.bookanything.auth.ClerkEventHandler
import ie.bookanything.jobs.JobWorker
import ie.bookanything.jobs.Retention
import ie.bookanything.notifications.inbox.InboxKind
import ie.bookanything.notifications.inbox.NewNotification
import ie.bookanything.notifications.push.PushDeviceRepository
import ie.bookanything.notifications.push.PushReceipt
import ie.bookanything.notifications.push.PushSender
import ie.bookanything.notifications.push.PushTicket
import ie.bookanything.support.Api
import ie.bookanything.support.DEFAULT_NOW
import ie.bookanything.support.FakePushSender
import ie.bookanything.support.Fixtures
import ie.bookanything.support.TestEnv
import ie.bookanything.support.TestUser
import ie.bookanything.support.a
import ie.bookanything.support.assertError
import ie.bookanything.support.assertStatus
import ie.bookanything.support.expoToken
import ie.bookanything.support.jsonOf
import ie.bookanything.support.o
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.withApp
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.jsonPrimitive
import java.sql.Timestamp
import java.time.Duration
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Push notifications to the mobile app (section 22): its phones, and what is pushed to them. */
class PushNotificationsTest {
    private suspend fun register(api: Api, user: TestUser, token: String, platform: String = "ios", variant: String = "production") =
        api.post("/v1/me/push-devices", jsonOf("token" to token, "platform" to platform, "appVariant" to variant), user.token)

    private suspend fun registered(api: Api, user: TestUser, token: String, platform: String = "ios", variant: String = "production") =
        register(api, user, token, platform, variant).also { assertStatus(HttpStatusCode.OK, it) }.obj()

    private suspend fun unregister(api: Api, user: TestUser?, token: String) =
        api.delete("/v1/me/push-devices", user?.token, jsonOf("token" to token))

    private suspend fun userId(api: Api, user: TestUser): UUID = UUID.fromString(api.get("/v1/me", user.token).obj()["user"]!!.s("id"))

    /** (user id, revoked reason) of [token]'s row. */
    private fun device(token: String): Pair<String, String?>? =
        Fixtures.sqlOne("SELECT user_id::text, revoked_reason FROM push_devices WHERE token = ?", token) { rs ->
            rs.getString(1) to rs.getString(2)
        }

    private fun notify(env: TestEnv, userId: UUID, title: String = "Claude wants to: Block time", body: String? = "Blocks Alex's Friday") {
        env.db.txBlocking { conn ->
            env.ctx.inbox.notify(
                conn, NewNotification(userId, InboxKind.AGENT_APPROVAL, title, body, "/my/approvals/${UUID.randomUUID()}"),
            )
        }
    }

    private fun pushJobs(userId: UUID): Int = Fixtures.sqlOne(
        "SELECT count(*) FROM jobs j JOIN notifications n ON n.id = (j.payload->>'notificationId')::uuid " +
            "WHERE j.kind = 'push-send' AND n.user_id = ?",
        userId,
    ) { it.getInt(1) }!!

    /** Runs the receipts checks now (they wait 15 minutes for Expo). */
    private fun checkReceipts(env: TestEnv) {
        Fixtures.sql("UPDATE jobs SET run_at = now() WHERE kind = 'push-receipts' AND status = 'pending'")
        JobWorker(env.ctx).drain()
    }

    @Test
    fun `the app registers its phone, refreshes it, hands it to whoever signs in next and unregisters it`() {
        val env = TestEnv()
        withApp(env) { api ->
            val alice = TestUser.create("alice")
            val bob = TestUser.create("bob")
            val token = expoToken()
            val first = registered(api, alice, token)
            assertEquals("ios", first.s("platform"))
            assertEquals("production", first.s("appVariant"))
            assertEquals("2026-10-05T08:00:00Z", first.s("createdAt"))
            assertEquals("2026-10-05T08:00:00Z", first.s("lastSeenAt"))
            assertEquals(setOf("id", "platform", "appVariant", "createdAt", "lastSeenAt"), first.keys)

            // The app registers on every launch: the same phone, seen again.
            env.clock.advanceMinutes(60)
            val again = registered(api, alice, token)
            assertEquals(first.s("id"), again.s("id"))
            assertEquals("2026-10-05T08:00:00Z", again.s("createdAt"))
            assertEquals("2026-10-05T09:00:00Z", again.s("lastSeenAt"))

            // Bob signs in on that phone: it is his now, and Alice signing out elsewhere doesn't touch it.
            env.clock.advanceMinutes(60)
            val moved = registered(api, bob, token, platform = "ios")
            assertEquals("2026-10-05T10:00:00Z", moved.s("createdAt"))
            assertEquals(userId(api, bob).toString() to null, device(token))
            assertStatus(HttpStatusCode.NoContent, unregister(api, alice, token))
            assertEquals(null, device(token)!!.second)

            // Bob signs out: no more notifications there. Again is fine (idempotent).
            assertStatus(HttpStatusCode.NoContent, unregister(api, bob, token))
            assertEquals("signed_out", device(token)!!.second)
            assertStatus(HttpStatusCode.NoContent, unregister(api, bob, token))
            assertStatus(HttpStatusCode.NoContent, unregister(api, bob, expoToken("unknown")))
            // Signing in again turns it back on.
            registered(api, bob, token)
            assertEquals(null, device(token)!!.second)
        }
    }

    @Test
    fun `phones need a valid token, platform and variant, and a signed-in person`() {
        val env = TestEnv()
        withApp(env) { api ->
            val user = TestUser.create("pushval")
            suspend fun field(res: io.ktor.client.statement.HttpResponse, name: String) {
                val body = res.obj()
                assertEquals(HttpStatusCode.BadRequest, res.status, body.toString())
                assertTrue(body["error"]!!.o["fields"]!!.o.containsKey(name), body.toString())
            }
            field(register(api, user, "not-a-token"), "token")
            field(register(api, user, "ExponentPushToken[${"x".repeat(200)}]"), "token")
            field(register(api, user, expoToken(), platform = "windows"), "platform")
            field(register(api, user, expoToken(), variant = "staging"), "appVariant")
            field(api.post("/v1/me/push-devices", jsonOf("token" to expoToken()), user.token), "platform")
            field(unregister(api, user, "ExponentPushToken[]"), "token")
            assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", api.delete("/v1/me/push-devices", user.token))
            // A token with spaces around it is the same token.
            val token = expoToken()
            registered(api, user, " $token ")
            assertEquals(null, device(token)!!.second)

            assertStatus(HttpStatusCode.Unauthorized, register(api, TestUser("dev.bad", "x@y.z"), expoToken()))
            assertStatus(HttpStatusCode.Unauthorized, api.post("/v1/me/push-devices", jsonOf("token" to token), null))
            assertStatus(HttpStatusCode.Unauthorized, unregister(api, null, token))
            assertEquals(null, device(token)!!.second, "untouched")
        }
    }

    @Test
    fun `a person has at most 20 phones getting notifications, the one seen longest ago goes`() {
        val env = TestEnv()
        withApp(env) { api ->
            val user = TestUser.create("many")
            val tokens = (0..PushDeviceRepository.MAX_ACTIVE).map { expoToken("p$it") }
            tokens.forEach { token ->
                registered(api, user, token)
                env.clock.advanceMinutes(1)
            }
            assertEquals("replaced", device(tokens.first())!!.second)
            assertTrue(tokens.drop(1).all { device(it)!!.second == null })
            // Seeing the oldest again keeps it; the next oldest goes instead.
            registered(api, user, tokens.first())
            assertEquals(null, device(tokens.first())!!.second)
            assertEquals("replaced", device(tokens[1])!!.second)
        }
    }

    @Test
    fun `a notification is pushed to each of the person's phones with its link and the unread count, then its receipts checked`() {
        val push = FakePushSender()
        val env = TestEnv(push = push)
        withApp(env) { api ->
            val user = TestUser.create("pushed")
            val id = userId(api, user)
            val (phone, tablet, old) = listOf(expoToken("phone"), expoToken("tablet"), expoToken("old"))
            registered(api, user, phone)
            registered(api, user, tablet, platform = "android")
            registered(api, user, old)
            assertStatus(HttpStatusCode.NoContent, unregister(api, user, old))

            val issued = CopyOnWriteArrayList<String>()
            push.ticket = { PushTicket.ok("ticket-${UUID.randomUUID()}").also { ticket -> issued += ticket.id!! } }
            notify(env, id, title = "First")
            notify(env, id, title = "Claude wants to: Block time")
            JobWorker(env.ctx).drain()

            val n = api.get("/v1/me/notifications", user.token).obj()["items"]!!.a.first()
            assertEquals("Claude wants to: Block time", n.s("title"), "the app shows it all")
            val latest = push.to(phone).single { it.data["notificationId"]!!.jsonPrimitive.content == n.s("id") }
            // A locked phone shows neither the title nor the body.
            assertEquals("bookanything", latest.title)
            assertEquals("Your AI assistant has a change waiting for your approval", latest.body)
            assertEquals(n.s("link"), latest.data["link"]!!.jsonPrimitive.content)
            assertEquals(n.s("id"), latest.data["notificationId"]!!.jsonPrimitive.content)
            assertEquals("agent_approval", latest.data["kind"]!!.jsonPrimitive.content)
            assertEquals(2, latest.badge, "both unread")
            assertEquals("high", latest.priority)
            assertEquals(2, push.to(tablet).size)
            assertEquals(emptyList(), push.to(old), "signed out there")

            // Fifteen minutes later: Expo is asked whether the phones' push services took them.
            assertEquals(4, issued.size)
            checkReceipts(env)
            assertTrue(push.receiptRequests.flatten().containsAll(issued))
            assertEquals(null, device(phone)!!.second)
        }
    }

    @Test
    fun `nothing is pushed for a notification read meanwhile, to someone without the app, or when push is off`() {
        val push = FakePushSender()
        val env = TestEnv(push = push)
        withApp(env) { api ->
            val reader = TestUser.create("reader")
            val token = expoToken("reader")
            registered(api, reader, token)
            notify(env, userId(api, reader))
            assertStatus(HttpStatusCode.NoContent, api.post("/v1/me/notifications/read-all", jsonOf(), reader.token))
            JobWorker(env.ctx).drain()
            assertEquals(emptyList(), push.to(token))

            val webOnly = TestUser.create("webonly")
            notify(env, userId(api, webOnly))
            assertEquals(0, pushJobs(userId(api, webOnly)), "no phone: nothing queued")
        }
        val off = TestEnv()
        withApp(off) { api ->
            val user = TestUser.create("pushoff")
            registered(api, user, expoToken("off"))
            notify(off, userId(api, user))
            assertEquals(0, pushJobs(userId(api, user)), "push off: nothing queued")
        }
    }

    @Test
    fun `a phone Expo says is gone is revoked, from its ticket or its receipt, and other errors leave it`() {
        val push = FakePushSender()
        val env = TestEnv(push = push)
        withApp(env) { api ->
            val user = TestUser.create("gone")
            val id = userId(api, user)
            val (uninstalled, expired, tooBig) = listOf(expoToken("uninstalled"), expoToken("expired"), expoToken("big"))
            listOf(uninstalled, expired, tooBig).forEach { registered(api, user, it) }
            push.ticket = { m ->
                when (m.to) {
                    uninstalled -> PushTicket.error(PushSender.DEVICE_NOT_REGISTERED, "not a registered push notification recipient")
                    else -> PushTicket.ok("ticket-${m.to}")
                }
            }
            push.receipt = { ticket ->
                when (ticket) {
                    "ticket-$expired" -> PushReceipt(PushSender.DEVICE_NOT_REGISTERED, "gone")
                    "ticket-$tooBig" -> PushReceipt("MessageTooBig", "too big")
                    else -> null
                }
            }
            notify(env, id)
            JobWorker(env.ctx).drain()
            assertEquals("not_registered", device(uninstalled)!!.second)
            assertEquals(null, device(expired)!!.second, "until its receipt says so")
            checkReceipts(env)
            assertEquals("not_registered", device(expired)!!.second)
            assertEquals(null, device(tooBig)!!.second)

            // From now on only the phone that is still there gets them.
            val before = push.sent.size
            notify(env, id, title = "Second")
            JobWorker(env.ctx).drain()
            assertEquals(listOf(tooBig), push.sent.drop(before).map { it.to })
        }
    }

    @Test
    fun `a phone that registered again after the push isn't revoked by an old receipt`() {
        val push = FakePushSender()
        val env = TestEnv(push = push)
        withApp(env) { api ->
            val user = TestUser.create("fresh")
            val token = expoToken("fresh")
            registered(api, user, token)
            push.receipt = { PushReceipt(PushSender.DEVICE_NOT_REGISTERED, "gone") }
            notify(env, userId(api, user))
            JobWorker(env.ctx).drain()
            env.clock.advanceMinutes(5)
            registered(api, user, token) // a new install registered the token again
            checkReceipts(env)
            assertEquals(null, device(token)!!.second)
        }
    }

    @Test
    fun `Expo being down is retried, without pushing twice to the phones it already reached`() {
        val push = FakePushSender()
        val env = TestEnv(push = push)
        withApp(env) { api ->
            val user = TestUser.create("retry")
            val dev = expoToken("dev")
            val prod = expoToken("prod")
            registered(api, user, dev, variant = "development")
            env.clock.advanceMinutes(1)
            registered(api, user, prod)
            var down = true
            // Expo takes the development app's request, then fails the production app's.
            push.ticket = { m -> if (m.to == prod && down) throw RetryableSendException("expo push status 503") else PushTicket.ok(null) }
            notify(env, userId(api, user))
            JobWorker(env.ctx).drain()
            val job = Fixtures.sqlOne(
                "SELECT status::text, attempts, last_error, payload->'sent' FROM jobs j JOIN notifications n " +
                    "ON n.id = (j.payload->>'notificationId')::uuid WHERE j.kind = 'push-send' AND n.user_id = ?",
                userId(api, user),
            ) { listOf(it.getString(1), it.getString(2), it.getString(3), it.getString(4)) }!!
            assertEquals("pending", job[0])
            assertEquals("1", job[1])
            assertTrue(job[2].contains("503"), job[2])
            val devId = Fixtures.sqlOne("SELECT id::text FROM push_devices WHERE token = ?", dev) { it.getString(1) }!!
            assertEquals("[\"$devId\"]", job[3].replace(" ", ""), "the development app's phone is done")

            down = false
            Fixtures.sql("UPDATE jobs SET run_at = now() WHERE kind = 'push-send' AND status = 'pending'")
            JobWorker(env.ctx).drain()
            assertEquals(1, push.to(dev).size, "reached once")
            assertEquals(2, push.to(prod).size, "the failed request, then the retry")
            assertEquals(0, Fixtures.sqlOne("SELECT count(*) FROM jobs WHERE kind = 'push-send' AND status = 'pending'") { it.getInt(1) })
        }
    }

    @Test
    fun `the team's phones hear about a booking request`() {
        val push = FakePushSender()
        val env = TestEnv(push = push)
        withApp(env) { api ->
            val clinic = Fixtures.clinic(api)
            val token = expoToken("owner")
            registered(api, clinic.owner, token)
            val booking = Fixtures.book(api, clinic, "Approval consult", "2026-10-06T11:00:00+01:00")["booking"]!!.o.s("id")
            JobWorker(env.ctx).drain()
            val m = push.to(token).single()
            // The business and that a request waits: not who asked, for what or when.
            assertEquals("Test Clinic ${clinic.slug}" to "A booking request needs your answer", m.title to m.body)
            val inbox = api.get("/v1/me/notifications", clinic.owner.token).obj()["items"]!!.a.single()
            assertTrue(inbox.s("title").startsWith("Request to approve"), inbox.s("title"))
            assertEquals("/dashboard/${clinic.slug}/bookings?booking=$booking", m.data["link"]!!.jsonPrimitive.content)
            assertNull(m.priority)
        }
    }

    @Test
    fun `a deleted account's phones are forgotten, and old or unused phones are purged`() {
        val env = TestEnv()
        withApp(env) { api ->
            val user = TestUser.create("leaving")
            val token = expoToken("leaving")
            registered(api, user, token)
            env.db.txBlocking { ClerkEventHandler().delete(it, "dev_" + user.email.substringBefore('@')) }
            assertNull(device(token))

            val keeper = TestUser.create("keeper")
            val id = userId(api, keeper)
            fun ago(days: Long) = Timestamp.from(DEFAULT_NOW.minus(Duration.ofDays(days)))
            fun insert(token: String, seen: Timestamp, revoked: Timestamp?) = Fixtures.sql(
                "INSERT INTO push_devices (user_id, token, platform, app_variant, last_seen_at, revoked_at, revoked_reason) " +
                    "VALUES (?, ?, 'ios', 'production', ?, ?, CASE WHEN ?::timestamptz IS NULL THEN NULL ELSE 'signed_out' END)",
                id, token, seen, revoked, revoked,
            )
            val tokens = (1..4).map { expoToken("age$it") }
            insert(tokens[0], ago(40), revoked = ago(31))
            insert(tokens[1], ago(40), revoked = ago(29))
            insert(tokens[2], ago(271), revoked = null)
            insert(tokens[3], ago(269), revoked = null)
            Retention.purge(env.db, env.clock.instant(), batch = 1)
            assertEquals(listOf(null, "signed_out", null, null), tokens.map { device(it)?.second })
            assertEquals(listOf(false, true, false, true), tokens.map { device(it) != null })
        }
    }
}
