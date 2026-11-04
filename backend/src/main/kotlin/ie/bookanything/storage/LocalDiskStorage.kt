package ie.bookanything.storage

import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.util.UUID

/**
 * Files on local disk under [root], served by `GET /v1/public/uploads/{businessId}/{file}` and
 * addressed through the frontend's `/api` rewrite: `${appBaseUrl}/api/v1/public/uploads/…`.
 */
class LocalDiskStorage(root: Path, private val appBaseUrl: String) : AssetStorage {
    private val root: Path = root.toAbsolutePath().normalize()
    override val name = "local"
    override val enabled = true

    override fun publicPrefix(businessId: UUID) = "$appBaseUrl/api/v1/public/uploads/$businessId/"

    override fun put(businessId: UUID, fileName: String, bytes: ByteArray, contentType: String): String {
        val target = resolve(businessId, fileName) ?: throw StorageException("invalid file name")
        try {
            Files.createDirectories(target.parent)
            val tmp = Files.createTempFile(target.parent, ".upload-", ".tmp")
            Files.write(tmp, bytes)
            Files.move(tmp, target, StandardCopyOption.ATOMIC_MOVE)
        } catch (e: java.io.IOException) {
            throw StorageException("could not write ${AssetKeys.key(businessId, fileName)}: ${e.message ?: e.javaClass.simpleName}", e)
        }
        return publicPrefix(businessId) + fileName
    }

    override fun read(businessId: UUID, fileName: String): ByteArray? {
        val path = resolve(businessId, fileName) ?: return null
        return if (Files.isRegularFile(path)) Files.readAllBytes(path) else null
    }

    /** The path of a file, or null when the name is not a plain `{uuid}.{ext}` (no traversal possible). */
    private fun resolve(businessId: UUID, fileName: String): Path? {
        if (!AssetKeys.FILE_NAME.matches(fileName)) return null
        val path = root.resolve(AssetKeys.key(businessId, fileName)).normalize()
        return path.takeIf { it.startsWith(root) }
    }
}
