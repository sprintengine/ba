package ie.bookanything.auth

import ie.bookanything.db.Db
import ie.bookanything.http.Errors
import io.ktor.http.HttpHeaders
import io.ktor.server.application.ApplicationCall
import io.ktor.util.AttributeKey

private val UserKey = AttributeKey<CurrentUser>("bookanything.currentUser")

class Authenticator(private val verifier: TokenVerifier, private val db: Db) {

    /**
     * Returns the signed-in user or null when no Authorization header is present.
     * A present but invalid token is always a 401 (never silently treated as a guest).
     */
    suspend fun optionalUser(call: ApplicationCall): CurrentUser? {
        call.attributes.getOrNull(UserKey)?.let { return it }
        val header = call.request.headers[HttpHeaders.Authorization] ?: return null
        if (!header.startsWith("Bearer ", ignoreCase = true)) throw Errors.unauthenticated("Unsupported authorization scheme.")
        val token = header.substring(7).trim()
        val identity = verifier.verify(token) ?: throw Errors.unauthenticated("Your session has expired. Please sign in again.")
        // Read first: the row rarely changes, and the upsert takes a row lock (and writes WAL) even when it changes nothing.
        // A deleted user's session token can outlive the deletion by a minute: it must not sign them back in.
        val user = db.read { conn -> UserRepository.findUpToDate(conn, identity) }
            ?: db.tx { conn -> if (UserRepository.isDeleted(conn, identity.subject)) null else UserAccounts.upsert(conn, identity) }
            ?: throw Errors.unauthenticated("This account was deleted.")
        call.attributes.put(UserKey, user)
        return user
    }

    suspend fun requireUser(call: ApplicationCall): CurrentUser =
        optionalUser(call) ?: throw Errors.unauthenticated()
}
