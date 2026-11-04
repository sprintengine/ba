package ie.bookanything.booking

import ie.bookanything.AppContext
import ie.bookanything.business.BusinessRepository
import ie.bookanything.business.BusinessViews
import ie.bookanything.business.PublicBusiness
import ie.bookanything.http.Errors
import ie.bookanything.http.pathUuid
import ie.bookanything.http.receiveBody
import ie.bookanything.payments.PaymentDto
import ie.bookanything.payments.PaymentRepository
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import kotlinx.serialization.Serializable

@Serializable
data class DevPaymentView(val payment: PaymentDto, val booking: ManagedBookingDto, val business: PublicBusiness)

@Serializable
data class DevPaymentOutcome(val outcome: String)

@Serializable
data class RedirectResponse(val redirectUrl: String)

/** The development checkout only exists with the dev payment provider, and never in production: NOT_FOUND otherwise. */
private fun requireDevPayments(ctx: AppContext) {
    if (ctx.payments.name != "dev" || ctx.config.isProduction) throw Errors.notFound()
}

/** The development payment provider's checkout (`/dev/checkout/{paymentId}` in the app calls these). */
fun Route.devPaymentRoutes(ctx: AppContext) {
    val lifecycle = ctx.booking.lifecycle

    get("/dev-payments/{paymentId}") {
        requireDevPayments(ctx)
        val paymentId = call.pathUuid("paymentId")
        val view = ctx.db.read { conn ->
            val payment = PaymentRepository.get(conn, paymentId) ?: return@read null
            val business = BusinessRepository.findById(conn, payment.businessId) ?: return@read null
            val booking = BookingRepository.get(conn, business.id, payment.bookingId) ?: return@read null
            DevPaymentView(
                payment.toDto(business), BookingViews.managedView(booking, business, ctx.now()),
                BusinessViews.toPublic(ctx.payments, conn, business),
            )
        } ?: throw Errors.notFound("Payment")
        call.respond(view)
    }

    post("/dev-payments/{paymentId}/complete") {
        requireDevPayments(ctx)
        val paymentId = call.pathUuid("paymentId")
        val input = call.receiveBody<DevPaymentOutcome>()
        if (input.outcome != "succeeded" && input.outcome != "cancelled") throw Errors.field("outcome", "Must be succeeded or cancelled")
        val redirect = ctx.db.tx { conn ->
            val payment = PaymentRepository.get(conn, paymentId) ?: throw Errors.notFound("Payment")
            val business = BusinessRepository.findById(conn, payment.businessId) ?: throw Errors.notFound("Payment")
            if (input.outcome == "succeeded") {
                lifecycle.paymentSucceeded(conn, business, payment, ctx.now())
            } else {
                lifecycle.paymentCancelled(conn, business, payment, ctx.now())
            }
            val manage = ctx.config.urls.manage(
                ctx.tokens.manageToken(payment.bookingId),
                origin =
                payment.returnUrl ?: ctx.config.appBaseUrl,
            )
            "$manage?payment=${input.outcome}"
        }
        call.respond(RedirectResponse(redirect))
    }
}
