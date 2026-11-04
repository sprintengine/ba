package ie.bookanything.notifications

import ie.bookanything.payments.CancelActor
/** Business branding and contact details shown in every email. */
data class EmailBrand(
    val businessName: String,
    val primaryColor: String,
    val logoUrl: String? = null,
    val contactEmail: String? = null,
    val contactPhone: String? = null,
    val address: String? = null,
    /** Public booking page, e.g. https://bookanything.ie/lumen-physio */
    val bookingPageUrl: String? = null,
) {
    /** "+353 1 555 0142 · hello@example.ie", or null without either. */
    val contactLine: String? get() = listOfNotNull(contactPhone, contactEmail).joinToString(" · ").ifEmpty { null }
}

/**
 * What the customer booked, already formatted for the business's locale and timezone.
 * Deliberately has no form answers: emails never contain them (sensitive or not).
 */
data class BookingFacts(
    val customerName: String,
    /** Lower-case vocabulary noun, e.g. "booking", "appointment", "lesson". */
    val bookingNoun: String,
    val serviceLabel: String,
    val whenText: String,
    val durationText: String,
    val withText: String? = null,
    val locationText: String? = null,
    val reference: String,
    val priceText: String? = null,
    /** e.g. "Paid online: €50.00" or "Pay at the venue: €30.00". */
    val paymentText: String? = null,
    val manageUrl: String? = null,
    /** e.g. "You can cancel or reschedule online up to 24 hours before the start." */
    val policyText: String? = null,
)

data class NewBookingFacts(
    val booking: BookingFacts,
    val customerEmail: String?,
    val customerPhone: String?,
    val statusText: String,
    val needsApproval: Boolean,
    val dashboardUrl: String,
)

/**
 * All transactional emails (docs/architecture.md section 8). Pure functions: the notification
 * worker fills in the facts from the database, the dev preview uses sample facts.
 *
 * Every message has a plain-text version ([text]) and an HTML one ([EmailHtml]).
 */
object EmailTemplates {
    const val BOOKING_CONFIRMED = NotificationKind.BOOKING_CONFIRMED
    const val PENDING_APPROVAL = NotificationKind.BOOKING_PENDING_APPROVAL
    const val APPROVED = NotificationKind.BOOKING_APPROVED
    const val DECLINED = NotificationKind.BOOKING_DECLINED
    const val CANCELLED = NotificationKind.BOOKING_CANCELLED
    const val RESCHEDULED = NotificationKind.BOOKING_RESCHEDULED
    const val REMINDER = NotificationKind.BOOKING_REMINDER
    const val PAYMENT_REFUNDED = NotificationKind.PAYMENT_REFUNDED
    const val PAYMENT_REQUESTED = NotificationKind.PAYMENT_REQUESTED
    const val REFUND_APOLOGY = "payment_refunded_apology"
    const val REFUND_FAILED = NotificationKind.PAYMENT_REFUND_FAILED
    const val TEAM_INVITATION = NotificationKind.TEAM_INVITATION
    const val NEW_BOOKING_FOR_BUSINESS = NotificationKind.NEW_BOOKING_FOR_BUSINESS

    /** One of a person's notifications (section 22), emailed because they asked for it by email. */
    const val NOTIFICATION = "notification"

    val ALL = listOf(
        BOOKING_CONFIRMED, PENDING_APPROVAL, APPROVED, DECLINED, CANCELLED, RESCHEDULED, REMINDER,
        PAYMENT_REQUESTED, PAYMENT_REFUNDED, REFUND_APOLOGY, REFUND_FAILED, TEAM_INVITATION, NEW_BOOKING_FOR_BUSINESS, NOTIFICATION,
    )

    /** bookanything's own look, for notifications that aren't from one business (they may be about several). */
    val PLATFORM_BRAND = EmailBrand(businessName = "bookanything", primaryColor = "#4f46e5")

    /**
     * A notification by email: its [title] and [body], [business] it is about (if any), a button to open it ([url]), and
     * where to change which notifications are emailed ([settingsUrl]).
     */
    fun notification(title: String, body: String?, business: String?, url: String, settingsUrl: String) = Content(
        template = NOTIFICATION,
        subject = title,
        preheader = body ?: title,
        headline = title,
        paragraphs = listOfNotNull(body, business?.let { "At $it." }),
        details = emptyList(),
        button = "Open in bookanything" to url,
        footerNote = "You're receiving this because of your notification settings on bookanything. Change them at $settingsUrl",
    )

