package ie.bookanything.support

import ie.bookanything.auth.BusinessAccess
import ie.bookanything.auth.DevTokenVerifier
import ie.bookanything.auth.Memberships
import ie.bookanything.auth.Role
import ie.bookanything.auth.UserRepository
import java.util.UUID

/**
 * [user]'s access to [businessId], resolved the way `call.businessAccess` does, for tests that call services and
 * commands directly (inside a transaction they control) instead of through a route.
 */
suspend fun TestEnv.access(user: TestUser, businessId: String, min: Role = Role.STAFF): BusinessAccess {
    val identity = checkNotNull(DevTokenVerifier().verify(user.token)) { "not a dev token: ${user.token}" }
    val current = db.tx { conn -> UserRepository.upsert(conn, identity) }
    return Memberships.require(db, current, UUID.fromString(businessId), min)
}
