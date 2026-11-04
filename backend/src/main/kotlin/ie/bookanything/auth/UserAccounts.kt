package ie.bookanything.auth

import ie.bookanything.customers.CustomerRepository
import java.sql.Connection

/** Writing a user's row when they sign in or Clerk reports a change, with what follows from it. */
object UserAccounts {
    /**
     * Upserts the user for [identity] and links the customer records booked with their verified email (at every
     * business) to them. Called when the row is new or changed (a first sign-in, a new or newly verified email), not on
     * every request: the link is an update across all businesses' customers.
     */
    fun upsert(conn: Connection, identity: VerifiedIdentity): CurrentUser {
        val user = UserRepository.upsert(conn, identity)
        CustomerRepository.linkByVerifiedEmail(conn, user)
        return user
    }
}
