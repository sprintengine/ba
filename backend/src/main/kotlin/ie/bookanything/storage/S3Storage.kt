package ie.bookanything.storage

import ie.bookanything.config.S3Config
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.net.URI
import java.time.Clock
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.UUID
import java.util.concurrent.TimeUnit

/**
 * S3-compatible storage (AWS S3, Cloudflare R2, MinIO, …) with SigV4-signed PUTs over OkHttp.
 * Virtual-hosted URLs on AWS; path-style when a custom endpoint is configured. Objects are served
 * publicly from `${publicBaseUrl}/businesses/{businessId}/{file}` (bucket domain or CDN).
 */
class S3Storage(
    private val config: S3Config,
    private val client: OkHttpClient = OkHttpClient.Builder().callTimeout(30, TimeUnit.SECONDS).build(),
    private val clock: Clock = Clock.systemUTC(),
) : AssetStorage {
    override val name = "s3"
    override val enabled = true

    private val credentials = SigV4.Credentials(config.accessKeyId, config.secretAccessKey, config.region)

    override fun publicPrefix(businessId: UUID) = "${config.publicBaseUrl}/businesses/$businessId/"

    /** The object URL for [key]: `{endpoint}/{bucket}/{key}` or `https://{bucket}.s3.{region}.amazonaws.com/{key}`. */
    fun objectUrl(key: String): String {
        val path = SigV4.uriEncode(key, encodeSlash = false)
        return if (config.endpoint != null) {
            "${config.endpoint}/${SigV4.uriEncode(config.bucket, true)}/$path"
        } else {
            "https://${config.bucket}.s3.${config.region}.amazonaws.com/$path"
        }
    }

    override fun put(businessId: UUID, fileName: String, bytes: ByteArray, contentType: String): String {
        val url = objectUrl(AssetKeys.key(businessId, fileName))
        val uri = URI(url)
        val host = if (uri.port == -1) uri.host else "${uri.host}:${uri.port}"
        val amzDate = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'").withZone(ZoneOffset.UTC).format(clock.instant())
        val payloadHash = SigV4.sha256Hex(bytes)
        val headers = mapOf(
            "host" to host,
            "content-type" to contentType,
            "cache-control" to AssetKeys.CACHE_CONTROL,
            "x-amz-content-sha256" to payloadHash,
            "x-amz-date" to amzDate,
        )
        val auth = SigV4.authorization(SigV4.Request("PUT", uri.rawPath, emptyMap(), headers, payloadHash), credentials, amzDate)
        val request = Request.Builder().url(url)
            .put(bytes.toRequestBody(null))
            .apply { headers.filterKeys { it != "host" }.forEach { (k, v) -> header(k, v) } }
            .header("Authorization", auth)
            .build()
        try {
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    throw StorageException(
                        "S3 PUT failed with ${response.code}: ${response.body?.string()?.take(300).orEmpty()}",
                    )
                }
            }
        } catch (e: java.io.IOException) {
            throw StorageException("S3 PUT failed: ${e.message ?: e.javaClass.simpleName}", e)
        }
        return publicPrefix(businessId) + fileName
    }
}
