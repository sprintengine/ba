package ie.bookanything.storage

import ie.bookanything.site.PlanJson.with
import ie.bookanything.site.SiteAttribution
import ie.bookanything.site.SiteCalls
import ie.bookanything.site.stock.StockImageProvider
import ie.bookanything.site.stock.StockPhoto
import ie.bookanything.site.stock.StockUnavailableException
import ie.bookanything.support.Api
import ie.bookanything.support.Clinic
import ie.bookanything.support.Fixtures
import ie.bookanything.support.Images
import ie.bookanything.support.Images.contains
import ie.bookanything.support.TestEnv
import ie.bookanything.support.assertError
import ie.bookanything.support.assertStatus
import ie.bookanything.support.auth
import ie.bookanything.support.b
import ie.bookanything.support.i
import ie.bookanything.support.jsonOf
import ie.bookanything.support.o
import ie.bookanything.support.obj
import ie.bookanything.support.parse
import ie.bookanything.support.s
import ie.bookanything.support.withApp
import io.ktor.client.request.forms.formData
import io.ktor.client.request.forms.submitFormWithBinaryData
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.client.statement.readRawBytes
import io.ktor.http.Headers
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import java.nio.file.Files
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** Multipart upload helper shared by storage tests. */
suspend fun Api.upload(
    clinic: Clinic, bytes: ByteArray, token: String? = clinic.owner.token, field: String = "file",
    fileName: String = "photo.png", contentType: String = "image/png",
): HttpResponse =
    client.submitFormWithBinaryData(
        "${clinic.base}/uploads",
        formData {
            append(
                field, bytes,
                Headers.build {
                    append(HttpHeaders.ContentType, contentType)
                    append(HttpHeaders.ContentDisposition, "filename=\"$fileName\"")
                },
            )
        },
    ) { auth(token) }

class FakeStock(private val fail: Boolean = false) : StockImageProvider {
    override val enabled = true
    val searches = CopyOnWriteArrayList<Pair<String, Int>>()
    val tracked = CopyOnWriteArrayList<String>()
    override fun search(query: String, page: Int): List<StockPhoto> {
        searches += query to page
        if (fail) throw StockUnavailableException("rate limited")
        return listOf(
            StockPhoto(
                "abc", "https://images.unsplash.com/photo-1", "https://images.unsplash.com/photo-1s", 800, 600, "#60544d",
                "A room", SiteAttribution("Sam", "https://unsplash.com/@sam?utm_source=bookanything&utm_medium=referral"),
                "https://api.unsplash.com/photos/abc/download",
            ),
        )
    }
    override fun trackDownload(downloadLocation: String) { tracked += downloadLocation }
}

class UploadRoutesTest {
    private fun localEnv() = TestEnv(storage = LocalDiskStorage(Files.createTempDirectory("uploads"), "http://localhost:3000"))

    @Test
    fun `upload, serve and use an image in the plan`() {
        withApp(localEnv()) { api ->
            val clinic = Fixtures.clinic(api)
            val dirty = Images.pngWith(Images.png(40, 20), Images.pngChunk("tEXt", "GPS\u000053.3498N".toByteArray()))
            val res = api.upload(clinic, dirty, fileName = "holiday.gif", contentType = "image/gif")
            assertStatus(HttpStatusCode.Created, res)
            val upload = res.obj()
            assertEquals("image/png", upload.s("contentType"), "the type comes from the bytes, not the declared one")
            assertEquals(40 to 20, upload.i("width") to upload.i("height"))
            val url = upload.s("url")
            val prefix = "http://localhost:3000/api/v1/public/uploads/${clinic.id}/"
            assertTrue(url.startsWith(prefix) && Regex("^[0-9a-f-]{36}\\.png$").matches(url.removePrefix(prefix)), url)
            assertEquals(true, SiteCalls.state(api, clinic)["uploads"]!!.o.b("enabled"))

            val served = api.get(url.removePrefix("http://localhost:3000/api"))
            assertStatus(HttpStatusCode.OK, served)
            val bytes = served.readRawBytes()
            assertEquals(upload.i("bytes"), bytes.size)
            assertFalse(bytes.contains("tEXt") || bytes.contains("GPS"), "metadata is stripped")
            assertEquals("image/png", served.headers[HttpHeaders.ContentType])
            assertEquals("public, max-age=31536000, immutable", served.headers[HttpHeaders.CacheControl])
            assertEquals("nosniff", served.headers["X-Content-Type-Options"])
            assertEquals("default-src 'none'", served.headers["Content-Security-Policy"])
            assertEquals(
                "upload.created",
                Fixtures.sqlOne(
                    "SELECT action FROM audit_events WHERE business_id = ? AND entity_type = 'upload'",
                    clinic.id,
                ) { it.getString(1) },
            )

            // The plan accepts this business's upload; another business cannot use it.
            val draft = SiteCalls.draft(SiteCalls.state(api, clinic))
            val h = SiteCalls.index(draft, "hero")
            val image = JsonObject(
                mapOf("kind" to JsonPrimitive("upload"), "url" to JsonPrimitive(url), "alt" to JsonPrimitive("Our room")),
            )
            val saved = SiteCalls.saveOk(api, clinic, draft.with("sections[$h].content.image", image), null)
            assertEquals(url, SiteCalls.section(SiteCalls.draft(saved), "hero")["content"]!!.o["image"]!!.o.s("url"))
            val other = Fixtures.clinic(api)
            val otherDraft = SiteCalls.draft(SiteCalls.state(api, other))
            val stolen = SiteCalls.save(api, other, otherDraft.with("sections[$h].content.image", image), null)
            assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", stolen)
            assertTrue(
                parse(stolen.bodyAsText()).o["error"]!!.o["fields"]!!.o.s(
                    "sections[$h].content.image.url",
                ).contains("uploaded to this business"),
            )
        }
    }

