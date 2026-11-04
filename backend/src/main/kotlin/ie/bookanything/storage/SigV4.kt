package ie.bookanything.storage

import java.security.MessageDigest
import java.util.Locale
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/** AWS Signature Version 4 (header-based), enough for S3-compatible PUTs without the AWS SDK. */
object SigV4 {
    data class Request(
        val method: String,
        /** Canonical (already URI-encoded) path, e.g. `/bucket/businesses/…/file.png`. */
        val canonicalPath: String,
        val query: Map<String, String> = emptyMap(),
        /** Headers to sign; must include `host` and `x-amz-date`. */
        val headers: Map<String, String>,
        val payloadSha256: String,
    )

    data class Credentials(val accessKeyId: String, val secretAccessKey: String, val region: String, val service: String = "s3")

    /** The `Authorization` header value for [request] signed at [amzDate] (`yyyyMMdd'T'HHmmss'Z'`). */
    fun authorization(request: Request, credentials: Credentials, amzDate: String): String {
        val date = amzDate.take(8)
        val scope = "$date/${credentials.region}/${credentials.service}/aws4_request"
        val headers = request.headers.mapKeys { it.key.lowercase() }.toSortedMap()
        val signedHeaders = headers.keys.joinToString(";")
        val canonical = listOf(
            request.method,
            request.canonicalPath,
            request.query.toSortedMap().entries.joinToString("&") { "${uriEncode(it.key, true)}=${uriEncode(it.value, true)}" },
            headers.entries.joinToString("") { "${it.key}:${it.value.trim().replace(Regex("\\s+"), " ")}\n" },
            signedHeaders,
            request.payloadSha256,
        ).joinToString("\n")
        val stringToSign = listOf("AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonical.toByteArray())).joinToString("\n")
        var key = hmac("AWS4${credentials.secretAccessKey}".toByteArray(), date)
        key = hmac(key, credentials.region)
        key = hmac(key, credentials.service)
        key = hmac(key, "aws4_request")
        val signature = hmac(key, stringToSign).toHex()
        return "AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/$scope,SignedHeaders=$signedHeaders,Signature=$signature"
    }

    fun sha256Hex(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes).toHex()

    /** RFC 3986 unreserved characters stay; everything else is %XX (slashes kept in paths). */
    fun uriEncode(value: String, encodeSlash: Boolean): String = buildString {
        value.toByteArray(Charsets.UTF_8).forEach { byte ->
            val c = byte.toInt().toChar()
            when {
                c in 'A'..'Z' || c in 'a'..'z' || c in '0'..'9' || c == '-' || c == '_' || c == '.' || c == '~' -> append(c)
                c == '/' && !encodeSlash -> append(c)
                else -> append("%%%02X".format(Locale.ROOT, byte.toInt() and 0xff))
            }
        }
    }

    private fun hmac(key: ByteArray, data: String): ByteArray =
        Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(key, "HmacSHA256")) }.doFinal(data.toByteArray())

    private fun ByteArray.toHex() = joinToString("") { "%02x".format(Locale.ROOT, it) }
}
