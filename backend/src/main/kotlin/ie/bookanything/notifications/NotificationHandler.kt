package ie.bookanything.notifications

import ie.bookanything.auth.TokenService
import ie.bookanything.booking.BookingRepository
import ie.bookanything.booking.BookingRow
import ie.bookanything.booking.BookingStatus
import ie.bookanything.business.BusinessRepository
import ie.bookanything.business.BusinessRow
import ie.bookanything.config.AppUrls
import ie.bookanything.db.Db
import ie.bookanything.jobs.Job
import ie.bookanything.notifications.inbox.Inbox
import ie.bookanything.payments.Money
import ie.bookanything.payments.PaymentStatus
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.slf4j.LoggerFactory
import java.sql.Connection
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.UUID

/**
 * Renders and sends a notification job with [EmailTemplates]. Emails are business-branded,
 * include the manage link and never include form answers (sensitive or otherwise).
 */
class NotificationHandler(
    private val db: Db,
    private val email: EmailSender,
    private val sms: SmsSender,
    private val tokens: TokenService,
    private val urls: AppUrls,
    private val inbox: Inbox,
) {
    private val log = LoggerFactory.getLogger(NotificationHandler::class.java)

    fun handle(job: Job) {
        val p = job.payload
        val kind = p["kind"]?.jsonPrimitive?.content ?: return
        val businessId = UUID.fromString(p["businessId"]?.jsonPrimitive?.content ?: return)
        db.txBlocking { conn ->
            val business = BusinessRepository.findById(conn, businessId) ?: return@txBlocking
            val brand = brand(business)
            val booking = p["bookingId"]?.jsonPrimitive?.content?.let { BookingRepository.get(conn, businessId, UUID.fromString(it)) }
            // A reminder is queued for a confirmed booking, but the job may run (or retry) after it was cancelled or moved
            // out of the confirmed state: then there is nothing to remind about, by email or SMS.
            if (kind == NotificationKind.BOOKING_REMINDER && booking?.status != BookingStatus.CONFIRMED) return@txBlocking
            val messages = when {
                kind == NotificationKind.TEAM_INVITATION -> listOf(invitation(conn, brand, p))
                booking != null -> bookingEmails(conn, kind, business, brand, booking, p)
                else -> return@txBlocking
            }
            if (kind == NotificationKind.NEW_BOOKING_FOR_BUSINESS && booking != null) tellTeam(conn, business, booking)
            messages.forEachIndexed { i, m ->
                NotificationRepository.logEmail(conn, businessId, m, email.send(m.copy(idempotencyKey = "${job.id}:$i")))
            }
            if (kind == NotificationKind.BOOKING_REMINDER && sms.enabled && business.plan.isPaid && booking != null) {
                booking.customer.phone?.let { phone -> sendReminderSms(business, booking, phone) }
            }
        }
    }

    /** Whenever the business is emailed about a customer's new booking, its team is told in the app too (section 22). */
    private fun tellTeam(conn: Connection, business: BusinessRow, booking: BookingRow) {
        val event = if (booking.status == BookingStatus.PENDING_APPROVAL) Inbox.TeamEvent.REQUEST else Inbox.TeamEvent.NEW
        inbox.team(conn, business, booking, event)
    }

    private fun invitation(conn: Connection, brand: EmailBrand, p: JsonObject): EmailMessage {
        val memberId = UUID.fromString(p["memberId"]!!.jsonPrimitive.content)
        val content = EmailTemplates.teamInvitation(
            brand, p["inviterName"]?.jsonPrimitive?.content ?: "A colleague", NotificationRepository.memberRole(conn, memberId),
            urls.invitation(tokens.inviteToken(memberId)),
        )
        return EmailTemplates.toMessage(brand, content, p["email"]!!.jsonPrimitive.content)
    }

    /** Reminder SMS are best effort: a failure is logged and never re-sends the emails. */
    private fun sendReminderSms(business: BusinessRow, b: BookingRow, phone: String) {
        val body = "Reminder: ${b.serviceName} with ${business.name}, ${whenText(business, b.start)}. Ref ${b.reference}. Manage: " +
            "${manageUrl(b.id)}"
        try {
            val r = sms.send(SmsMessage(phone, body))
            log.info("reminder sms booking={} status={}", b.id, r.status)
        } catch (@Suppress("TooGenericExceptionCaught") e: Exception) { // Best effort: the email reminder already went out.
            log.warn("reminder sms failed booking={}: {}", b.id, e.message)
        }
    }

    private fun manageUrl(bookingId: UUID) = urls.manage(tokens.manageToken(bookingId))

    fun brand(business: BusinessRow) = EmailBrand(
        businessName = business.name,
        primaryColor = business.branding.primaryColor,
        logoUrl = business.branding.logoUrl,
        contactEmail = business.contactEmail,
        contactPhone = business.contactPhone,
        address = addressText(business),
        bookingPageUrl = urls.bookingPage(business.slug),
    )

    private fun addressText(business: BusinessRow) = with(business.address) {
        listOfNotNull(line1, line2, city, postcode).map { it.trim() }.filter { it.isNotEmpty() }.joinToString(", ").ifEmpty { null }
    }

    private fun whenText(business: BusinessRow, at: java.time.Instant): String {
        val fmt = DateTimeFormatter.ofPattern("EEEE d MMMM yyyy 'at' HH:mm", Locale.forLanguageTag(business.locale))
        return ZonedDateTime.ofInstant(at, business.zone).format(fmt)
    }

    private fun facts(conn: Connection, business: BusinessRow, b: BookingRow, withManageLink: Boolean): BookingFacts {
        val locationType = NotificationRepository.serviceLocationType(conn, business.id, b.serviceId)
        val m = { cents: Int -> money(cents, b.currency, business.locale) }
        val payment = when (b.paymentStatus) {
            PaymentStatus.PAID -> when {
                b.amountPaidInPersonCents > 0 -> "Paid: ${m(b.amountPaidCents)}"
                b.depositCents != null && b.amountPaidCents < b.priceCents ->
                    "Deposit paid: ${m(b.amountPaidCents)} (${m(b.priceCents - b.amountPaidCents)} due at the venue)"
                else -> "Paid online: ${m(b.amountPaidCents)}"
            }
            PaymentStatus.PARTIALLY_REFUNDED, PaymentStatus.REFUNDED -> "Paid ${m(b.amountPaidCents)}, refunded ${m(b.amountRefundedCents)}"
            PaymentStatus.PAY_AT_VENUE -> "Pay at the venue: ${m(b.priceCents)}"
            PaymentStatus.PENDING -> "Awaiting payment: ${m(b.onlineAmountCents)}"
            PaymentStatus.NOT_REQUIRED, PaymentStatus.FAILED -> if (b.priceCents == 0) "Free" else null
        }
        val p = business.policies
        val window = if (p.cancellationNoticeHours ==
            0
        ) {
            "any time before the start"
        } else {
            "up to ${hours(p.cancellationNoticeHours)} before the start"
        }
        val policy = when {
            p.allowCustomerCancel && p.allowCustomerReschedule -> "Need to change plans? You can cancel or reschedule online $window."
            p.allowCustomerCancel -> "Need to change plans? You can cancel online $window."
            else -> "Need to change plans? Please contact ${business.name}."
        }
        return BookingFacts(
            customerName = b.customer.name,
            bookingNoun = business.vocabulary.booking.lowercase(),
            serviceLabel = b.serviceName + b.optionName?.let { " ($it)" }.orEmpty() +
                b.addons.takeIf { it.isNotEmpty() }?.joinToString(", ", prefix = " + ") { it.name }.orEmpty(),
            whenText = whenText(business, b.start),
            durationText = duration(b.durationMinutes),
            withText = b.resources.filter { it.kind == "person" }.joinToString(", ") { it.name }.ifEmpty { null },
            locationText = when (locationType) {
                "online" -> "Online (${business.name} will send joining details)"
                "customer" -> "At your address"
                else -> addressText(business)
            },
            reference = b.reference,
            priceText = if (b.priceCents > 0) m(b.priceCents) else null,
            paymentText = payment,
            manageUrl = if (withManageLink) manageUrl(b.id) else null,
            policyText = policy,
        )
    }

    private fun bookingEmails(
        conn: Connection, kind: String, business: BusinessRow, brand: EmailBrand, b: BookingRow, p: JsonObject,
    ): List<EmailMessage> {
        val amount = p["amountCents"]?.jsonPrimitive?.content?.toIntOrNull()?.takeIf { it > 0 }
        val refundText = amount?.let { money(it, b.currency, business.locale) }
        if (kind == NotificationKind.NEW_BOOKING_FOR_BUSINESS) {
            val f = facts(conn, business, b, withManageLink = false)
            val content = EmailTemplates.newBookingForBusiness(
                brand,
                NewBookingFacts(
                    booking = f, customerEmail = b.customer.email, customerPhone = b.customer.phone,
                    statusText = b.status.label.replaceFirstChar { it.uppercase() },
                    needsApproval = b.status == BookingStatus.PENDING_APPROVAL,
                    dashboardUrl = urls.dashboardBookings(business.slug),
                ),
            )
            // Replies go to the customer.
            return businessRecipients(conn, business).map { EmailTemplates.toMessage(brand, content, it, replyTo = b.customer.email) }
        }
        val to = b.customer.email ?: return emptyList()
        val f = facts(conn, business, b, withManageLink = true)
        val content = when (kind) {
            NotificationKind.BOOKING_CONFIRMED -> EmailTemplates.bookingConfirmed(brand, f)
            NotificationKind.BOOKING_PENDING_APPROVAL -> EmailTemplates.pendingApproval(brand, f, paid = b.amountPaidOnlineCents > 0)
            NotificationKind.BOOKING_APPROVED -> EmailTemplates.approved(brand, f)
            NotificationKind.BOOKING_DECLINED -> EmailTemplates.declined(brand, f, b.cancellationReason, refundText)
            NotificationKind.BOOKING_CANCELLED -> EmailTemplates.cancelled(
                brand, f, b.cancelledBy, b.cancellationReason, refundText,
                refundPending = p["refundPending"] != null, paidOnline = b.amountPaidOnlineCents > 0,
            )
            NotificationKind.BOOKING_RESCHEDULED -> EmailTemplates.rescheduled(
                brand, f,
                p["previousStart"]?.jsonPrimitive?.content?.let {
                    runCatching { whenText(business, java.time.Instant.parse(it)) }.getOrNull()
                },
            )
            NotificationKind.BOOKING_REMINDER -> EmailTemplates.reminder(brand, f)
            NotificationKind.PAYMENT_REQUESTED -> {
                // Only while the booking is still waiting for payment when the job runs.
                val hold = b.holdExpiresAt ?: return emptyList()
                if (b.status != BookingStatus.HELD) return emptyList()
                val checkout = NotificationRepository.pendingCheckoutUrl(conn, business.id, b.id) ?: return emptyList()
                val due = money(b.onlineAmountCents - b.amountPaidCents, b.currency, business.locale)
                val until = ZonedDateTime.ofInstant(hold, business.zone).format(
                    DateTimeFormatter.ofPattern("HH:mm 'on' EEEE d MMMM", Locale.forLanguageTag(business.locale)),
                )
                EmailTemplates.paymentRequested(brand, f, due, until, checkout)
            }
            NotificationKind.PAYMENT_REFUNDED -> {
                val text = refundText ?: return emptyList()
                if (p["apology"] != null) EmailTemplates.refundApology(brand, f, text) else EmailTemplates.paymentRefunded(brand, f, text)
            }
            else -> return emptyList()
        }
        return listOf(EmailTemplates.toMessage(brand, content, to))
    }

    private fun businessRecipients(conn: Connection, business: BusinessRow): List<String> =
        business.contactEmail?.let { listOf(it) } ?: NotificationRepository.ownerEmails(conn, business.id)

    companion object {
        /** Emails write amounts in the business's locale, always with the currency's decimals ("€40.00"). */
        fun money(cents: Int, currency: String, locale: String): String =
            Money.format(cents, currency, Locale.forLanguageTag(locale), dropWholeDecimals = false)

        fun duration(minutes: Int): String {
            val h = minutes / 60
            val m = minutes % 60
            return when {
                h == 0 -> "$m min"
                m == 0 -> if (h == 1) "1 hour" else "$h hours"
                else -> "$h hr $m min"
            }
        }

        fun hours(h: Int) = when {
            h % 24 == 0 && h >= 48 -> "${h / 24} days"
            h == 1 -> "1 hour"
            else -> "$h hours"
        }
    }
}
