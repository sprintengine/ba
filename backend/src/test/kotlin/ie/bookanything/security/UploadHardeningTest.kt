package ie.bookanything.security

import ie.bookanything.site.PlanImageRules
import ie.bookanything.site.SiteRefs
import ie.bookanything.storage.ImageRejected
import ie.bookanything.storage.ImageSanitizer
import ie.bookanything.storage.LocalDiskStorage
import ie.bookanything.storage.upload
import ie.bookanything.support.Fixtures
import ie.bookanything.support.Images
import ie.bookanything.support.Images.contains
import ie.bookanything.support.TestEnv
import ie.bookanything.support.assertError
import ie.bookanything.support.assertStatus
import ie.bookanything.support.i
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.withApp
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.readRawBytes
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.nio.file.Files
import java.nio.file.Path
import javax.imageio.ImageIO
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Uploaded images are attacker-controlled bytes served from our origin. `storage/UploadRoutesTest` and `ImageSanitizerTest`
 * cover formats, metadata stripping and limits; this adds polyglots, decompression bombs, the headers that keep a served
 * file inert, path tricks on the public route and the tenant boundary of upload URLs.
 */
class UploadHardeningTest {
    private val root: Path = Files.createTempDirectory("uploads-sec")
    private fun env() = TestEnv(storage = LocalDiskStorage(root, "http://localhost:3000"))

    private val html = "<html><script>alert(document.cookie)</script></html>"

    private suspend fun served(api: ie.bookanything.support.Api, upload: HttpResponse): HttpResponse {
        assertStatus(HttpStatusCode.Created, upload)
        val res = api.get(upload.obj().s("url").removePrefix("http://localhost:3000/api"))
        assertStatus(HttpStatusCode.OK, res)
        // Whatever is inside, the browser treats it as the sanitized image type and never as a page.
        assertEquals("nosniff", res.headers["X-Content-Type-Options"])
        assertEquals("inline", res.headers[HttpHeaders.ContentDisposition])
        assertEquals("default-src 'none'", res.headers["Content-Security-Policy"])
        assertEquals(upload.obj().s("contentType"), res.headers[HttpHeaders.ContentType])
        return res
    }

    @Test
    fun `polyglots are cut down to the image and served as inert images`() {
        withApp(env()) { api ->
            val clinic = Fixtures.clinic(api)
            // HTML after the end of the image is dropped.
            val pngTail =
                served(api, api.upload(clinic, Images.png() + html.toByteArray(), fileName = "page.html", contentType = "text/html"))
            assertFalse(pngTail.readRawBytes().contains("<script"), "trailing HTML is stripped from PNG")
            assertEquals("image/png", pngTail.headers[HttpHeaders.ContentType])
            val jpegTail =
                served(api, api.upload(clinic, Images.jpeg() + html.toByteArray(), fileName = "x.png", contentType = "image/png"))
            assertFalse(jpegTail.readRawBytes().contains("<script"), "trailing HTML is stripped from JPEG")
            assertEquals("image/jpeg", jpegTail.headers[HttpHeaders.ContentType], "the type comes from the bytes, not the name")
            // HTML in text and comment segments is stripped with the metadata.
            val inText = Images.pngWith(Images.png(), Images.pngChunk("tEXt", "Comment\u0000$html".toByteArray()))
            assertFalse(served(api, api.upload(clinic, inText)).readRawBytes().contains("<script"))
            val inComment = Images.jpegWith(Images.jpeg(), Images.jpegSegment(0xFE, html.toByteArray()))
            assertFalse(served(api, api.upload(clinic, inComment, fileName = "a.jpg")).readRawBytes().contains("<script"))
            // Current behaviour: unknown ancillary PNG chunks and unknown WebP chunks are kept (decoders skip them); such a
            // file is still only ever served as an image with nosniff and a CSP that allows nothing.
            served(api, api.upload(clinic, Images.pngWith(Images.png(), Images.pngChunk("htMl", html.toByteArray()))))
            val webp = Images.webp(exif = false, xmp = false) // a VP8X + VP8L file; append an unknown chunk and fix the size
            val chunk = Images.riffChunk("HTML", html.toByteArray())
            val body = webp.copyOfRange(12, webp.size) + chunk
            val withChunk = "RIFF".toByteArray() + Images.int32le(body.size + 4) + "WEBP".toByteArray() + body
            assertEquals("image/webp", served(api, api.upload(clinic, withChunk, fileName = "x.svg")).headers[HttpHeaders.ContentType])
            // Script-capable formats are never accepted, whatever they claim to be.
            listOf(
                "GIF89a/*<svg onload=alert(1)>*/=1;".toByteArray() to "a.gif",
                "<?xml version=\"1.0\"?><svg xmlns=\"http://www.w3.org/2000/svg\"/>".toByteArray() to "a.png",
                "ï»¿<html>".toByteArray() to "a.png",
                "%PDF-1.4 <script>".toByteArray() to "a.png",
            ).forEach { (bytes, name) ->
                assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", api.upload(clinic, bytes, fileName = name))
            }
        }
    }