    /** One rendered email before addressing. */
    data class Content(
        val template: String,
        val subject: String,
        val preheader: String,
        val headline: String,
        val paragraphs: List<String>,
        val details: List<Pair<String, String>>,
        val callout: String? = null,
        val button: Pair<String, String>? = null,
        val secondaryLink: Pair<String, String>? = null,
        val closing: List<String> = emptyList(),
        val footerNote: String,
    )

    private fun firstName(name: String) = name.trim().split(Regex("\\s+")).firstOrNull()?.takeIf { it.isNotEmpty() } ?: "there"

    private fun details(f: BookingFacts, includePayment: Boolean = true): List<Pair<String, String>> = buildList {
        add("What" to f.serviceLabel)
        add("When" to f.whenText)
        add("Duration" to f.durationText)
        f.withText?.let { add("With" to it) }
        f.locationText?.let { add("Where" to it) }
        if (includePayment) f.paymentText?.let { add("Payment" to it) }
        add("Reference" to f.reference)
    }

    private fun customerFooter(brand: EmailBrand, f: BookingFacts) =
        "You're receiving this because you made a ${f.bookingNoun} with ${brand.businessName}."

    private fun manageButton(f: BookingFacts) = f.manageUrl?.let { "Manage ${f.bookingNoun}" to it }

    fun bookingConfirmed(brand: EmailBrand, f: BookingFacts) = Content(
        template = BOOKING_CONFIRMED,
        subject = "Confirmed: ${f.serviceLabel}, ${f.whenText}",
        preheader = "Your ${f.bookingNoun} with ${brand.businessName} is confirmed. Reference ${f.reference}.",
        headline = "You're booked in",
        paragraphs = listOf(
            "Hi ${firstName(f.customerName)}, your ${f.bookingNoun} with ${brand.businessName} is confirmed. Here are the details.",
        ),
        details = details(f),
        callout = f.policyText,
        button = manageButton(f),
        closing = listOf("Add it to your calendar and we'll send you a reminder the day before."),
        footerNote = customerFooter(brand, f),
    )

    fun pendingApproval(brand: EmailBrand, f: BookingFacts, paid: Boolean) = Content(
        template = PENDING_APPROVAL,
        subject = "Request received: ${f.serviceLabel}, ${f.whenText}",
        preheader = "${brand.businessName} will review your request and confirm by email.",
        headline = "Request received",
        paragraphs = listOf(
            "Hi ${firstName(f.customerName)}, thanks for your request. ${brand.businessName} reviews each ${f.bookingNoun} before " +
                "confirming it, and we'll email you as soon as they do.",
            "The time is held for you in the meantime.",
        ),
        details = details(f),
        callout = if (paid) "If ${brand.businessName} can't accept this request, your payment will be refunded in full." else null,
        button = f.manageUrl?.let { "View request" to it },
        footerNote = customerFooter(brand, f),
    )

    fun approved(brand: EmailBrand, f: BookingFacts) = Content(
        template = APPROVED,
        subject = "Approved: ${f.serviceLabel}, ${f.whenText}",
        preheader = "Good news: ${brand.businessName} has confirmed your ${f.bookingNoun}.",
        headline = "Your ${f.bookingNoun} is confirmed",
        paragraphs = listOf("Good news, ${firstName(f.customerName)}: ${brand.businessName} has approved your request."),
        details = details(f),
        callout = f.policyText,
        button = manageButton(f),
        footerNote = customerFooter(brand, f),
    )

    /** What a customer is told when the refund they are due could not be made automatically: the business arranges it. */
    private fun refundFailedText(brand: EmailBrand) =
        "We couldn't return your payment to your original payment method automatically. ${brand.businessName} has been told " +
            "and will arrange your refund with you."

    /** What a customer is told when we can't tell whether their refund was made: the business looks into it. */
    private fun refundCheckingText(brand: EmailBrand) =
        "We're checking your refund with the payment provider. ${brand.businessName} has been told and will make sure you " +
            "get it."

