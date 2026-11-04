package ie.bookanything.notifications

/** The notification job kinds (`kind` in a [Notify] job's payload). */
object NotificationKind {
    const val BOOKING_CONFIRMED = "booking_confirmed"
    const val BOOKING_PENDING_APPROVAL = "booking_pending_approval"
    const val BOOKING_APPROVED = "booking_approved"
    const val BOOKING_DECLINED = "booking_declined"
    const val BOOKING_CANCELLED = "booking_cancelled"
    const val BOOKING_RESCHEDULED = "booking_rescheduled"
    const val BOOKING_REMINDER = "booking_reminder"
    const val PAYMENT_REFUNDED = "payment_refunded"

    /** Payment link for a held booking created by the business (collect online). */
    const val PAYMENT_REQUESTED = "payment_requested"
    const val TEAM_INVITATION = "team_invitation"
    const val NEW_BOOKING_FOR_BUSINESS = "new_booking_for_business"
}
