package ie.bookanything.notifications

import ie.bookanything.AppContext
import ie.bookanything.http.Errors
import ie.bookanything.payments.CancelActor
import io.ktor.http.ContentType
import io.ktor.server.response.respondText
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import java.io.File

/** Sample renders of every email template with fictional data, for design review. */
object EmailPreviews {
    private val brand = EmailBrand(
        businessName = "Lumen Physiotherapy",
        primaryColor = "#0f766e",
        contactEmail = "hello@lumen-physio.example",
        contactPhone = "+353 1 555 0142",
        address = "12 Harbour Road, Dún Laoghaire, A96 X2Y3",
        bookingPageUrl = "http://localhost:3000/lumen-physio",
    )

    private val facts = BookingFacts(
        customerName = "Jordan Byrne",
        bookingNoun = "appointment",
        serviceLabel = "Sports massage (60 minutes)",
        whenText = "Thursday 8 October 2026 at 10:30",
        durationText = "1 hour",
        withText = "Casey Lane",
        locationText = "12 Harbour Road, Dún Laoghaire, A96 X2Y3",
        reference = "BA-7K3F9Q",
        priceText = "€65.00",
        paymentText = "Paid online: €65.00",
        manageUrl = "http://localhost:3000/manage/sample-token",
        policyText = "Need to change plans? You can cancel or reschedule online up to 24 hours before the start.",
    )

    fun content(template: String): EmailTemplates.Content? = when (template) {
        EmailTemplates.BOOKING_CONFIRMED -> EmailTemplates.bookingConfirmed(brand, facts)
        EmailTemplates.PENDING_APPROVAL -> EmailTemplates.pendingApproval(brand, facts, paid = true)
        EmailTemplates.APPROVED -> EmailTemplates.approved(brand, facts)
        EmailTemplates.DECLINED -> EmailTemplates.declined(
            brand, facts, "We're fully booked with post-surgery clients that week.", "€65.00",
        )
        EmailTemplates.CANCELLED -> EmailTemplates.cancelled(
            brand, facts, CancelActor.CUSTOMER, "Can't make it any more", "€32.50", refundPending = false, paidOnline = true,
        )
        EmailTemplates.RESCHEDULED -> EmailTemplates.rescheduled(brand, facts, "Tuesday 6 October 2026 at 09:00")
        EmailTemplates.REMINDER -> EmailTemplates.reminder(brand, facts)
        EmailTemplates.PAYMENT_REQUESTED -> EmailTemplates.paymentRequested(
            brand, facts.copy(paymentText = "Awaiting payment: €65.00"),
            "€65.00", "10:45 on Monday 5 October", "http://localhost:3000/dev/checkout/sample-payment",
        )
        EmailTemplates.PAYMENT_REFUNDED -> EmailTemplates.paymentRefunded(brand, facts, "€65.00")
        EmailTemplates.REFUND_APOLOGY -> EmailTemplates.refundApology(brand, facts, "€65.00")
        EmailTemplates.REFUND_FAILED -> EmailTemplates.refundFailed(brand, facts, "€65.00")
        EmailTemplates.TEAM_INVITATION -> EmailTemplates.teamInvitation(
            brand, "Avery Morgan", "staff", "http://localhost:3000/invitations/sample-token",
        )
        EmailTemplates.NEW_BOOKING_FOR_BUSINESS -> EmailTemplates.newBookingForBusiness(
            brand,
            NewBookingFacts(
                facts, "jordan.byrne@example.test", "+353 87 555 0199", "Confirmed", needsApproval = false,
                "http://localhost:3000/dashboard/lumen-physio/bookings",
            ),
        )
        EmailTemplates.NOTIFICATION -> EmailTemplates.notification(
            "Claude wants to: Cancel 1 appointment", "Jordan Byrne, Thursday 8 October at 10:30. Refund €65.00.",
            "Lumen Physiotherapy", "http://localhost:3000/dashboard/lumen-physio/approvals/sample",
            "http://localhost:3000/my/notifications",
        )
        else -> null
    }

    fun render(template: String): EmailMessage? =
        content(template)?.let { EmailTemplates.toMessage(brand, it, "jordan.byrne@example.test") }

    fun index(): String = buildString {
        append("<!doctype html><html><head><meta charset=\"utf-8\"><title>Email previews</title></head>")
        append("<body style=\"font-family:system-ui,sans-serif;max-width:640px;margin:40px auto\"><h1>bookanything email previews</h1><ul>")
        EmailTemplates.ALL.forEach { t ->
            append("<li style=\"margin:6px 0\"><a href=\"emails/$t\">$t</a> · <a href=\"emails/$t?format=text\">text</a></li>")
        }
        append("</ul></body></html>")
    }

    /** CLI: writes every preview as .html and .txt into [dir]. */
    fun writeAll(dir: File): List<File> {
        dir.mkdirs()
        return EmailTemplates.ALL.flatMap { t ->
            val m = render(t)!!
            listOf(
                File(dir, "$t.html").apply { writeText(m.html) },
                File(dir, "$t.txt").apply { writeText("Subject: ${m.subject}\n\n${m.text}") },
            )
        }
    }
}

/** `GET /v1/dev/emails` and `GET /v1/dev/emails/{template}[?format=text]`: development only (404 in production). */
fun Route.emailPreviewRoutes(ctx: AppContext) {
    get("/dev/emails") {
        if (ctx.config.isProduction) throw Errors.notFound()
        call.respondText(EmailPreviews.index(), ContentType.Text.Html)
    }
    get("/dev/emails/{template}") {
        if (ctx.config.isProduction) throw Errors.notFound()
        val m = EmailPreviews.render(call.parameters["template"].orEmpty()) ?: throw Errors.notFound("Template")
        if (call.request.queryParameters["format"] == "text") {
            call.respondText("Subject: ${m.subject}\n\n${m.text}", ContentType.Text.Plain)
        } else {
            call.respondText(m.html, ContentType.Text.Html)
        }
    }
}
