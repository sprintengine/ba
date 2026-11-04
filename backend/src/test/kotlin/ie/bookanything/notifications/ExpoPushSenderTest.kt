package ie.bookanything.notifications

import ie.bookanything.notifications.inbox.NotificationRow
import ie.bookanything.notifications.push.DisabledPushSender
import ie.bookanything.notifications.push.ExpoPushSender
import ie.bookanything.notifications.push.LogPushSender
import ie.bookanything.notifications.push.PushHandler
import ie.bookanything.notifications.push.PushMessage
import ie.bookanything.notifications.push.PushReceipt
import ie.bookanything.notifications.push.PushSender
import ie.bookanything.notifications.push.PushTicket
import ie.bookanything.notifications.push.PushTokens
import ie.bookanything.support.ScriptedTransport
import ie.bookanything.support.parse
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.IOException
import java.time.Instant
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** The Expo push service's wire format (https://docs.expo.dev/push-notifications/sending-notifications/). */
class ExpoPushSenderTest {
    private fun message(i: Int, priority: String? = null) = PushMessage(
        "ExponentPushToken[device-$i]", "Title $i", "Body $i", JsonObject(mapOf("link" to JsonPrimitive("/my/approvals/$i"))), badge = 3,
        priority = priority,
    )

    /** Expo's answer for a send: a ticket per message, ok unless [errors] names it. */
    private fun tickets(call: HttpCall, errors: Map<String, String> = emptyMap()): HttpResult {
        val sent = parse(call.body).jsonArray.map { it.jsonObject["to"]!!.jsonPrimitive.content }
        val data = sent.joinToString(",") { to ->
            errors[to]?.let {
                """{"status":"error","message":"\"$to\" is not a registered push notification recipient","details":{"error":"$it"}}"""
            } ?: """{"status":"ok","id":"r-${to.removePrefix("ExponentPushToken[").removeSuffix("]")}"}"""
        }
        return HttpResult(200, """{"data":[$data]}""")
    }

    @Test
    fun `messages are sent as Expo reads them, with the access token only when set`() {
        val transport = ScriptedTransport({ tickets(it) })
        val sender = ExpoPushSender("expo-secret", transport)
        val result = sender.send(listOf(message(1, priority = "high"), message(2).copy(body = null)))
        assertEquals(listOf(PushTicket.ok("r-device-1"), PushTicket.ok("r-device-2")), result)

        val call = transport.calls.single()
        assertEquals("POST", call.method)
        assertEquals("https://exp.host/--/api/v2/push/send", call.url)
        assertEquals("Bearer expo-secret", call.headers["Authorization"])
        assertEquals("application/json", call.headers["Content-Type"])
        assertEquals("application/json", call.headers["Accept"])
        val (first, second) = parse(call.body).jsonArray.map { it.jsonObject }
        assertEquals(
            parse(
                """{"to":"ExponentPushToken[device-1]","title":"Title 1","body":"Body 1","data":{"link":"/my/approvals/1"},""" +
                    """"sound":"default","badge":3,"channelId":"default","priority":"high"}""",
            ),
            first,
        )
        assertFalse("body" in second, "no body: left out")
        assertFalse("priority" in second, "Expo's default priority")

        val anonymous = ScriptedTransport({ tickets(it) })
        ExpoPushSender(null, anonymous).send(listOf(message(1)))
        assertNull(anonymous.calls.single().headers["Authorization"])
    }

    @Test
    fun `tickets come back in order, errors with Expo's code`() {
        val transport = ScriptedTransport({ tickets(it, mapOf("ExponentPushToken[device-2]" to PushSender.DEVICE_NOT_REGISTERED)) })
        val result = ExpoPushSender(null, transport).send((1..3).map(::message))
        assertEquals(listOf("r-device-1", null, "r-device-3"), result.map { it.id })
        assertEquals(listOf(null, "DeviceNotRegistered", null), result.map { it.error })
        assertTrue(result[1].message!!.contains("not a registered push notification recipient"))
        assertTrue(result[0].ok)
        assertFalse(result[1].ok)

        // A ticket missing from the answer, or one without details, is an error that isn't retried.
        val short = ScriptedTransport({ HttpResult(200, """{"data":[{"status":"error","message":"Oops"}]}""") })
        val partial = ExpoPushSender(null, short).send(listOf(message(1), message(2)))
        assertEquals(listOf("Unknown", ExpoPushSender.MISSING), partial.map { it.error })
        val odd = ExpoPushSender(null, ScriptedTransport({ HttpResult(200, """{"data":["?"]}""") })).send(listOf(message(1)))
        assertEquals(ExpoPushSender.MISSING, odd.single().error)
    }

    @Test
    fun `more than 100 messages go in requests of 100`() {
        val transport = ScriptedTransport({ tickets(it) })
        val result = ExpoPushSender(null, transport).send((1..250).map(::message))
        assertEquals(listOf(100, 100, 50), transport.calls.map { parse(it.body).jsonArray.size })
        assertEquals((1..250).map { "r-device-$it" }, result.map { it.id })
    }

