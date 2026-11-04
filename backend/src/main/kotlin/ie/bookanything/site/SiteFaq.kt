package ie.bookanything.site

import ie.bookanything.services.ServiceDto

/**
 * FAQ items derived only from the business's real settings: how booking works, cancellation and
 * rescheduling policy, how payment works and how far ahead people can book. Never invents facts.
 */
object SiteFaq {
    fun items(inputs: SiteInputs, copy: SiteCopy): List<FaqItem> {
        val b = inputs.business
        val p = b.policies
        val booking = copy.bookingWord
        val services = inputs.publicServices
        val out = ArrayList<FaqItem>()

        val approval = if (services.any {
                it.requiresApproval
            }
        ) {
            " Some requests need to be confirmed by us first; we'll let you know by email."
        } else {
            ""
        }
        out += FaqItem(
            "How do I book?",
            "Choose a service, pick a time that suits you and enter your details. You'll get an email with the details of your $booking " +
                "and a link to manage it.$approval",
        )

        val onlinePayment = services.any { paidOnline(it.paymentMode) && priced(it) }
        out += cancellationItem(
            p.allowCustomerCancel, p.allowCustomerReschedule, p.cancellationNoticeHours, p.lateCancellationRefundPercent, onlinePayment,
            booking,
        )

        paymentItem(services, booking)?.let { out += it }

        if (services.isNotEmpty() && services.none { it.maxAdvanceDays != null }) {
            val notice = if (p.minNoticeMinutes > 0 && services.none { it.minNoticeMinutes != null }) {
                " Please book at least ${duration(p.minNoticeMinutes)} in advance."
            } else {
                ""
            }
            out += FaqItem("How far ahead can I book?", "You can book up to ${plural(p.maxAdvanceDays, "day")} ahead.$notice")
        }
        return out
    }

    private fun paidOnline(mode: String) = mode == "full" || mode == "deposit"
    private fun priced(s: ServiceDto) = s.priceCents > 0 || s.options.any { it.priceCents > 0 }

    private fun cancellationItem(
        allowCancel: Boolean, allowReschedule: Boolean, noticeHours: Int, latePercent: Int, onlinePayment: Boolean, booking: String,
    ): FaqItem {
        val question = "Can I change or cancel my $booking?"
        if (!allowCancel && !allowReschedule) {
            return FaqItem(question, "Please get in touch with us if you need to change or cancel your $booking.")
        }
        val parts = ArrayList<String>()
        parts += when {
            allowCancel && allowReschedule -> "Yes. Use the link in your confirmation email to reschedule or cancel."
            allowCancel ->
                "You can cancel using the link in your confirmation email. To move your $booking to another time, please get " +
                    "in touch."
            else -> "You can reschedule using the link in your confirmation email. To cancel, please get in touch."
        }
        if (allowReschedule && noticeHours > 0) parts += "Changes can be made up to ${plural(noticeHours, "hour")} before your $booking."
        if (allowCancel && onlinePayment) {
            parts += if (noticeHours <= 0) {
                "If you paid online and cancel before your $booking starts, you get a full refund."
            } else {
                val late = when (latePercent.coerceIn(0, 100)) {
                    0 -> "; later cancellations are not refunded."
                    100 -> ", and later cancellations are refunded in full too."
                    else -> "; later cancellations get a $latePercent% refund."
                }
                "If you paid online and cancel at least ${plural(noticeHours, "hour")} before, you get a full refund$late"
            }
        }
        return FaqItem(question, parts.joinToString(" "))
    }

    private fun paymentItem(services: List<ServiceDto>, booking: String): FaqItem? {
        if (services.isEmpty()) return null
        val priced = services.filter(::priced)
        if (priced.isEmpty()) return FaqItem("Do I need to pay when I book?", "No. There's no payment to make when you book online.")
        val modes = priced.map { it.paymentMode }.toSet()
        val answer = when {
            modes == setOf("full") -> "You pay online when you book."
            modes == setOf("deposit") -> "A deposit is taken online when you book, and the rest is paid at your $booking."
            modes == setOf("at_venue") -> "You pay at your $booking. Nothing is charged when you book online."
            else -> "It depends on the service: each one shows whether you pay online when you book, pay a deposit or pay at your $booking."
        }
        return FaqItem("How does payment work?", answer)
    }

    private fun plural(n: Int, unit: String) = if (n == 1) "1 $unit" else "$n ${unit}s"

    private fun duration(minutes: Int): String = when {
        minutes % 1440 == 0 -> plural(minutes / 1440, "day")
        minutes % 60 == 0 -> plural(minutes / 60, "hour")
        else -> plural(minutes, "minute")
    }
}
