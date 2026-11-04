package ie.bookanything.storage

import ie.bookanything.AppContext
import ie.bookanything.audit.Audit
import ie.bookanything.auth.Role
import ie.bookanything.businessAccess
import ie.bookanything.http.ApiException
import ie.bookanything.http.Errors
import ie.bookanything.http.RateLimiter
import ie.bookanything.http.parseUuidOrNull
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.PartData
import io.ktor.http.content.forEachPart
import io.ktor.server.application.ApplicationCall
import io.ktor.server.request.contentType
import io.ktor.server.request.receiveMultipart
import io.ktor.server.response.header
import io.ktor.server.response.respond
import io.ktor.server.response.respondBytes
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.utils.io.readBuffer
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.io.readByteArray
import kotlinx.serialization.Serializable
import org.slf4j.LoggerFactory
import java.util.UUID

private val log = LoggerFactory.getLogger("ie.bookanything.storage.UploadRoutes")

@Serializable
data class UploadDto(val url: String, val contentType: String, val bytes: Int, val width: Int, val height: Int)

/** `POST /v1/businesses/{businessId}/uploads` (multipart field `file`). Owners and admins only. */
fun Route.uploadRoutes(ctx: AppContext) {
    post("/uploads") {
        val access = call.businessAccess(ctx, Role.ADMIN)
        if (!ctx.storage.enabled) throw Errors.uploadsNotConfigured()
        ctx.rateLimiter.check(call, RateLimiter.UPLOADS, ctx.now())
        val file = call.receiveFilePart()
        val image = try {
            // Decoding and re-encoding is CPU work: off the request thread.
            withContext(Dispatchers.Default) { ImageSanitizer.sanitize(file) }
        } catch (e: ImageRejected) {
            throw Errors.invalid(e.message ?: "The image was rejected.", mapOf("file" to (e.message ?: "Invalid image")))
        }
        val fileName = AssetKeys.newFileName(image.format.extension)
        val url = withContext(Dispatchers.IO) {
            try {
                ctx.storage.put(access.businessId, fileName, image.bytes, image.format.contentType)
            } catch (e: StorageException) {
                log.error("upload for business {} failed: {}", access.businessId, e.message)
                throw Errors.uploadFailed()
            }
        }
        val dto = UploadDto(url, image.format.contentType, image.bytes.size, image.width, image.height)
        ctx.db.tx(access.businessId) { conn ->
            Audit.record(
                conn, access.businessId, access.actor, "upload.created", "upload", UUID.fromString(fileName.substringBefore('.')),
                mapOf("url" to url, "contentType" to dto.contentType, "bytes" to dto.bytes, "width" to dto.width, "height" to dto.height),
            )
        }
        call.respond(HttpStatusCode.Created, dto)
    }
}

/** `GET /v1/public/uploads/{businessId}/{file}`: files of local-disk storage. */
fun Route.publicUploadRoutes(ctx: AppContext) {
    get("/uploads/{businessId}/{file}") {
        val businessId = parseUuidOrNull(call.parameters["businessId"]) ?: throw Errors.notFound("File")
        val file = call.parameters["file"].orEmpty()
        val type = AssetKeys.contentType(file)?.takeIf { AssetKeys.FILE_NAME.matches(file) } ?: throw Errors.notFound("File")
        val bytes = withContext(Dispatchers.IO) { ctx.storage.read(businessId, file) } ?: throw Errors.notFound("File")
        call.response.header(HttpHeaders.CacheControl, AssetKeys.CACHE_CONTROL)
        call.response.header("X-Content-Type-Options", "nosniff")
        call.response.header("Content-Security-Policy", "default-src 'none'")
        call.response.header(HttpHeaders.ContentDisposition, "inline")
        call.respondBytes(bytes, ContentType.parse(type))
    }
}

/**
 * The bytes of the multipart part named `file`, reading at most [ImageSanitizer.MAX_BYTES] + 1 so an
 * oversized upload is refused without buffering it.
 */
private suspend fun ApplicationCall.receiveFilePart(): ByteArray {
    val tooLarge = "The image is larger than 5 MB."
    if (!request.contentType().match(ContentType.MultiPart.FormData)) {
        throw Errors.field("file", "Send the image as multipart/form-data in a field named \"file\"")
    }
    request.headers[HttpHeaders.ContentLength]?.toLongOrNull()?.let {
        if (it > ImageSanitizer.MAX_BYTES + ENVELOPE) throw Errors.field("file", tooLarge)
    }
    var bytes: ByteArray? = null
    try {
        receiveMultipart(formFieldLimit = ImageSanitizer.MAX_BYTES + ENVELOPE).forEachPart { part ->
            try {
                if (part is PartData.FileItem && part.name == "file" && bytes == null) {
                    bytes = part.provider().readBuffer(ImageSanitizer.MAX_BYTES + 1L).readByteArray()
                }
            } finally {
                part.release()
            }
        }
    } catch (e: ApiException) {
        throw e
    } catch (e: CancellationException) {
        throw e
    } catch (@Suppress("TooGenericExceptionCaught") e: Exception) { // Any unreadable multipart body is a bad request.
        log.debug("multipart upload could not be read: {}", e.message)
        throw Errors.field("file", "The upload could not be read (images must be at most 5 MB)")
    }
    val result = bytes ?: throw Errors.field("file", "Required")
    if (result.size > ImageSanitizer.MAX_BYTES) throw Errors.field("file", tooLarge)
    return result
}

/** Allowance for multipart boundaries and headers around the file. */
private const val ENVELOPE = 64 * 1024L
