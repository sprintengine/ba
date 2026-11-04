package ie.bookanything.support

import ie.bookanything.notifications.HttpCall
import ie.bookanything.notifications.HttpResult
import ie.bookanything.notifications.HttpTransport
import ie.bookanything.notifications.push.PushMessage
import ie.bookanything.notifications.push.PushReceipt
import ie.bookanything.notifications.push.PushSender
import ie.bookanything.notifications.push.PushTicket
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Records push notifications instead of sending them, answering as scripted: [ticket] per message (accepted with a
 * fresh receipt id by default), [receipt] per receipt id asked about (`ok` by default; null = not ready yet), and
 * [failure] thrown instead of sending (Expo down).
 */
class FakePushSender : PushSender {
    override val name = "fake"
    override val enabled = true
    val sent = CopyOnWriteArrayList<PushMessage>()

    /** Each `send` call's messages: one per request to Expo. */
    val requests = CopyOnWriteArrayList<List<PushMessage>>()
    val receiptRequests = CopyOnWriteArrayList<List<String>>()

    @Volatile var ticket: (PushMessage) -> PushTicket = { PushTicket.ok("ticket-${UUID.randomUUID()}") }

    @Volatile var receipt: (String) -> PushReceipt? = { PushReceipt(null) }

    @Volatile var failure: Exception? = null

    override fun send(messages: List<PushMessage>): List<PushTicket> {
        failure?.let { throw it }
        requests += messages
        sent += messages
        return messages.map { ticket(it) }
    }

    override fun receipts(ids: List<String>): Map<String, PushReceipt> {
        failure?.let { throw it }
        receiptRequests += ids
        return ids.mapNotNull { id -> receipt(id)?.let { id to it } }.toMap()
    }

    /** What was pushed to [token]. */
    fun to(token: String): List<PushMessage> = sent.filter { it.to == token }
}

/** Answers provider calls in turn from [responses] (the last one repeats) and records them. */
class ScriptedTransport(private vararg val responses: (HttpCall) -> HttpResult) : HttpTransport {
    val calls = CopyOnWriteArrayList<HttpCall>()

    override fun execute(call: HttpCall): HttpResult {
        calls += call
        return responses[minOf(calls.size - 1, responses.size - 1)](call)
    }
}

/** A fresh Expo push token, unique to the test. */
fun expoToken(prefix: String = "t"): String = "ExponentPushToken[${unique(prefix)}]"
