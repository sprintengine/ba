package ie.bookanything.support

import java.awt.Color
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.util.zip.CRC32
import javax.imageio.ImageIO

/** Small real images and hand-built containers for upload tests. */
object Images {
    fun png(width: Int = 20, height: Int = 10): ByteArray = write("png", width, height, BufferedImage.TYPE_INT_ARGB)
    fun jpeg(width: Int = 20, height: Int = 10): ByteArray = write("jpg", width, height, BufferedImage.TYPE_INT_RGB)

    private fun write(format: String, width: Int, height: Int, type: Int): ByteArray {
        val image = BufferedImage(width, height, type)
        val g = image.createGraphics()
        g.color = Color(15, 118, 110)
        g.fillRect(0, 0, width, height)
        g.dispose()
        return ByteArrayOutputStream().also { ImageIO.write(image, format, it) }.toByteArray()
    }

    fun pngChunk(type: String, data: ByteArray): ByteArray {
        val typeBytes = type.toByteArray(Charsets.US_ASCII)
        val crc = CRC32().apply { update(typeBytes); update(data) }.value
        return int32(data.size) + typeBytes + data + int32(crc.toInt())
    }

    /** Inserts [chunks] right after IHDR (offset 33). */
    fun pngWith(
        png: ByteArray, vararg chunks: ByteArray,
    ): ByteArray = png.copyOfRange(0, 33) + chunks.fold(ByteArray(0)) { a, c -> a + c } + png.copyOfRange(33, png.size)

    /** Inserts JPEG segments right after SOI. */
    fun jpegWith(
        jpeg: ByteArray, vararg segments: ByteArray,
    ): ByteArray = jpeg.copyOfRange(0, 2) + segments.fold(ByteArray(0)) { a, s -> a + s } + jpeg.copyOfRange(2, jpeg.size)

    fun jpegSegment(marker: Int, data: ByteArray): ByteArray {
        val len = data.size + 2
        return byteArrayOf(0xFF.toByte(), marker.toByte(), (len shr 8).toByte(), len.toByte()) + data
    }

    /** A structurally valid WebP: optional VP8X header, a VP8L bitstream header and optional EXIF/XMP chunks. */
    fun webp(width: Int = 3, height: Int = 2, vp8x: Boolean = true, exif: Boolean = true, xmp: Boolean = true): ByteArray {
        var chunks = ByteArray(0)
        if (vp8x) {
            val flags = (if (exif) 0x08 else 0) or (if (xmp) 0x04 else 0)
            chunks += riffChunk("VP8X", byteArrayOf(flags.toByte(), 0, 0, 0) + int24le(width - 1) + int24le(height - 1))
        }
        val bits = ((width - 1) and 0x3FFF) or (((height - 1) and 0x3FFF) shl 14)
        chunks += riffChunk("VP8L", byteArrayOf(0x2F) + int32le(bits) + byteArrayOf(0, 0, 0))
        if (exif) chunks += riffChunk("EXIF", "Exif\u0000\u0000GPS 53.3498N".toByteArray())
        if (xmp) chunks += riffChunk("XMP ", "<x:xmpmeta>secret</x:xmpmeta>".toByteArray())
        return "RIFF".toByteArray() + int32le(chunks.size + 4) + "WEBP".toByteArray() + chunks
    }

    fun riffChunk(fourcc: String, data: ByteArray): ByteArray =
        fourcc.toByteArray(Charsets.US_ASCII) + int32le(data.size) + data + (if (data.size % 2 == 1) byteArrayOf(0) else ByteArray(0))

    fun int32(v: Int) = byteArrayOf((v ushr 24).toByte(), (v ushr 16).toByte(), (v ushr 8).toByte(), v.toByte())
    fun int32le(v: Int) = byteArrayOf(v.toByte(), (v ushr 8).toByte(), (v ushr 16).toByte(), (v ushr 24).toByte())
    fun int24le(v: Int) = byteArrayOf(v.toByte(), (v ushr 8).toByte(), (v ushr 16).toByte())

    fun ByteArray.containsBytes(needle: ByteArray): Boolean =
        (0..size - needle.size).any { i -> needle.indices.all { this[i + it] == needle[it] } }

    fun ByteArray.contains(text: String) = containsBytes(text.toByteArray(Charsets.ISO_8859_1))
}
