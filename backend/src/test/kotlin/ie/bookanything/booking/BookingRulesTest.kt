package ie.bookanything.booking

import ie.bookanything.availability.Pricing
import ie.bookanything.notifications.NotificationKind
import ie.bookanything.offers.AppliedOffer
import ie.bookanything.offers.Discount
import ie.bookanything.offers.OfferRule
import ie.bookanything.offers.OfferSchedule
import ie.bookanything.offers.OfferStatus
import ie.bookanything.payments.PaymentStatus
import java.time.Instant
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull

/** Pure booking rules: no database. */
class BookingRulesTest {
    @Test
    fun `booking sources round-trip their booking_source wire values`() {
        assertEquals(listOf("public", "dashboard", "api", "ai"), BookingSource.entries.map { it.wire })
        BookingSource.entries.forEach { assertEquals(it, BookingSource.parse(it.wire)) }
        assertFailsWith<NoSuchElementException> { BookingSource.parse("phone") }
    }

    @Test
    fun `named status sets render as SQL IN lists of their wire values`() {
        assertEquals("b.status IN ('held', 'pending_approval', 'confirmed')", BookingStatus.sqlIn("b.status", BookingStatus.BLOCKING))
        assertEquals("b.status IN ('completed', 'no_show')", BookingStatus.sqlIn("b.status", BookingStatus.HAPPENED))
        assertEquals(
            "status IN ('held', 'pending_approval', 'confirmed', 'completed', 'no_show')",
            BookingStatus.sqlIn("status", BookingStatus.REDEEMING),
        )
        assertFailsWith<IllegalArgumentException> { BookingStatus.sqlIn("status", emptySet()) }
        assertFailsWith<IllegalArgumentException> { ie.bookanything.db.sqlIn("status", listOf("x') OR ('1' = '1")) }
    }

    @Test
    fun `customer cancellation reasons are trimmed, capped at 500 characters and dropped when blank`() {
        assertEquals("Ill", trimReason("  Ill \n"))
        assertEquals(500, trimReason("x".repeat(600))!!.length)
        assertNull(trimReason("   "))
        assertNull(trimReason(null))
    }
}

class NewBookingRulesTest {
    private val now = Instant.parse("2026-10-05T08:00:00Z")

    private fun quote(price: Int, mode: String = "full", deposit: Int? = null, offerOff: Int? = null) = BookingQuote(
        Pricing(60, price, null),
        offerOff?.let {
            AppliedOffer(
                OfferRule(
                    UUID.randomUUID(), "Deal", emptySet(), Discount.Fixed(it), OfferSchedule(emptySet(), emptyList(), null, null, null),
                    null, OfferStatus.ACTIVE, now,
                ),
                price, it,
            )
        },
        mode, deposit,
    )

    @Test
    fun `the amount due online is the deposit, capped at the price, for deposit services and the price otherwise`() {
        assertEquals(2000, BookingQuote.dueOnline("deposit", 2000, 5000))
        assertEquals(3000, BookingQuote.dueOnline("deposit", 4000, 3000))
        assertEquals(5000, BookingQuote.dueOnline("deposit", null, 5000))
        assertEquals(5000, BookingQuote.dueOnline("full", 2000, 5000))
        assertEquals(4000, quote(5000, "full", offerOff = 1000).dueNowCents) // offers lower what is due
        assertEquals(4000, quote(5000, "full", offerOff = 1000).priceCents)
        assertEquals(1500, quote(5000, "deposit", 1500, offerOff = 1000).dueNowCents)
    }

    @Test
    fun `online payment follows the service for AUTO, is forced by ONLINE and never charges free bookings`() {
        assertEquals(5000, NewBookingRules.onlineAmount(PaymentChoice.AUTO, true, quote(5000)))
        assertNull(NewBookingRules.onlineAmount(PaymentChoice.AUTO, false, quote(5000)))
        assertEquals(1000, NewBookingRules.onlineAmount(PaymentChoice.ONLINE, false, quote(5000, "deposit", 1000)))
        assertNull(NewBookingRules.onlineAmount(PaymentChoice.ONLINE, true, quote(0)))
        assertNull(NewBookingRules.onlineAmount(PaymentChoice.AUTO, true, quote(1000, offerOff = 1000)))
        assertNull(NewBookingRules.onlineAmount(PaymentChoice.AT_VENUE, true, quote(5000)))
        assertNull(NewBookingRules.onlineAmount(PaymentChoice.NONE, true, quote(5000)))
    }