    @Test
    fun `Expo down or busy is retried, a refused request is not`() {
        for (status in listOf(429, 500, 503)) {
            val sender = ExpoPushSender(null, ScriptedTransport({ HttpResult(status, "") }))
            assertFailsWith<RetryableSendException> { sender.send(listOf(message(1))) }
            assertFailsWith<RetryableSendException> { sender.receipts(listOf("r-1")) }
        }
        val unreachable = ExpoPushSender(null, HttpTransport { throw IOException("connection reset") })
        assertFailsWith<RetryableSendException> { unreachable.send(listOf(message(1))) }

        // A request-level refusal (bad access token, mixed projects): every message fails with its code.
        val refused = ScriptedTransport({ HttpResult(401, """{"errors":[{"code":"UNAUTHORIZED","message":"Bad access token"}]}""") })
        assertEquals(
            listOf(PushTicket.error("UNAUTHORIZED", "Bad access token"), PushTicket.error("UNAUTHORIZED", "Bad access token")),
            ExpoPushSender("wrong", refused).send(listOf(message(1), message(2))),
        )
        assertEquals(emptyMap(), ExpoPushSender("wrong", refused).receipts(listOf("r-1")))
        val garbage = ExpoPushSender(null, ScriptedTransport({ HttpResult(400, "<html>") })).send(listOf(message(1)))
        assertEquals(PushTicket.error("HTTP_400", "<html>"), garbage.single())
    }

    @Test
    fun `receipts are asked for in requests of 1000 and read by id`() {
        val transport = ScriptedTransport({ call ->
            val ids = parse(call.body).jsonObject["ids"]!!.jsonArray.map { it.jsonPrimitive.content }
            // The first is gone, the second too big, the rest fine; the last isn't ready yet.
            val data = ids.dropLast(1).joinToString(",") { id ->
                when (id) {
                    "r-0" -> """"$id":{"status":"error","message":"gone","details":{"error":"DeviceNotRegistered"}}"""
                    "r-1" -> """"$id":{"status":"error","message":"too big","details":{"error":"MessageTooBig"}}"""
                    else -> """"$id":{"status":"ok"}"""
                }
            }
            HttpResult(200, """{"data":{$data}}""")
        })
        val sender = ExpoPushSender("expo-secret", transport)
        val receipts = sender.receipts((0 until 1500).map { "r-$it" })
        assertEquals(listOf(1000, 500), transport.calls.map { parse(it.body).jsonObject["ids"]!!.jsonArray.size })
        assertEquals("https://exp.host/--/api/v2/push/getReceipts", transport.calls.first().url)
        assertEquals("Bearer expo-secret", transport.calls.first().headers["Authorization"])
        assertEquals(PushReceipt("DeviceNotRegistered", "gone"), receipts["r-0"])
        assertEquals(PushReceipt("MessageTooBig", "too big"), receipts["r-1"])
        assertTrue(receipts["r-2"]!!.ok)
        assertNull(receipts["r-999"], "not ready yet")
        assertEquals(1498, receipts.size)
    }

    @Test
    fun `a notification's push says only that something happened, with its app path and the unread count`() {
        val id = UUID.randomUUID()
        val row = NotificationRow(
            id, UUID.randomUUID(), "agent_approval", "Claude wants to: Block time", "Blocks Alex's Friday",
            "/dashboard/lumen-physio/approvals/1", UUID.randomUUID(), "Lumen Physiotherapy", Instant.EPOCH, null, null,
        )
        val m = PushHandler.message(row, "ExponentPushToken[abc]", 4)
        assertEquals("Lumen Physiotherapy", m.title, "the business it is about")
        assertEquals("Your AI assistant has a change waiting for your approval", m.body, "not what the agent proposes")
        assertEquals("high", m.priority)
        assertEquals(4, m.badge)
        assertEquals(
            JsonObject(
                mapOf(
                    "link" to JsonPrimitive("/dashboard/lumen-physio/approvals/1"), "notificationId" to JsonPrimitive(id.toString()),
                    "kind" to JsonPrimitive("agent_approval"),
                ),
            ),
            m.data,
        )
        // A locked phone shows no customer, service or time.
        val booking = row.copy(kind = "new_booking", title = "New booking: Jane Doe", body = "Consult · Tue 6 Oct, 11:00")
        val pushed = PushHandler.message(booking, "ExponentPushToken[abc]", 1)
        assertEquals("Lumen Physiotherapy" to "New booking", pushed.title to pushed.body)
        assertNull(pushed.priority)
        val texts = mapOf(
            "booking_request" to "A booking request needs your answer", "booking_cancelled" to "A booking was cancelled",
            "booking_moved" to "A booking was moved", "something_new" to "You have a new notification",
        )
        texts.forEach { (kind, text) -> assertEquals(text, PushHandler.message(booking.copy(kind = kind), "t", 1).body) }
        // A customer's, with no business: the app's name.
        assertEquals("bookanything", PushHandler.message(row.copy(businessId = null, businessName = null), "t", 1).title)
    }

    @Test
    fun `development logs what it would push, and off pushes nothing`() {
        val log = LogPushSender()
        assertTrue(log.enabled)
        assertEquals(listOf(PushTicket.ok(null), PushTicket.ok(null)), log.send(listOf(message(1), message(2))))
        assertEquals(emptyMap(), log.receipts(listOf("r-1")))
        assertFalse(DisabledPushSender.enabled)
        assertEquals("off", DisabledPushSender.name)
        assertTrue(DisabledPushSender.send(listOf(message(1))).none { it.ok })
        assertEquals(emptyMap(), DisabledPushSender.receipts(listOf("r-1")))
    }

    @Test
    fun `only Expo push tokens are accepted`() {
        assertTrue(PushTokens.isValid("ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"))
        assertTrue(PushTokens.isValid("ExpoPushToken[AbC-123_x]"))
        val bad = listOf(
            "", "ExponentPushToken[]", "ExponentPushToken[a b]", "ExponentPushToken[a]b]", "FCM[abc]", "abc", "ExponentPushToken[abc",
        )
        for (token in bad) {
            assertFalse(PushTokens.isValid(token), token)
        }
        assertFalse(PushTokens.isValid("ExponentPushToken[${"a".repeat(PushTokens.MAX_LENGTH)}]"))
    }
}