    @Test
    fun `JPEG and WebP are accepted, other files are refused`() {
        withApp(localEnv()) { api ->
            val clinic = Fixtures.clinic(api)
            val jpeg = api.upload(
                clinic, Images.jpegWith(Images.jpeg(), Images.jpegSegment(0xE1, "Exif\u0000\u0000camera".toByteArray())),
                fileName = "a.jpg", contentType = "image/jpeg",
            )
            assertStatus(HttpStatusCode.Created, jpeg)
            assertTrue(jpeg.obj().s("url").endsWith(".jpg"))
            assertEquals("image/jpeg", jpeg.obj().s("contentType"))
            val webp = api.upload(clinic, Images.webp(), fileName = "a.webp", contentType = "image/webp")
            assertStatus(HttpStatusCode.Created, webp)
            assertEquals("image/webp", webp.obj().s("contentType"))
            assertTrue(webp.obj().s("url").endsWith(".webp"))

            suspend fun refused(res: HttpResponse, message: String) {
                assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", res)
                val fields = parse(res.bodyAsText()).o["error"]!!.o["fields"]!!.o
                assertTrue(fields.s("file").contains(message), fields.toString())
            }
            refused(
                api.upload(clinic, "GIF89a\u0001\u0000\u0001\u0000".toByteArray(), fileName = "a.gif", contentType = "image/gif"),
                "PNG, JPEG or WebP",
            )
            refused(
                api.upload(
                    clinic, "<svg xmlns='http://www.w3.org/2000/svg'/>".toByteArray(), fileName = "a.svg",
                    contentType = "image/svg+xml",
                ),
                "PNG, JPEG or WebP",
            )
            refused(
                api.upload(clinic, "hello, not an image".toByteArray(), fileName = "fake.png", contentType = "image/png"),
                "PNG, JPEG or WebP",
            )
            refused(api.upload(clinic, Images.png().copyOfRange(0, 30), fileName = "cut.png"), "damaged")
            refused(api.upload(clinic, ByteArray(ImageSanitizer.MAX_BYTES + 1) { 1 }), "5 MB")
            refused(api.upload(clinic, Images.png(), field = "image"), "Required")
            val notMultipart = api.post("${clinic.base}/uploads", jsonOf("file" to "iVBORw0KGgo="), clinic.owner.token)
            assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", notMultipart)
            // Exactly 5 MB is fine.
            val base = Images.png()
            val exact = Images.pngWith(base, Images.pngChunk("prVt", ByteArray(ImageSanitizer.MAX_BYTES - base.size - 12)))
            assertStatus(HttpStatusCode.Created, api.upload(clinic, exact))
            assertEquals(
                3,
                Fixtures.sqlOne(
                    "SELECT count(*) FROM audit_events WHERE business_id = ? AND action = 'upload.created'",
                    clinic.id,
                ) { it.getInt(1) },
            )
        }
    }

