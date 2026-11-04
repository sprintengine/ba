package ie.bookanything.oauth

import java.security.MessageDigest
import java.util.Base64

/** PKCE (RFC 7636), S256 only: `code_challenge = BASE64URL(SHA256(ASCII(code_verifier)))`. */
object Pkce {
    const val METHOD = "S256"
    private val VERIFIER = Regex("^[A-Za-z0-9._~-]{43,128}$")

    /** A SHA-256 digest is 32 bytes = 43 base64url characters without padding. */
    private val CHALLENGE = Regex("^[A-Za-z0-9_-]{43}$")

    fun isValidChallenge(challenge: String?): Boolean = challenge != null && CHALLENGE.matches(challenge)

    fun challengeFor(verifier: String): String =
        Base64.getUrlEncoder().withoutPadding().encodeToString(
            MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(Charsets.US_ASCII)),
        )

    /** Constant-time comparison of the verifier's challenge with the stored one. */
    fun verify(verifier: String?, challenge: String): Boolean {
        if (verifier == null || !VERIFIER.matches(verifier)) return false
        return MessageDigest.isEqual(challengeFor(verifier).toByteArray(Charsets.US_ASCII), challenge.toByteArray(Charsets.US_ASCII))
    }
}
