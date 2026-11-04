package ie.bookanything.config

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class AppUrlsTest {
    private val urls = AppUrls("https://bookanything.ie", listOf("https://physio.example"))

    @Test
    fun `links point at the frontend`() {
        assertEquals("https://bookanything.ie/lumen-physio", urls.bookingPage("lumen-physio"))
        assertEquals("https://bookanything.ie/manage/t0k", urls.manage("t0k"))
        assertEquals("https://physio.example/manage/t0k", urls.manage("t0k", origin = "https://physio.example"))
        assertEquals("https://bookanything.ie/invitations/inv", urls.invitation("inv"))
        assertEquals("https://bookanything.ie/my/bookings", urls.myBookings())
        assertEquals("https://bookanything.ie/dashboard/gleam/bookings", urls.dashboardBookings("gleam"))
    }

    @Test
    fun `only our frontend and embed origins are allowed redirect targets`() {
        assertTrue(urls.isAllowed("https://bookanything.ie/dashboard/x/settings/billing"))
        assertTrue(urls.isAllowed("https://physio.example/book"))
        assertFalse(urls.isAllowed("https://evil.example/bookanything.ie"))
        assertFalse(urls.isAllowed("http://bookanything.ie/"))
        assertFalse(urls.isAllowed("not a url"))
    }

    @Test
    fun `return origins fall back to the frontend`() {
        assertEquals("https://bookanything.ie", urls.returnOrigin(null))
        assertEquals("https://physio.example", urls.returnOrigin(" https://physio.example/book/ "))
        assertEquals("https://bookanything.ie", urls.returnOrigin("https://evil.example/"))
        assertEquals("https://bookanything.ie", urls.returnOrigin("::nope::"))
        assertNull(AppUrls.originOf("::nope::"))
    }
}
