package ie.bookanything.storage

import ie.bookanything.support.Images
import ie.bookanything.support.Images.contains
import java.io.ByteArrayInputStream
import javax.imageio.ImageIO
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class ImageSanitizerTest {
    private fun rejected(bytes: ByteArray, message: String) {
        val e = assertFailsWith<ImageRejected> { ImageSanitizer.sanitize(bytes) }
        assertTrue(e.message!!.contains(message), "expected '$message' but got '${e.message}'")
    }

    @Test
    fun `accepts PNG, JPEG and WebP detected from the bytes`() {
        val png = ImageSanitizer.sanitize(Images.png(20, 10))
        assertEquals(ImageFormat.PNG, png.format)
        assertEquals(20 to 10, png.width to png.height)
        assertEquals("image/png" to "png", png.format.contentType to png.format.extension)
        val jpeg = ImageSanitizer.sanitize(Images.jpeg(33, 17))
        assertEquals(ImageFormat.JPEG, jpeg.format)
        assertEquals(33 to 17, jpeg.width to jpeg.height)
        assertEquals("jpg", jpeg.format.extension)
        val webp = ImageSanitizer.sanitize(Images.webp(3, 2))
        assertEquals(ImageFormat.WEBP, webp.format)
        assertEquals(3 to 2, webp.width to webp.height)
        val lossless = ImageSanitizer.sanitize(Images.webp(640, 480, vp8x = false, exif = false, xmp = false))
        assertEquals(640 to 480, lossless.width to lossless.height)
    }

    @Test
    fun `strips PNG text, time and EXIF chunks`() {
        val dirty = Images.pngWith(
            Images.png(),
            Images.pngChunk("tEXt", "Comment\u0000GPS 53.3498N".toByteArray()),
            Images.pngChunk("iTXt", "XML:com.adobe.xmp\u0000\u0000\u0000\u0000\u0000secret".toByteArray()),
            Images.pngChunk("zTXt", "Author\u0000\u0000x".toByteArray()),
            Images.pngChunk("tIME", byteArrayOf(7, -22, 10, 5, 8, 0, 0)),
            Images.pngChunk("eXIf", "MM\u0000*camera".toByteArray()),
        )
        val clean = ImageSanitizer.sanitize(dirty).bytes
        listOf("tEXt", "iTXt", "zTXt", "tIME", "eXIf", "GPS", "secret").forEach { assertFalse(clean.contains(it), it) }
        assertTrue(clean.contains("IHDR") && clean.contains("IDAT") && clean.contains("IEND"))
        assertNotNull(ImageIO.read(ByteArrayInputStream(clean)))
    }

    @Test
    fun `strips JPEG EXIF, XMP and comments but keeps JFIF and ICC`() {
        val dirty = Images.jpegWith(
            Images.jpeg(),
            Images.jpegSegment(0xE1, "Exif\u0000\u0000GPS 53.3498N camera".toByteArray()),
            Images.jpegSegment(0xE1, "http://ns.adobe.com/xap/1.0/\u0000<x:xmpmeta>secret</x:xmpmeta>".toByteArray()),
            Images.jpegSegment(0xED, "Photoshop 3.0\u0000IPTC author".toByteArray()),
            Images.jpegSegment(0xFE, "made with a phone".toByteArray()),
            Images.jpegSegment(0xE2, "ICC_PROFILE\u0000\u0001\u0001profile-bytes".toByteArray()),
        )
        val clean = ImageSanitizer.sanitize(dirty).bytes
        listOf("Exif", "GPS", "xmpmeta", "Photoshop", "made with a phone").forEach { assertFalse(clean.contains(it), it) }
        assertTrue(clean.contains("JFIF"), "APP0 is kept")
        assertTrue(clean.contains("ICC_PROFILE"), "colour profiles are kept")
        assertNotNull(ImageIO.read(ByteArrayInputStream(clean)))
    }

    @Test
    fun `strips WebP EXIF and XMP and fixes the header`() {
        val clean = ImageSanitizer.sanitize(Images.webp()).bytes
        assertFalse(clean.contains("EXIF") || clean.contains("XMP ") || clean.contains("GPS") || clean.contains("secret"))
        assertEquals(0, clean[20].toInt() and 0x0C, "VP8X EXIF and XMP flags are cleared")
        val riffSize = (clean[4].toInt() and 0xff) or ((clean[5].toInt() and 0xff) shl 8) or ((clean[6].toInt() and 0xff) shl 16)
        assertEquals(clean.size - 8, riffSize)
        assertEquals(Images.webp(exif = false, xmp = false).size, clean.size)
    }

    @Test
    fun `rejects other types and disguised files`() {
        rejected("GIF89a\u0001\u0000\u0001\u0000".toByteArray(), "PNG, JPEG or WebP")
        rejected("<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>".toByteArray(), "PNG, JPEG or WebP")
        rejected("just some text".toByteArray(), "PNG, JPEG or WebP")
        rejected("%PDF-1.7".toByteArray(), "PNG, JPEG or WebP")
        rejected(ByteArray(0), "empty")
        // Right magic bytes, nothing behind them ("photo.png" that isn't one).
        rejected(Images.png().copyOfRange(0, 8) + "<html>".toByteArray() + ByteArray(40), "damaged")
        rejected(Images.jpeg().copyOfRange(0, 40), "damaged")
        rejected(Images.png().copyOfRange(0, 40), "damaged")
        rejected("RIFF\u0004\u0000\u0000\u0000WEBP".toByteArray(), "damaged")
        // Valid headers but pixels that don't decode.
        val png = Images.png()
        val idat = (0 until png.size - 4).first { String(png, it, 4, Charsets.US_ASCII) == "IDAT" }
        val corrupt = png.copyOf().also { for (i in idat + 4 until idat + 14) it[i] = 0x55 }
        rejected(corrupt, "could not be read")
    }

    @Test
    fun `size and dimension limits`() {
        // Exactly 5 MB: a real PNG padded with an ancillary private chunk.
        val base = Images.png()
        val padding = ImageSanitizer.MAX_BYTES - base.size - 12
        val exact = Images.pngWith(base, Images.pngChunk("prVt", ByteArray(padding)))
        assertEquals(ImageSanitizer.MAX_BYTES, exact.size)
        assertEquals(ImageSanitizer.MAX_BYTES, ImageSanitizer.sanitize(exact).bytes.size)
        rejected(Images.pngWith(base, Images.pngChunk("prVt", ByteArray(padding + 1))), "larger than 5 MB")
        // Oversized headers are refused before any decoding.
        fun pngHeader(w: Int, h: Int) = Images.png().copyOf().also { b -> Images.int32(w).copyInto(b, 16); Images.int32(h).copyInto(b, 20) }
        rejected(pngHeader(6001, 10), "at most 6000 pixels")
        rejected(pngHeader(10, 60000), "at most 6000 pixels")
        rejected(Images.webp(6001, 10), "at most 6000 pixels")
        rejected(pngHeader(0, 10), "damaged")
        val jpeg = Images.jpeg(20, 10)
        val sof = (2 until jpeg.size - 1).first { (jpeg[it].toInt() and 0xff) == 0xFF && (jpeg[it + 1].toInt() and 0xff) == 0xC0 }
        rejected(jpeg.copyOf().also { it[sof + 5] = 0x1B; it[sof + 6] = 0x58 }, "at most 6000 pixels") // height 7000
    }
}
