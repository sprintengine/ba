package ie.bookanything.storage

import ie.bookanything.config.AppConfig
import java.nio.file.Path
import java.util.UUID

/** Storing a file failed; [message] is safe to log, never shown to users. */
class StorageException(message: String, cause: Throwable? = null) : RuntimeException(message, cause)

/**
 * Where uploaded images live (section 15.7). Files are addressed as
 * `businesses/{businessId}/{uuid}.{ext}`, so every business has its own URL prefix and a plan can
 * only reference its own uploads.
 */
interface AssetStorage {
    /** "s3", "local" or "off" (startup log). */
    val name: String
    val enabled: Boolean

    /** Public URL prefix of [businessId]'s files (ends with "/"); null when storage is off. */
    fun publicPrefix(businessId: UUID): String?

    /** Stores [bytes] under [fileName] for [businessId] and returns its public URL. */
    fun put(businessId: UUID, fileName: String, bytes: ByteArray, contentType: String): String

    /** The file's bytes when this API serves them itself (local disk); null otherwise or when missing. */
    fun read(businessId: UUID, fileName: String): ByteArray? = null
}

object DisabledStorage : AssetStorage {
    override val name = "off"
    override val enabled = false
    override fun publicPrefix(businessId: UUID): String? = null
    override fun put(businessId: UUID, fileName: String, bytes: ByteArray, contentType: String): String =
        throw StorageException("storage is not configured")
}

/** File names and keys shared by every storage. */
object AssetKeys {
    /** Stored files never change (new uploads get new names), so they can be cached forever. */
    const val CACHE_CONTROL = "public, max-age=31536000, immutable"

    /** `{uuid}.{ext}`; anything else (including path segments) is never read or written. */
    val FILE_NAME = Regex("^[0-9a-f-]{36}\\.(png|jpg|webp)$")

    fun key(businessId: UUID, fileName: String): String {
        require(FILE_NAME.matches(fileName)) { "invalid file name" }
        return "businesses/$businessId/$fileName"
    }

    fun newFileName(extension: String) = "${UUID.randomUUID()}.$extension"

    fun contentType(fileName: String): String? = when (fileName.substringAfterLast('.', "")) {
        "png" -> "image/png"
        "jpg" -> "image/jpeg"
        "webp" -> "image/webp"
        else -> null
    }
}

object AssetStorages {
    /** S3 when fully configured; else local disk when a directory is set (always in development); else off. */
    fun fromConfig(config: AppConfig): AssetStorage {
        val s = config.storage
        return when {
            s.s3 != null -> S3Storage(s.s3)
            s.localDir != null -> LocalDiskStorage(Path.of(s.localDir), config.appBaseUrl)
            else -> DisabledStorage
        }
    }
}
