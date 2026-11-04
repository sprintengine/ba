package ie.bookanything.auth

import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import java.util.Locale
import java.util.UUID
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * Bearer secrets for guests (booking manage links) and invitees.
 *
 * Tokens are 32 bytes derived with HMAC-SHA256(TOKEN_SECRET, purpose:id) so the backend can
 * re-create them for later emails (reminders, idempotent replays) without storing them.
 * Only the SHA-256 hash of a token is stored in the database and used for lookups, so a
 * database leak alone does not reveal usable links.
 */
class TokenService(secret: String) {
    private val key = SecretKeySpec(secret.toByteArray(Charsets.UTF_8), "HmacSHA256")

    fun manageToken(bookingId: UUID): String = derive("manage:$bookingId")
    fun inviteToken(memberId: UUID): String = derive("invite:$memberId")

    private fun derive(input: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(key)
        return b64(mac.doFinal(input.toByteArray(Charsets.UTF_8)))
    }

    companion object {
        private val random = SecureRandom()
        private val tokenRegex = Regex("^[A-Za-z0-9_-]{20,100}$")

        fun hash(token: String): String =
            MessageDigest.getInstance("SHA-256").digest(
                token.toByteArray(Charsets.UTF_8),
            ).joinToString("") { "%02x".format(Locale.ROOT, it) }

        fun looksValid(token: String?): Boolean = token != null && tokenRegex.matches(token)

        fun randomToken(bytes: Int = 32): String = b64(ByteArray(bytes).also(random::nextBytes))

        private fun b64(bytes: ByteArray) = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }
}
