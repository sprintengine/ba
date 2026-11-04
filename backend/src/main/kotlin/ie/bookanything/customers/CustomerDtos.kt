package ie.bookanything.customers

import ie.bookanything.booking.BookingDto
import ie.bookanything.http.Validator
import kotlinx.serialization.Serializable
import java.util.UUID

@Serializable
data class CustomerInput(
    val name: String,
    val email: String? = null,
    val phone: String? = null,
    val notes: String? = null,
    val groupId: String? = null,
)

@Serializable
data class CustomerDetailDto(
    val id: String, val name: String, val email: String?, val phone: String?, val notes: String?, val groupId: String?,
    val hasAccount: Boolean, val bookingCount: Int, val lastBookingAt: String?, val createdAt: String,
    val bookings: List<BookingDto>,
)

@Serializable
data class CustomerExport(
    val exportedAt: String,
    val business: String,
    val customer: CustomerDto,
    val bookings: List<BookingDto>,
)

/** A customer's editable details, validated and normalised (trimmed, blank as null, email lower-cased). */
data class CustomerDetails(val name: String, val email: String?, val phone: String?, val notes: String?, val groupId: UUID?) {
    companion object {
        /** Validates [input] (INVALID_REQUEST with field errors) and normalises it. */
        fun from(input: CustomerInput): CustomerDetails {
            val v = Validator()
            v.requireText(input.name, "name", MAX_NAME)
            v.email(input.email, "email", required = false)
            v.phone(input.phone, "phone", required = false)
            v.requireText(input.notes, "notes", MAX_NOTES, required = false)
            v.uuid(input.groupId, "groupId")
            v.throwIfInvalid()
            return CustomerDetails(
                name = input.name.trim(),
                email = input.email?.trim()?.lowercase()?.ifEmpty { null },
                phone = input.phone?.trim()?.ifEmpty { null },
                notes = input.notes?.trim()?.ifEmpty { null },
                groupId = input.groupId?.let(UUID::fromString),
            )
        }

        private const val MAX_NAME = 120
        private const val MAX_NOTES = 5000
    }
}
