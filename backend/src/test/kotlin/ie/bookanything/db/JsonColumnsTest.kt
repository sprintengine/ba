package ie.bookanything.db

import ie.bookanything.business.Branding
import ie.bookanything.support.Fixtures
import kotlinx.serialization.serializer
import kotlin.test.Test
import kotlin.test.assertEquals

class JsonColumnsTest {
    private fun branding(json: String?): Branding? = Fixtures.sqlOne("SELECT gen_random_uuid() AS id, ?::jsonb::text AS branding", json) {
        it.jsonOr("branding", serializer<Branding>(), Branding(primaryColor = "#fallback"))
    }

    @Test
    fun `a JSON column decodes, ignoring keys it no longer has`() {
        assertEquals(Branding(primaryColor = "#123456"), branding("""{"primaryColor": "#123456", "removedField": 1}"""))
    }

    @Test
    fun `a null or undecodable JSON column reads as the fallback`() {
        assertEquals("#fallback", branding(null)?.primaryColor)
        assertEquals("#fallback", branding("""{"primaryColor": ["not", "a", "colour"]}""")?.primaryColor)
        assertEquals("#fallback", branding("[]")?.primaryColor)
    }
}
