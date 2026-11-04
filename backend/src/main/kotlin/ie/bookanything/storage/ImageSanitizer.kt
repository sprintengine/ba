package ie.bookanything.storage

import java.io.ByteArrayInputStream
import javax.imageio.ImageIO
import kotlin.math.ceil

enum class ImageFormat(val contentType: String, val extension: String) {
    PNG("image/png", "png"),
    JPEG("image/jpeg", "jpg"),
    WEBP("image/webp", "webp"),
}

data class SanitizedImage(val bytes: ByteArray, val format: ImageFormat, val width: Int, val height: Int)

/** Why an upload was refused; the message is shown to the user. */
class ImageRejected(message: String) : Exception(message)

/** One image format: its dimensions from the header and a copy without metadata. */
internal interface ImageCodec {
    /** (width, height) read from the header without decoding pixels. */
    fun dimensions(bytes: ByteArray): Pair<Int, Int>
    fun stripMetadata(bytes: ByteArray): ByteArray
}

/**
 * Validates and cleans an uploaded image (section 15.7): the format is detected from the bytes
 * (never the declared type or file name), size and dimensions are checked before any decoding,
 * PNG and JPEG must decode, and metadata (EXIF, XMP, text, comments) is stripped.
 */
object ImageSanitizer {
    const val MAX_BYTES = 5 * 1024 * 1024
    const val MAX_SIDE = 6000

    /** Decoding for verification is subsampled to about this size to bound memory. */
    private const val VERIFY_SIDE = 1024

    fun detect(bytes: ByteArray): ImageFormat? = when {
        bytes.size >= 8 && bytes.startsWith(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A) -> ImageFormat.PNG
        bytes.size >= 3 && bytes.startsWith(0xFF, 0xD8, 0xFF) -> ImageFormat.JPEG
        bytes.size >= 12 && String(
            bytes, 0, 4, Charsets.US_ASCII,
        ) == "RIFF" && String(bytes, 8, 4, Charsets.US_ASCII) == "WEBP" -> ImageFormat.WEBP
        else -> null
    }

    // The codecs index into untrusted bytes; running off the end means a truncated or corrupt file.
    @Suppress("TooGenericExceptionCaught", "SwallowedException")
    fun sanitize(bytes: ByteArray): SanitizedImage {
        if (bytes.isEmpty()) throw ImageRejected("The file is empty.")
        if (bytes.size > MAX_BYTES) throw ImageRejected("The image is larger than 5 MB.")
        val format = detect(bytes) ?: throw ImageRejected("Upload a PNG, JPEG or WebP image.")
        val codec = codec(format)
        val (width, height) = try { codec.dimensions(bytes) } catch (e: IndexOutOfBoundsException) { throw corrupt() }
        if (width <= 0 || height <= 0) throw corrupt()
        if (width > MAX_SIDE || height > MAX_SIDE) {
            throw ImageRejected(
                "The image is too large ($width × $height). Use at most $MAX_SIDE pixels per side.",
            )
        }
        val clean = try { codec.stripMetadata(bytes) } catch (e: IndexOutOfBoundsException) { throw corrupt() }
        if (format != ImageFormat.WEBP) verifyDecodes(clean, width, height)
        return SanitizedImage(clean, format, width, height)
    }

    private fun codec(format: ImageFormat): ImageCodec = when (format) {
        ImageFormat.PNG -> PngCodec
        ImageFormat.JPEG -> JpegCodec
        ImageFormat.WEBP -> WebpCodec
    }

    internal fun corrupt() = ImageRejected("The image file is damaged or incomplete.")

    /** Decodes (subsampled) with ImageIO so broken or disguised files are refused. The JDK has no WebP decoder. */
    private fun verifyDecodes(bytes: ByteArray, width: Int, height: Int) {
        val ok = try {
            ImageIO.createImageInputStream(ByteArrayInputStream(bytes)).use { input ->
                val reader = ImageIO.getImageReaders(input).asSequence().firstOrNull() ?: return@use false
                try {
                    reader.input = input
                    if (reader.getWidth(0) != width || reader.getHeight(0) != height) return@use false
                    val step = maxOf(1, ceil(maxOf(width, height) / VERIFY_SIDE.toDouble()).toInt())
                    val param = reader.defaultReadParam.apply { setSourceSubsampling(step, step, 0, 0) }
                    reader.read(0, param) != null
                } finally {
                    reader.dispose()
                }
            }
        } catch (@Suppress("TooGenericExceptionCaught") _: Exception) {
            // ImageIO plugins throw arbitrary runtime exceptions on malformed input; any failure rejects the file.
            false
        }
        if (!ok) throw ImageRejected("The image could not be read. Save it again as a standard PNG or JPEG and retry.")
    }
}

internal fun ByteArray.startsWith(vararg values: Int): Boolean = values.indices.all { this[it] == values[it].toByte() }
internal fun ByteArray.u8(i: Int): Int = this[i].toInt() and 0xff
internal fun ByteArray.u16be(i: Int): Int = (u8(i) shl 8) or u8(i + 1)
internal fun ByteArray.u32be(i: Int): Long = (u16be(i).toLong() shl 16) or u16be(i + 2).toLong()
internal fun ByteArray.u16le(i: Int): Int = u8(i) or (u8(i + 1) shl 8)
internal fun ByteArray.u24le(i: Int): Int = u16le(i) or (u8(i + 2) shl 16)
internal fun ByteArray.u32le(i: Int): Long = u16le(i).toLong() or (u16le(i + 2).toLong() shl 16)
internal fun ByteArray.ascii(i: Int, n: Int): String = String(this, i, n, Charsets.US_ASCII)