    /**
     * [refundPending]: the refund waits for the payment provider; [refundFailed]: it couldn't be made (see
     * [refundFailedText]); [refundChecking]: we can't tell whether it was (see [refundCheckingText]).
     */
    fun declined(
        brand: EmailBrand, f: BookingFacts, reason: String?, refundText: String?, refundPending: Boolean = false,
        refundFailed: Boolean = false, refundChecking: Boolean = false,
    ) = Content(
        template = DECLINED,
        subject = "Update on your request with ${brand.businessName}",
        preheader = "${brand.businessName} couldn't accept your request for ${f.whenText}.",
        headline = "Request not accepted",
        paragraphs = buildList {
            add(
                "Hi ${firstName(f.customerName)}, sorry, ${brand.businessName} couldn't accept your request for ${f.serviceLabel} on " +
                    "${f.whenText}.",
            )
            reason?.let { add("Their note: “$it”") }
        },
        details = details(f, includePayment = false),
        callout = when {
            refundText != null ->
                "We've refunded $refundText to your original payment method. Refunds usually arrive within 5 to 10 business days."
            refundFailed -> refundFailedText(brand)
            refundChecking -> refundCheckingText(brand)
            refundPending -> "Your refund is being processed. We'll email you as soon as it has been issued."
            else -> null
        },
        button = brand.bookingPageUrl?.let { "Choose another time" to it },
        footerNote = customerFooter(brand, f),
    )

    fun cancelled(
        brand: EmailBrand, f: BookingFacts, cancelledBy: CancelActor?, reason: String?, refundText: String?, refundPending: Boolean,
        paidOnline: Boolean, refundFailed: Boolean = false, refundChecking: Boolean = false,
    ) = Content(
        template = CANCELLED,
        subject = "Cancelled: ${f.serviceLabel}, ${f.whenText}",
        preheader = "Your ${f.bookingNoun} with ${brand.businessName} on ${f.whenText} has been cancelled.",
        headline = "${f.bookingNoun.replaceFirstChar { it.uppercase() }} cancelled",
        paragraphs = buildList {
            add(
                when (cancelledBy) {
                    CancelActor.CUSTOMER ->
                        "Hi ${firstName(f.customerName)}, as requested, your ${f.bookingNoun} with ${brand.businessName} has been cancelled."
                    else -> "Hi ${firstName(f.customerName)}, sorry, ${brand.businessName} has had to cancel your ${f.bookingNoun}."
                },
            )
            reason?.let { add("Reason given: “$it”") }
        },
        details = details(f, includePayment = false),
        callout = when {
            refundText != null ->
                "A refund of $refundText is on its way to your original payment method. It usually arrives within 5 to " +
                    "10 business days."
            refundFailed -> refundFailedText(brand)
            refundChecking -> refundCheckingText(brand)
            refundPending -> "Your refund is being processed. We'll email you as soon as it has been issued."
            paidOnline -> "Under ${brand.businessName}'s cancellation policy, no refund applies to this cancellation."
            else -> null
        },
        button = brand.bookingPageUrl?.let { "Book again" to it },
        footerNote = customerFooter(brand, f),
    )

    fun rescheduled(brand: EmailBrand, f: BookingFacts, previousWhen: String?) = Content(
        template = RESCHEDULED,
        subject = "New time: ${f.serviceLabel}, ${f.whenText}",
        preheader = "Your ${f.bookingNoun} with ${brand.businessName} has moved to ${f.whenText}.",
        headline = "Your ${f.bookingNoun} has moved",
        paragraphs = listOf(
            "Hi ${firstName(f.customerName)}, your ${f.bookingNoun} with ${brand.businessName} now takes place on ${f.whenText}" +
                (previousWhen?.let { " (previously $it)." } ?: "."),
        ),
        details = details(f),
        callout = f.policyText,
        button = manageButton(f),
        footerNote = customerFooter(brand, f),
    )

    fun reminder(brand: EmailBrand, f: BookingFacts) = Content(
        template = REMINDER,
        subject = "Reminder: ${f.serviceLabel}, ${f.whenText}",
        preheader = "See you soon at ${brand.businessName}.",
        headline = "See you soon",
        paragraphs = listOf(
            "Hi ${firstName(f.customerName)}, this is a reminder of your upcoming ${f.bookingNoun} with ${brand.businessName}.",
        ),
        details = details(f),
        callout = f.policyText,
        button = manageButton(f),
        closing = listOf("If you can no longer make it, please let ${brand.businessName} know so someone else can have the slot."),
        footerNote = customerFooter(brand, f),
    )

