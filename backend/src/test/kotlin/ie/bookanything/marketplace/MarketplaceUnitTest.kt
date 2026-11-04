package ie.bookanything.marketplace

import ie.bookanything.http.ApiException
import ie.bookanything.services.OptionDef
import ie.bookanything.services.toDef
import ie.bookanything.support.SiteFixtures
import java.time.LocalDate
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class MarketplaceUnitTest {
    @Test
    fun `industries map to categories and unknown ones are other`() {
        assertEquals("physio", MarketplaceCategories.forIndustry("physio").key)
        assertEquals("car-wash", MarketplaceCategories.forIndustry("car_wash").key)
        assertEquals("music-lessons", MarketplaceCategories.forIndustry("music_lessons").key)
        assertEquals("gp-practice", MarketplaceCategories.forIndustry("gp_practice").key)
        assertEquals("salon", MarketplaceCategories.forIndustry("salon").key)
        assertEquals("fitness", MarketplaceCategories.forIndustry("fitness_class").key)
        assertEquals("other", MarketplaceCategories.forIndustry("generic").key)
        assertEquals("other", MarketplaceCategories.forIndustry("underwater_basket_weaving").key)
        // Every template industry has a category, and keys are URL-safe and unique.
        ie.bookanything.templates.Templates.all.forEach { t -> MarketplaceCategories.forIndustry(t.setup.industry) }
        assertEquals(MarketplaceCategories.ALL.size, MarketplaceCategories.ALL.map { it.key }.toSet().size)
        assertTrue(MarketplaceCategories.ALL.all { Regex("^[a-z0-9-]+$").matches(it.key) })
    }

    @Test
    fun `free text finds categories by keyword or prefix, not by accident`() {
        assertEquals(listOf("car-wash"), MarketplaceCategories.matching("valet").map { it.key })
        assertEquals(listOf("physio"), MarketplaceCategories.matching("phys").map { it.key })
        assertTrue("massage" in MarketplaceCategories.matching("sports massage dublin").map { it.key })
        assertTrue(MarketplaceCategories.matching("carlow").none { it.key == "car-wash" }, "a town name is not a car wash")
        assertEquals(emptyList(), MarketplaceCategories.matching("ab"))
    }

    @Test
    fun `cursors round-trip and must match the sort`() {
        val id = UUID.randomUUID()
        val byDistance = SearchCursor.ByDistance(3.141592653589793, id)
        assertEquals(byDistance, SearchCursors.decode(SearchCursors.encode(byDistance), byDistance = true))
        val byName = SearchCursor.ByName("o'brien: bikes | more", id)
        assertEquals(byName, SearchCursors.decode(SearchCursors.encode(byName), byDistance = false))
        assertFailsWith<ApiException> { SearchCursors.decode(SearchCursors.encode(byName), byDistance = true) }
        assertFailsWith<ApiException> { SearchCursors.decode("not-a-cursor!", byDistance = false) }
        assertNull(SearchCursors.decode(null, byDistance = false))
    }

    @Test
    fun `search parameters validate into a typed filter`() {
        val f = SearchFilters.parse(
            SearchParams(
                q = "  valet ", category = "car-wash", city = "cork", available = "week", deals = true,
                minPriceCents = 1000, maxPriceCents = 5000, limit = 5,
            ),
        )
        assertEquals("valet", f.text)
        assertEquals("car-wash", f.category!!.key)
        assertEquals("Cork", f.near!!.label)
        assertEquals(MarketplaceSearch.CITY_RADIUS_KM, f.near.radiusKm)
        assertIs<AvailabilityFilter.ThisWeek>(f.availability)
        assertTrue(f.dealsOnly)
        val near = SearchFilters.parse(SearchParams(lat = 53.3, lng = -6.2, radiusKm = 5.0, date = "2026-10-06"))
        assertEquals(5.0, near.near!!.radiusKm)
        assertEquals(AvailabilityFilter.On(LocalDate.of(2026, 10, 6)), near.availability)
        assertNull(SearchFilters.parse(SearchParams(q = "a")).text, "one letter is not a query")

        fun fields(p: SearchParams) = assertFailsWith<ApiException> { SearchFilters.parse(p) }.fields
        assertTrue("category" in fields(SearchParams(category = "space-travel")))
        assertTrue("city" in fields(SearchParams(city = "atlantis")))
        assertTrue("lng" in fields(SearchParams(lat = 53.0)))
        assertTrue("lat" in fields(SearchParams(lat = 91.0, lng = 0.0)))
        assertTrue("radiusKm" in fields(SearchParams(lat = 53.0, lng = -6.0, radiusKm = 500.0)))
        assertTrue("available" in fields(SearchParams(available = "tomorrow")))
        assertTrue("maxPrice" in fields(SearchParams(minPriceCents = 500, maxPriceCents = 100)))
        assertTrue("limit" in fields(SearchParams(limit = 31)))
        assertTrue("date" in fields(SearchParams(date = "06/10/2026")))
    }

    @Test
    fun `availability filters give inclusive windows`() {
        val today = LocalDate.of(2026, 10, 5)
        assertEquals(today..today, AvailabilityFilter.Today.window(today))
        assertEquals(today..today.plusDays(6), AvailabilityFilter.ThisWeek.window(today))
        assertEquals(today.plusDays(3)..today.plusDays(3), AvailabilityFilter.On(today.plusDays(3)).window(today))
    }

    @Test
    fun `a service's from price is its cheapest option, else its own price`() {
        val service = SiteFixtures.service(priceCents = 5000).toDef()
        assertEquals(5000, FromPrice.of(service))
        val options = listOf(OptionDef(UUID.randomUUID(), "Long", 90, 7000), OptionDef(UUID.randomUUID(), "Short", 30, 3000))
        assertEquals(3000, FromPrice.of(service.copy(options = options)))
    }
}
