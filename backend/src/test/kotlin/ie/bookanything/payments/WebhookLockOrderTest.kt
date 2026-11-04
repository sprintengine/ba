package ie.bookanything.payments

import ie.bookanything.support.Fixtures
import ie.bookanything.support.Money
import ie.bookanything.support.StripeTest
import ie.bookanything.support.StripeWorld
import ie.bookanything.support.TestDatabase
import ie.bookanything.support.s
import ie.bookanything.support.withApp
import java.sql.SQLException
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.fail

/**
 * Lock order: everything that changes a booking and its payments locks the booking first, then the payment. A webhook
 * that locked the payment first (by recording the PaymentIntent) and then waited for the booking deadlocked with a
 * cancellation holding the booking and cancelling its pending charge.
 */
class WebhookLockOrderTest {
    @Test
    fun `a payment webhook waits for the booking before it touches the payment`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val account = s.connect(clinic)
            val held = Fixtures.book(api, clinic, "Paid consult", "2026-10-07T09:00:00+01:00")
            val bookingId = UUID.fromString(Money.bookingId(held))
            s.send(api, s.sessionCompleted(bookingId.toString(), account, 5000, "pi_lock_order")) // stored, not yet applied

            val worker = Executors.newSingleThreadExecutor()
            TestDatabase.dataSource.connection.use { cancellation ->
                cancellation.autoCommit = false
                // A cancellation in progress: it holds the booking...
                cancellation.prepareStatement("SELECT id FROM bookings WHERE id = ? FOR UPDATE").use { st ->
                    st.setObject(1, bookingId)
                    st.executeQuery().close()
                }
                val applying = worker.submit { s.worker.drain() }
                awaitBlockedBackend()
                // ...and goes on to cancel the booking's pending charge. The webhook must not hold that row meanwhile.
                cancellation.createStatement().use { it.execute("SET LOCAL lock_timeout = '3s'") }
                try {
                    cancellation.prepareStatement("UPDATE payments SET updated_at = now() WHERE booking_id = ?").use { st ->
                        st.setObject(1, bookingId)
                        st.executeUpdate()
                    }
                } catch (e: SQLException) {
                    fail("The webhook held the payment while waiting for the booking (deadlock risk): ${e.message}")
                }
                cancellation.commit()
                applying.get(30, TimeUnit.SECONDS)
            }
            worker.shutdown()
            assertEquals("confirmed paid, paid 5000, refunded 0", Money.state(Money.view(api, held)))
        }
    }

    @Test
    fun `a refund webhook waits for the booking before it touches the refunds`() {
        val s = StripeWorld()
        withApp(s.env) { api ->
            val clinic = Fixtures.clinic(api)
            val account = s.connect(clinic)
            val held = Fixtures.book(api, clinic, "Paid consult", "2026-10-08T09:00:00+01:00")
            val bookingId = UUID.fromString(Money.bookingId(held))
            s.send(api, s.sessionCompleted(bookingId.toString(), account, 5000, "pi_refund_order"))
            s.worker.drain()
            // Stripe made the refund but our call timed out: the refund is pending when charge.refunded arrives.
            s.gateway.failRefunds.set(1)
            api.post("/v1/public/manage/${held.s("manageToken")}/cancel")
            val refunded = mapOf(
                "id" to "ch_order", "object" to "charge", "payment_intent" to "pi_refund_order",
                "amount" to 5000, "amount_refunded" to 5000,
            )
            s.send(api, StripeTest.event("charge.refunded", refunded, account)) // stored, not yet applied

            val worker = Executors.newSingleThreadExecutor()
            TestDatabase.dataSource.connection.use { settling ->
                settling.autoCommit = false
                // Our refund's answer being recorded: it holds the booking...
                settling.prepareStatement("SELECT id FROM bookings WHERE id = ? FOR UPDATE").use { st ->
                    st.setObject(1, bookingId)
                    st.executeQuery().close()
                }
                val applying = worker.submit { s.worker.drain() }
                awaitBlockedBackend()
                // ...and goes on to lock the refund. The webhook must not hold it meanwhile.
                settling.createStatement().use { it.execute("SET LOCAL lock_timeout = '3s'") }
                try {
                    val lockRefund = "SELECT id FROM payments WHERE booking_id = ? AND kind = 'refund' FOR UPDATE"
                    settling.prepareStatement(lockRefund).use { st ->
                        st.setObject(1, bookingId)
                        st.executeQuery().close()
                    }
                } catch (e: SQLException) {
                    fail("The webhook held the refund while waiting for the booking (deadlock risk): ${e.message}")
                }
                settling.commit()
                applying.get(30, TimeUnit.SECONDS)
            }
            worker.shutdown()
            // Applied, not aborted: had the webhook locked the refund first, Postgres would have ended one side as a
            // deadlock (and the refund would still be pending here).
            assertEquals(listOf("charge succeeded 5000", "refund succeeded 5000"), Money.ledger(bookingId.toString()))
        }
    }

    /** Polls until some backend waits for a row lock (the worker, blocked on the booking), for at most 10 seconds. */
    private fun awaitBlockedBackend() {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10)
        while (System.nanoTime() < deadline) {
            val waiting = Fixtures.sqlOne("SELECT count(*) FROM pg_locks WHERE NOT granted") { it.getInt(1) } ?: 0
            if (waiting > 0) return
            Thread.onSpinWait()
        }
        fail("the webhook never waited for the booking lock")
    }
}
