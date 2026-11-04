package ie.bookanything.booking

import ie.bookanything.auth.TokenService
import ie.bookanything.config.AppUrls
import ie.bookanything.db.Db
import ie.bookanything.notifications.inbox.Inbox
import ie.bookanything.payments.PaymentProvider
import ie.bookanything.payments.PaymentService
import java.time.Clock

/**
 * The booking feature's services, built once by `AppContext` and shared by the dashboard, the public and manage
 * routes, `/me`, Bo's tools, the customer MCP and the job worker, so every entry point runs the same commands.
 */
class BookingModule(db: Db, clock: Clock, tokens: TokenService, provider: PaymentProvider, urls: AppUrls, inbox: Inbox) {
    val payments = PaymentService(provider)
    val engine = BookingEngine(db, clock, tokens, payments, urls, inbox)
    val refunds = RefundSettlement(db, payments)
    val lifecycle = BookingLifecycle(engine, refunds, inbox)
    val availability = BookingAvailability(engine)
    val staff = StaffBookingCommands(engine, lifecycle, availability)
    val customer = CustomerBookingCommands(db, clock, engine, lifecycle, availability)
    val public = PublicBookingService(db, clock, tokens, provider, engine, availability)
}