    /**
     * A booking made for the customer (e.g. by phone) that is held until they pay online.
     * [amountText] is what is due now; [holdUntilText] when the unpaid hold lapses.
     */
    fun paymentRequested(brand: EmailBrand, f: BookingFacts, amountText: String, holdUntilText: String, checkoutUrl: String) = Content(
        template = PAYMENT_REQUESTED,
        subject = "Payment needed to confirm: ${f.serviceLabel}, ${f.whenText}",
        preheader = "Pay $amountText by $holdUntilText to confirm your ${f.bookingNoun} with ${brand.businessName}.",
        headline = "Complete your payment",
        paragraphs = listOf(
            "Hi ${firstName(f.customerName)}, ${brand.businessName} has reserved a ${f.bookingNoun} for you. Pay $amountText online to " +
                "confirm it.",
        ),
        details = details(f),
        callout = "We're holding this time for you until $holdUntilText. If payment isn't completed by then, the time is released and " +
            "nothing is charged.",
        button = "Pay $amountText" to checkoutUrl,
        secondaryLink = f.manageUrl?.let { "View ${f.bookingNoun}" to it },
        footerNote = customerFooter(brand, f),
    )

    fun paymentRefunded(brand: EmailBrand, f: BookingFacts, refundText: String) = Content(
        template = PAYMENT_REFUNDED,
        subject = "Refund of $refundText from ${brand.businessName}",
        preheader = "${brand.businessName} has refunded $refundText.",
        headline = "Refund issued",
        paragraphs = listOf(
            "Hi ${firstName(f.customerName)}, ${brand.businessName} has refunded $refundText for your ${f.bookingNoun} (${f.reference}).",
        ),
        details = details(f, includePayment = false),
        callout = "Refunds go back to your original payment method and usually arrive within 5 to 10 business days.",
        button = f.manageUrl?.let { "View ${f.bookingNoun}" to it },
        footerNote = customerFooter(brand, f),
    )

    fun refundApology(brand: EmailBrand, f: BookingFacts, refundText: String) = Content(
        template = REFUND_APOLOGY,
        subject = "Sorry, that time was no longer available: full refund from ${brand.businessName}",
        preheader = "Your payment arrived after the time was released, so we've refunded it in full.",
        headline = "Sorry, we couldn't keep that time",
        paragraphs = listOf(
            "Hi ${firstName(f.customerName)}, your payment for ${f.serviceLabel} on ${f.whenText} reached us after the time we were " +
                "holding for you had been released, and it has since been booked by someone else.",
            "We've refunded the full $refundText, so you haven't been charged. We're sorry for the inconvenience.",
        ),
        details = details(f, includePayment = false),
        callout = "Refunds go back to your original payment method and usually arrive within 5 to 10 business days.",
        button = brand.bookingPageUrl?.let { "Choose another time" to it },
        footerNote = customerFooter(brand, f),
    )

    /**
     * A refund of [refundText] the customer was due failed for good: the business will arrange it. [lateRelease]: it was
     * the refund of a payment that arrived after the time was released, so there is no booking to look at.
     */
    fun refundFailed(brand: EmailBrand, f: BookingFacts, refundText: String, lateRelease: Boolean = false, checking: Boolean = false) =
        if (checking) refundChecking(brand, f, refundText) else refundFailedContent(brand, f, refundText, lateRelease)

    /** We couldn't tell whether a refund of [refundText] was made: it is being checked, and the business sees to it. */
    private fun refundChecking(brand: EmailBrand, f: BookingFacts, refundText: String) = Content(
        template = REFUND_FAILED,
        subject = "About your refund from ${brand.businessName}",
        preheader = "Your refund of $refundText is being checked. ${brand.businessName} will make sure you get it.",
        headline = "Your refund is being checked",
        paragraphs = listOf(
            "Hi ${firstName(f.customerName)}, we couldn't confirm your refund of $refundText for your ${f.bookingNoun} " +
                "(${f.reference}) with the payment provider.",
            refundCheckingText(brand),
        ),
        details = details(f, includePayment = false),
        callout = brand.contactLine?.let { "Questions? You can reach ${brand.businessName} at $it." },
        button = f.manageUrl?.let { "View ${f.bookingNoun}" to it },
        footerNote = customerFooter(brand, f),
    )

    private fun refundFailedContent(brand: EmailBrand, f: BookingFacts, refundText: String, lateRelease: Boolean) = Content(
        template = REFUND_FAILED,
        subject = "About your refund from ${brand.businessName}",
        preheader = "Your refund of $refundText couldn't be sent automatically. ${brand.businessName} will arrange it.",
        headline = "Your refund needs a different route",
        paragraphs = listOf(
            if (lateRelease) {
                "Hi ${firstName(f.customerName)}, your payment for ${f.serviceLabel} on ${f.whenText} reached us after the time " +
                    "we were holding for you had been released, so we tried to refund the full $refundText. The payment " +
                    "provider couldn't return it to your original payment method."
            } else {
                "Hi ${firstName(f.customerName)}, we tried to refund $refundText for your ${f.bookingNoun} (${f.reference}), " +
                    "but the payment provider couldn't return it to your original payment method."
            },
            "${brand.businessName} has been told and will contact you to arrange your refund another way. Sorry for the trouble.",
        ),
        details = details(f, includePayment = false),
        callout = brand.contactLine?.let { "Questions? You can reach ${brand.businessName} at $it." },
        button = if (lateRelease) null else f.manageUrl?.let { "View ${f.bookingNoun}" to it },
        footerNote = customerFooter(brand, f),
    )

