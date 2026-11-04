package ie.bookanything.me

import ie.bookanything.auth.CurrentUser
import ie.bookanything.auth.TokenService
import ie.bookanything.booking.BookingViews
import ie.bookanything.business.BusinessRepository
import ie.bookanything.customers.CustomerRepository
import ie.bookanything.team.Invitations
import java.sql.Connection
import java.time.Instant

/** The signed-in user across businesses: memberships, invitations and their own bookings (`/me`). */
object MeService {
    /**
     * The user, their memberships and the invitations waiting for them. Invitations for their verified email are
     * accepted here (signing in with the invited address is enough); those that can't be yet (the business is at its
     * plan's member limit) are listed to accept later.
     */
    fun me(conn: Connection, user: CurrentUser, tokens: TokenService): MeDto {
        val pending = user.verifiedEmail?.let { email ->
            val invitations = Invitations.pendingFor(conn, email)
            invitations.forEach { Invitations.accept(conn, it, user, strict = false) }
            if (invitations.isEmpty()) emptyList() else Invitations.pendingFor(conn, email)
        }.orEmpty()
        val businesses = BusinessRepository.findByIds(conn, pending.map { it.businessId }.toSet())
        val invitations = pending.mapNotNull { inv ->
            businesses[inv.businessId]?.let { MeInvitation(tokens.inviteToken(inv.id), it.name, inv.role.value) }
        }
        val memberships = MeRepository.memberships(conn, user.id)
        val hasBookings = MeRepository.hasBookings(conn, user.id)
        return MeDto(MeUser(user.id.toString(), user.email.orEmpty(), user.name, user.emailVerified), memberships, invitations, hasBookings)
    }

    /**
     * The user's bookings across businesses: every upcoming one (soonest first) and the latest [PAST_LIMIT] past ones
     * (latest first), read apart so a long history never pushes an upcoming booking out.
     */
    fun myBookings(conn: Connection, user: CurrentUser, now: Instant): MyBookings {
        // Signing in links the customer records booked with the user's verified email; bookings made since as a guest
        // with that email are linked here, where they are listed.
        CustomerRepository.linkByVerifiedEmail(conn, user)
        val upcoming = MeRepository.upcomingBookings(conn, user.id, now)
        val past = MeRepository.pastBookings(conn, user.id, now, PAST_LIMIT)
        val businesses = BusinessRepository.findByIds(conn, (upcoming + past).map { it.businessId }.toSet())
        return MyBookings(
            upcoming.map { BookingViews.customerView(it, businesses.getValue(it.businessId), now) },
            past.map { BookingViews.customerView(it, businesses.getValue(it.businessId), now) },
        )
    }

    /** Past bookings shown on the account page. */
    const val PAST_LIMIT = 100
}
