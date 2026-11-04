package ie.bookanything.me

import ie.bookanything.booking.CustomerBookingDto
import ie.bookanything.business.Branding
import kotlinx.serialization.Serializable
import java.util.UUID

@Serializable
data class MeUser(val id: String, val email: String, val name: String?, val emailVerified: Boolean)

@Serializable
data class MeMembership(val businessId: String, val slug: String, val name: String, val role: String, val branding: Branding)

@Serializable
data class MeInvitation(val token: String, val businessName: String, val role: String)

@Serializable
data class MeDto(
    val user: MeUser,
    val memberships: List<MeMembership>,
    val pendingInvitations: List<MeInvitation>,
    val hasCustomerBookings: Boolean,
)

/** `POST /v1/invitations/{token}/accept`: the refreshed [MeDto], plus which of its memberships the invitation was for. */
@Serializable
data class AcceptedInvitation(
    val user: MeUser,
    val memberships: List<MeMembership>,
    val pendingInvitations: List<MeInvitation>,
    val hasCustomerBookings: Boolean,
    val joinedBusinessId: String,
) {
    companion object {
        fun of(me: MeDto, businessId: UUID) =
            AcceptedInvitation(me.user, me.memberships, me.pendingInvitations, me.hasCustomerBookings, businessId.toString())
    }
}

@Serializable
data class MyBookings(val upcoming: List<CustomerBookingDto>, val past: List<CustomerBookingDto>)
