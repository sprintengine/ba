package ie.bookanything.assistant.tools

import ie.bookanything.auth.BusinessAccess
import ie.bookanything.booking.BookingModule
import ie.bookanything.db.Db
import ie.bookanything.payments.PaymentProvider
import java.time.Clock

/** Builds the [ToolContext] for a member (tools always run as the signed-in member). */
class ToolContexts(
    private val db: Db,
    private val clock: Clock,
    private val bookings: BookingModule,
    private val payments: PaymentProvider,
) {
    fun forMember(access: BusinessAccess) = ToolContext(db, access, clock, bookings.engine, bookings.staff, payments)
}