    @Test
    fun `the public file route only serves well-formed names`() {
        withApp(localEnv()) { api ->
            val clinic = Fixtures.clinic(api)
            val url = api.upload(clinic, Images.png()).obj().s("url").removePrefix("http://localhost:3000/api")
            assertStatus(HttpStatusCode.OK, api.get(url))
            val file = url.substringAfterLast('/')
            val other = Fixtures.clinic(api)
            for (path in listOf(
                "/v1/public/uploads/${other.id}/$file",
                "/v1/public/uploads/not-a-uuid/$file",
                "/v1/public/uploads/${clinic.id}/${file.replace(".png", ".svg")}",
                "/v1/public/uploads/${clinic.id}/..%2F..%2Fsecret.png",
                "/v1/public/uploads/${clinic.id}/%2E%2E",
                "/v1/public/uploads/${clinic.id}/00000000-0000-0000-0000-000000000000.png",
            )) {
                assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.get(path))
            }
        }
    }

    @Test
    fun `uploads are off without storage`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        assertError(HttpStatusCode.ServiceUnavailable, "UPLOADS_NOT_CONFIGURED", api.upload(clinic, Images.png()))
        assertFalse(SiteCalls.state(api, clinic)["uploads"]!!.o.b("enabled"))
        assertError(
            HttpStatusCode.NotFound, "NOT_FOUND", api.get("/v1/public/uploads/${clinic.id}/0f8fad5b-d9cb-469f-a165-70867728950e.png"),
        )
        // An upload URL can't be used in a plan either.
        val draft = SiteCalls.draft(SiteCalls.state(api, clinic))
        val image = JsonObject(
            mapOf(
                "kind" to JsonPrimitive("upload"),
                "url" to JsonPrimitive("http://localhost:3000/api/v1/public/uploads/${clinic.id}/0f8fad5b-d9cb-469f-a165-70867728950e.png"),
            ),
        )
        assertError(
            HttpStatusCode.BadRequest, "INVALID_REQUEST", SiteCalls.save(api, clinic, draft.with("sections[0].content.image", image), null),
        )
    }

    @Test
    fun `stock photo search and download tracking`() {
        val stock = FakeStock()
        withApp(TestEnv(stockImages = stock)) { api ->
            val clinic = Fixtures.clinic(api)
            assertTrue(SiteCalls.state(api, clinic)["stock"]!!.o.b("enabled"))
            val res = api.get("${clinic.base}/site/stock?q=treatment%20room&page=2", clinic.owner.token)
            assertStatus(HttpStatusCode.OK, res)
            assertTrue(res.obj().b("enabled"))
            val photo = res.obj()["results"]!!.jsonArray.single().o
            assertEquals("https://images.unsplash.com/photo-1", photo.s("url"))
            assertEquals("Sam", photo["attribution"]!!.o.s("name"))
            assertEquals(listOf("treatment room" to 2), stock.searches)
            assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", api.get("${clinic.base}/site/stock", clinic.owner.token))
            assertError(
                HttpStatusCode.BadRequest, "INVALID_REQUEST", api.get("${clinic.base}/site/stock?q=room&page=0", clinic.owner.token),
            )
            assertError(
                HttpStatusCode.BadRequest, "INVALID_REQUEST", api.get("${clinic.base}/site/stock?q=${"x".repeat(101)}", clinic.owner.token),
            )

            val download = "https://api.unsplash.com/photos/abc/download?ixid=1"
            assertStatus(
                HttpStatusCode.NoContent,
                api.post("${clinic.base}/site/stock/download", jsonOf("downloadLocation" to download), clinic.owner.token),
            )
            assertEquals(listOf(download), stock.tracked)
            for (bad in listOf(
                "https://evil.example/photos/abc", "http://api.unsplash.com/photos/abc", "", "https://api.unsplash.com/photos/a b",
            )) {
                assertError(
                    HttpStatusCode.BadRequest, "INVALID_REQUEST",
                    api.post("${clinic.base}/site/stock/download", jsonOf("downloadLocation" to bad), clinic.owner.token),
                )
            }
            assertEquals(1, stock.tracked.size)
        }
        withApp(TestEnv(stockImages = FakeStock(fail = true))) { api ->
            val clinic = Fixtures.clinic(api)
            assertError(
                HttpStatusCode.BadGateway, "STOCK_PHOTOS_UNAVAILABLE", api.get("${clinic.base}/site/stock?q=room", clinic.owner.token),
            )
        }
        withApp { api ->
            val clinic = Fixtures.clinic(api)
            val off = api.get("${clinic.base}/site/stock?q=room", clinic.owner.token)
            assertStatus(HttpStatusCode.OK, off)
            assertEquals("""{"enabled":false,"results":[]}""", off.bodyAsText())
        }
    }
}