    /** A one-bit image: tiny on disk however large it is. */
    private fun pngOf(width: Int, height: Int): ByteArray {
        val out = ByteArrayOutputStream()
        ImageIO.write(BufferedImage(width, height, BufferedImage.TYPE_BYTE_BINARY), "png", out)
        return out.toByteArray()
    }

    @Test
    fun `decompression bombs are refused from the header or decoded within bounded memory`() {
        // Tiny files declaring enormous images are refused before any pixel is decoded.
        fun pngDeclaring(w: Int, h: Int) = Images.png().copyOf().also { Images.int32(w).copyInto(it, 16); Images.int32(h).copyInto(it, 20) }
        listOf(100_000 to 100_000, 65_535 to 1, 1 to 6_001, Int.MAX_VALUE to Int.MAX_VALUE, -1 to -1).forEach { (w, h) ->
            val e = assertFailsWith<ImageRejected>("$w x $h") { ImageSanitizer.sanitize(pngDeclaring(w, h)) }
            assertTrue(e.message!!.contains("6000") || e.message!!.contains("damaged"), e.message)
        }
        // Within the limit but the pixel data doesn't match the declared size: refused when decoding.
        assertFailsWith<ImageRejected> { ImageSanitizer.sanitize(pngDeclaring(6_000, 6_000)) }
        // A real, maximal 6000 x 6000 image of a few KB (36 megapixels) is decoded subsampled and accepted.
        val big = pngOf(6_000, 6_000)
        assertTrue(big.size < 200_000, "${big.size} bytes")
        val clean = ImageSanitizer.sanitize(big)
        assertEquals(6_000 to 6_000, clean.width to clean.height)
        withApp(env()) { api ->
            val clinic = Fixtures.clinic(api)
            val res = api.upload(clinic, big)
            assertStatus(HttpStatusCode.Created, res)
            assertEquals(6_000, res.obj().i("width"))
        }
    }

    @Test
    fun `the public file route only serves a business's own well-formed files`() {
        withApp(env()) { api ->
            val clinic = Fixtures.clinic(api)
            val other = Fixtures.clinic(api)
            val url = api.upload(clinic, Images.png()).obj().s("url").removePrefix("http://localhost:3000/api")
            val file = url.substringAfterLast('/')
            assertTrue(Files.isRegularFile(root.resolve("businesses/${clinic.id}/$file")), "stored under the business's own prefix")
            val base = "/v1/public/uploads/${clinic.id}"
            listOf(
                "/v1/public/uploads/${other.id}/$file", "$base/%2e%2e%2f%2e%2e%2f$file", "$base/..%2f${other.id}%2f$file",
                "$base/%252e%252e%252f$file", "$base/.%2e/$file", "$base/..%5c$file", "$base/${file.uppercase()}",
                "$base/$file%00.png", "$base/$file.png", "$base/${file.replace(".png", ".PNG")}", "$base/${file.replace(".png", ".html")}",
                "$base/%2F$file", "$base/ $file", "/v1/public/uploads/${clinic.id.uppercase()}x/$file", "$base/",
            ).forEach { path ->
                val res = api.get(path)
                assertEquals(HttpStatusCode.NotFound, res.status, path)
            }
            assertStatus(HttpStatusCode.OK, api.get(url))
        }
    }

    @Test
    fun `a site plan can only use uploads under its own business prefix`() {
        val prefix = "http://localhost:3000/api/v1/public/uploads/0f8fad5b-d9cb-469f-a165-70867728950e/"
        val refs = SiteRefs(emptySet(), emptySet(), prefix)
        val file = "6f9619ff-8b86-d011-b42d-00cf4fc964ff.png"
        assertTrue(PlanImageRules.isOwnUpload(prefix + file, refs))
        listOf(
            "http://localhost:3000/api/v1/public/uploads/7c9e6679-7425-40de-944b-e07fc1f90ae7/$file", // another business
            "$prefix../7c9e6679-7425-40de-944b-e07fc1f90ae7/$file", "$prefix%2e%2e/$file", "$prefix$file?x=1", "$prefix$file#x",
            "$prefix/$file", "${prefix}sub/$file", "https://evil.example/api/v1/public/uploads/0f8fad5b-d9cb-469f-a165-70867728950e/$file",
            "$prefix${file.replace(".png", ".svg")}", prefix, "javascript:alert(1)//$prefix$file", " $prefix$file",
        ).forEach { assertFalse(PlanImageRules.isOwnUpload(it, refs), it) }
        assertFalse(PlanImageRules.isOwnUpload(prefix + file, SiteRefs(emptySet(), emptySet(), null)), "uploads off: nothing is own")
    }
}
