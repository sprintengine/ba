package ie.bookanything.notifications

import ie.bookanything.support.RecordingEmailSender
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** Email to special-use domains (the simulation's customers on staging) is never handed to the provider. */
class SkipUndeliverableTest {
    private fun message(to: String) = EmailMessage(to, "Hi", "text", "<p>html</p>", "booking_confirmed")

    @Test
    fun `addresses on special-use domains are skipped and everything else is sent`() {
        listOf("a@sim.bookanything.test", "guest@example.test", "x@foo.EXAMPLE", "x@nowhere.invalid", "x@localhost", "x@a.test.")
            .forEach { assertTrue(SkipUndeliverable.undeliverable(it), it) }
        listOf("owner@bookanything.ie", "a@example.com", "a@test.ie", "a@testing.dev", "a@sim.bookanything.ie", "test@gmail.com")
            .forEach { assertFalse(SkipUndeliverable.undeliverable(it), it) }

        val provider = RecordingEmailSender()
        val sender = SkipUndeliverable(provider)
        assertEquals(provider.from, sender.from)
        assertEquals(SendResult("skipped", null), sender.send(message("sim-abc-customer1@sim.bookanything.test")))
        assertEquals("sent", sender.send(message("customer@bookanything.ie")).status)
        assertEquals(listOf("customer@bookanything.ie"), provider.sent.map { it.to })
    }
}
