package ie.bookanything.site

import ie.bookanything.support.FakeModelClient
import ie.bookanything.support.Fixtures
import ie.bookanything.support.TestConfig
import ie.bookanything.support.TestEnv
import ie.bookanything.support.a
import ie.bookanything.support.assertStatus
import ie.bookanything.support.b
import ie.bookanything.support.o
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.withApp
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.JsonNull
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** The production default: no business websites (`SITES_ENABLED` off), so `/{slug}` is the booking portal. */
class SitesDisabledTest {
    private fun env() = TestEnv(config = TestConfig.config(sites = false), modelClient = FakeModelClient())

    @Test
    fun `the public business has no site, and its portal style comes from the industry until one is chosen`() = withApp(env()) { api ->
        val clinic = Fixtures.clinic(api)
        val public = api.get(clinic.public).obj()
        assertEquals(JsonNull, public["site"])
        assertEquals("calm", public["branding"]!!.o.s("portalStyle"), "a physio's default style")

        val patched = api.patch(clinic.base, """{"branding":{"portalStyle":"bold"}}""", clinic.owner.token)
        assertStatus(HttpStatusCode.OK, patched)
        assertEquals("bold", patched.obj()["branding"]!!.o.s("portalStyle"))
        assertEquals("bold", api.get(clinic.public).obj()["branding"]!!.o.s("portalStyle"))

        val unknown = api.patch(clinic.base, """{"branding":{"portalStyle":"neon"}}""", clinic.owner.token)
        assertStatus(HttpStatusCode.BadRequest, unknown)
    }

    @Test
    fun `the dashboard is told sites are off and the site builder is not there`() = withApp(env()) { api ->
        val clinic = Fixtures.clinic(api)
        assertFalse(api.get(clinic.base, clinic.owner.token).obj().b("sitesEnabled"))
        assertStatus(HttpStatusCode.NotFound, api.get("${clinic.base}/site", clinic.owner.token))
        assertStatus(HttpStatusCode.NotFound, api.post("${clinic.base}/site/generate", "{}", clinic.owner.token))
        assertStatus(HttpStatusCode.NotFound, api.get("${clinic.base}/site/stock?q=clinic", clinic.owner.token))

        val nudges = api.get("${clinic.base}/assistant", clinic.owner.token).obj()["nudges"]!!.a.map { it.s("kind") }
        assertTrue("site_not_published" !in nudges, "nothing to publish: $nudges")
    }

    @Test
    fun `with sites on the dashboard is told so`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        assertTrue(api.get(clinic.base, clinic.owner.token).obj().b("sitesEnabled"))
    }
}
