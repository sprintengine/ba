package ie.bookanything.auth

import java.security.MessageDigest
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.Base64
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * Svix webhook signature verification (used by Clerk): HMAC-SHA256 over
 * `"{svix-id}.{svix-timestamp}.{body}"` with the base64 key after the `whsec_` prefix; the
 * `svix-signature` header holds space-separated `v1,<base64>` signatures; timestamps must be
 * within [tolerance] of now (both directions) to stop replays.
 */
class SvixVerifier(secret: String, private val clock: Clock, private val tolerance: Duration = Duration.ofMinutes(5)) {
    private val key: ByteArray = Base64.getDecoder().decode(secret.trim().removePrefix("whsec_"))

    fun sign(id: String, timestamp: Long, body: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(key, "HmacSHA256"))
        return Base64.getEncoder().encodeToString(mac.doFinal("$id.$timestamp.$body".toByteArray(Charsets.UTF_8)))
    }

    fun verify(id: String?, timestamp: String?, signatures: String?, body: String): Boolean {
        if (id.isNullOrBlank() || timestamp.isNullOrBlank() || signatures.isNullOrBlank()) return false
        val ts = timestamp.trim().toLongOrNull() ?: return false
        val now = clock.instant()
        val sent = Instant.ofEpochSecond(ts)
        if (sent.isBefore(now.minus(tolerance)) || sent.isAfter(now.plus(tolerance))) return false
        val expected = sign(id, ts, body).toByteArray(Charsets.UTF_8)
        return signatures.trim().split(' ').any { entry ->
            val parts = entry.split(',', limit = 2)
            parts.size == 2 && parts[0] == "v1" && MessageDigest.isEqual(parts[1].toByteArray(Charsets.UTF_8), expected)
        }
    }
}
