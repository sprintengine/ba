package ie.bookanything.site.stock

import ie.bookanything.site.SiteAttribution
import ie.bookanything.support.LocalHttpServer
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class UnsplashStockImagesTest {
    private val body = """
    {"total": 3, "total_pages": 1, "results": [
      {"id": "abc123", "width": 4000, "height": 2667, "color": "#60544D", "alt_description": "a calm treatment room", "description": null,
       "urls": {"raw": "https://images.unsplash.com/photo-1?ixid=r", "regular": "https://images.unsplash.com/photo-1?ixid=x&w=1080", "small": "https://images.unsplash.com/photo-1?ixid=x&w=400"},
       "user": {"name": "Sam Photographer", "links": {"html": "https://unsplash.com/@sam"}},
       "links": {"download_location": "https://api.unsplash.com/photos/abc123/download?ixid=x"}},
      {"id": "evil", "width": 10, "height": 10, "color": "red",
       "urls": {"regular": "https://evil.example/x.jpg", "small": "https://evil.example/s.jpg"},
       "user": {"name": "X", "links": {"html": "https://unsplash.com/@x"}}, "links": {"download_location": ""}},
      {"id": "noalt", "width": 800, "height": 600, "color": null,
       "urls": {"regular": "https://images.unsplash.com/photo-2", "small": "https://images.unsplash.com/photo-2s"},
       "user": {"name": "Robin", "links": {"html": "https://unsplash.com/@robin"}}, "links": {"download_location": "https://api.unsplash.com/photos/noalt/download"}}
    ]}
    """.trimIndent()

    @Test
    fun `searches with the API key and maps attributed photos`() {
        LocalHttpServer { LocalHttpServer.Response(200, body) }.use { server ->
            val photos = UnsplashStockImages("key-123", server.baseUrl).search("physio room", 2)
            val req = server.requests.single()
            assertEquals("/search/photos", req.path)
            assertEquals("Client-ID key-123", req.headers["authorization"])
            assertEquals("v1", req.headers["accept-version"])
            listOf("query=physio%20room", "per_page=24", "page=2", "orientation=landscape", "content_filter=high").forEach {
                assertTrue(req.query!!.contains(it), "${req.query} should contain $it")
            }
            assertEquals(listOf("abc123", "noalt"), photos.map { it.id }, "photos not hosted on images.unsplash.com are dropped")
            val p = photos[0]
            assertEquals("https://images.unsplash.com/photo-1?ixid=x&w=1080", p.url)
            assertEquals("https://images.unsplash.com/photo-1?ixid=x&w=400", p.thumbUrl)
            assertEquals(4000 to 2667, p.width to p.height)
            assertEquals("#60544d", p.color)
            assertEquals("a calm treatment room", p.alt)
            assertEquals(
                SiteAttribution("Sam Photographer", "https://unsplash.com/@sam?utm_source=bookanything&utm_medium=referral"), p.attribution,
            )
            assertEquals("https://api.unsplash.com/photos/abc123/download?ixid=x", p.downloadLocation)
            assertEquals("physio room", photos[1].alt, "the query stands in for a missing description")
        }
    }

    @Test
    fun `provider failures are reported and tracking only calls Unsplash`() {
        LocalHttpServer { LocalHttpServer.Response(403, """{"errors":["Rate Limit Exceeded"]}""") }.use { server ->
            assertFailsWith<StockUnavailableException> { UnsplashStockImages("k", server.baseUrl).search("x", 1) }
        }
        LocalHttpServer { LocalHttpServer.Response(200, "<html>") }.use { server ->
            assertFailsWith<StockUnavailableException> { UnsplashStockImages("k", server.baseUrl).search("x", 1) }
        }
        LocalHttpServer { LocalHttpServer.Response(200, "{}") }.use { server ->
            UnsplashStockImages("k", server.baseUrl).trackDownload("${server.baseUrl}/photos/abc/download")
            UnsplashStockImages("k", server.baseUrl).trackDownload("https://evil.example/photos/abc")
            assertEquals(0, server.requests.size, "only https://api.unsplash.com/photos/ links are called")
        }
        assertEquals(false, DisabledStockImages.enabled)
        assertEquals(emptyList(), DisabledStockImages.search("x", 1))
    }
}
