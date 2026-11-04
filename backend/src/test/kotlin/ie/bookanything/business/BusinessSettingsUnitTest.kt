package ie.bookanything.business

import ie.bookanything.http.ApiException
import ie.bookanything.http.Patch
import ie.bookanything.support.SiteFixtures
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import java.time.ZoneId
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class BusinessSettingsUnitTest {
    private val business = SiteFixtures.business()
    private fun patch(json: String) = Patch(Json.parseToJsonElement(json).jsonObject)

    @Test
    fun `a patch changes only what it names and normalises it`() {
        val updated = BusinessSettings.apply(
            business,
            patch("""{"slug": " New-Slug ", "timezone": "Europe/London", "branding": {"primaryColor": "#ABCDEF"}}"""),
        )
        assertEquals("new-slug", updated.slug)
        assertEquals(ZoneId.of("Europe/London"), updated.zone)
        assertEquals("#abcdef", updated.branding.primaryColor)
        assertEquals(business.name, updated.name)
        assertEquals(business.policies, updated.policies)
    }

    @Test
    fun `every field problem is reported at once, in field order`() {
        val e = assertFailsWith<ApiException> {
            BusinessSettings.apply(business, patch("""{"slug": "admin", "currency": "euro", "contactEmail": "nope", "status": "x"}"""))
        }
        assertEquals(listOf("slug", "currency", "status", "contactEmail"), e.fields.keys.toList())
    }
}