    fun teamInvitation(brand: EmailBrand, inviter: String, role: String?, acceptUrl: String) = Content(
        template = TEAM_INVITATION,
        subject = "$inviter invited you to ${brand.businessName} on bookanything",
        preheader = "Join ${brand.businessName} on bookanything.",
        headline = "You're invited to ${brand.businessName}",
        paragraphs = listOf(
            "$inviter has invited you to join ${brand.businessName} on bookanything" + (role?.let { " as ${articleFor(it)} $it." } ?: "."),
            "Sign in or create an account with this email address to accept. The invitation link is personal, so please don't forward it.",
        ),
        details = emptyList(),
        button = "Accept invitation" to acceptUrl,
        footerNote = "If you weren't expecting this invitation, you can ignore this email.",
    )

    fun newBookingForBusiness(brand: EmailBrand, n: NewBookingFacts) = Content(
        template = NEW_BOOKING_FOR_BUSINESS,
        subject =
        (if (n.needsApproval) "Approval needed: " else "New ${n.booking.bookingNoun}: ") +
            "${n.booking.customerName}, ${n.booking.whenText}",
        preheader = "${n.booking.customerName} booked ${n.booking.serviceLabel} for ${n.booking.whenText}.",
        headline = if (n.needsApproval) "New request to review" else "New ${n.booking.bookingNoun}",
        paragraphs = listOf(
            "${n.booking.customerName} booked ${n.booking.serviceLabel}." +
                if (n.needsApproval) " It's waiting for your approval." else "",
        ),
        details = buildList {
            add("Customer" to n.booking.customerName)
            n.customerEmail?.let { add("Email" to it) }
            n.customerPhone?.let { add("Phone" to it) }
            add("What" to n.booking.serviceLabel)
            add("When" to n.booking.whenText)
            n.booking.withText?.let { add("With" to it) }
            n.booking.paymentText?.let { add("Payment" to it) }
            add("Status" to n.statusText)
            add("Reference" to n.booking.reference)
        },
        callout = "Answers to booking questions are only shown in your dashboard.",
        button = (if (n.needsApproval) "Review request" else "Open dashboard") to n.dashboardUrl,
        footerNote = "You're receiving this because you manage ${brand.businessName} on bookanything.",
    )

    private fun articleFor(word: String) = if (word.firstOrNull()?.lowercaseChar() in setOf('a', 'e', 'i', 'o', 'u')) "an" else "a"

    // ---- Rendering ----

    fun toMessage(brand: EmailBrand, content: Content, to: String, replyTo: String? = brand.contactEmail, idempotencyKey: String? = null) =
        EmailMessage(
            to = to, subject = content.subject.take(200), text = text(brand, content), html = html(brand, content),
            template = content.template, fromName = brand.businessName, replyTo = replyTo, idempotencyKey = idempotencyKey,
        )

    fun text(brand: EmailBrand, c: Content): String = buildString {
        appendLine(c.headline)
        appendLine()
        c.paragraphs.forEach { appendLine(it); appendLine() }
        if (c.details.isNotEmpty()) {
            val width = c.details.maxOf { it.first.length }
            c.details.forEach { (k, v) -> appendLine("${(k + ":").padEnd(width + 1)} $v") }
            appendLine()
        }
        c.callout?.let { appendLine(it); appendLine() }
        c.button?.let { (label, url) -> appendLine("$label: $url"); appendLine() }
        c.secondaryLink?.let { (label, url) -> appendLine("$label: $url"); appendLine() }
        c.closing.forEach { appendLine(it); appendLine() }
        appendLine("--")
        appendLine(brand.businessName)
        brand.contactLine?.let { appendLine(it) }
        brand.address?.let { appendLine(it) }
        appendLine()
        append(c.footerNote)
        if (brand != PLATFORM_BRAND) append(" Sent by bookanything on behalf of ").append(brand.businessName).append('.')
    }

    fun html(brand: EmailBrand, c: Content): String = EmailHtml.render(brand, c)
}