    @Test
    fun `payment status and the stored deposit`() {
        assertEquals(PaymentStatus.PENDING, NewBookingRules.paymentStatus(PaymentChoice.AUTO, 5000, quote(5000)))
        assertEquals(PaymentStatus.PAY_AT_VENUE, NewBookingRules.paymentStatus(PaymentChoice.AT_VENUE, null, quote(5000)))
        assertEquals(PaymentStatus.PAY_AT_VENUE, NewBookingRules.paymentStatus(PaymentChoice.AUTO, null, quote(5000, "at_venue")))
        assertEquals(PaymentStatus.NOT_REQUIRED, NewBookingRules.paymentStatus(PaymentChoice.AUTO, null, quote(5000, "none")))
        assertEquals(PaymentStatus.NOT_REQUIRED, NewBookingRules.paymentStatus(PaymentChoice.AT_VENUE, null, quote(0)))
        assertEquals(PaymentStatus.NOT_REQUIRED, NewBookingRules.paymentStatus(PaymentChoice.NONE, null, quote(5000, "at_venue")))
        assertEquals(1000, NewBookingRules.depositCents(quote(5000, "deposit", 1000), 1000))
        assertNull(NewBookingRules.depositCents(quote(5000, "full"), 5000))
        assertNull(NewBookingRules.depositCents(quote(5000, "deposit", 1000), null))
    }

    @Test
    fun `initial status, hold expiry and next step`() {
        assertEquals(BookingStatus.HELD, NewBookingRules.initialStatus(paysOnline = true, public = true, requiresApproval = true))
        assertEquals(
            BookingStatus.PENDING_APPROVAL,
            NewBookingRules.initialStatus(paysOnline = false, public = true, requiresApproval = true),
        )
        assertEquals(BookingStatus.CONFIRMED, NewBookingRules.initialStatus(paysOnline = false, public = false, requiresApproval = true))
        assertEquals(BookingStatus.CONFIRMED, NewBookingRules.initialStatus(paysOnline = false, public = true, requiresApproval = false))
        assertEquals(now.plusSeconds(31 * 60), NewBookingRules.holdExpiry(BookingStatus.HELD, now, 31))
        assertNull(NewBookingRules.holdExpiry(BookingStatus.CONFIRMED, now, 31))
        assertEquals("payment_required", NewBookingRules.nextStep(BookingStatus.HELD))
        assertEquals("pending_approval", NewBookingRules.nextStep(BookingStatus.PENDING_APPROVAL))
        assertEquals("confirmed", NewBookingRules.nextStep(BookingStatus.CONFIRMED))
        assertEquals("expired", NewBookingRules.nextStep(BookingStatus.EXPIRED))
        assertEquals("cancelled", NewBookingRules.nextStep(BookingStatus.CANCELLED))
        assertEquals("confirmed", NewBookingRules.nextStep(BookingStatus.COMPLETED))
    }

    @Test
    fun `a new booking emails the customer and the business by status`() {
        val n = NewBookingRules::notifications
        assertEquals(listOf(NotificationKind.PAYMENT_REQUESTED), n(BookingStatus.HELD, false, true))
        assertEquals(emptyList(), n(BookingStatus.HELD, false, false))
        assertEquals(emptyList(), n(BookingStatus.HELD, true, true))
        assertEquals(
            listOf(NotificationKind.BOOKING_CONFIRMED, NotificationKind.NEW_BOOKING_FOR_BUSINESS),
            n(BookingStatus.CONFIRMED, true, true),
        )
        assertEquals(listOf(NotificationKind.BOOKING_CONFIRMED), n(BookingStatus.CONFIRMED, false, true))
        assertEquals(emptyList(), n(BookingStatus.CONFIRMED, false, false))
        assertEquals(
            listOf(NotificationKind.BOOKING_PENDING_APPROVAL, NotificationKind.NEW_BOOKING_FOR_BUSINESS),
            n(BookingStatus.PENDING_APPROVAL, true, false),
        )
    }

    @Test
    fun `a customer just emailed about a booking within a day gets no reminder on top`() {
        val soon = now.plus(java.time.Duration.ofHours(3))
        assertEquals(now, NewBookingRules.reminderSentAt(soon, now, customerEmailed = true))
        assertNull(NewBookingRules.reminderSentAt(soon, now, customerEmailed = false), "not told, so still reminded")
        assertNull(NewBookingRules.reminderSentAt(now.plus(NewBookingRules.REMINDER_LEAD), now, customerEmailed = true))
        assertNull(NewBookingRules.reminderSentAt(now.plus(java.time.Duration.ofDays(3)), now, customerEmailed = true))
    }

    @Test
    fun `a booking's online amount is its deposit, else its price`() {
        assertEquals(1500, bookingRow(priceCents = 5000, depositCents = 1500).onlineAmountCents)
        assertEquals(5000, bookingRow(priceCents = 5000).onlineAmountCents)
    }
}
