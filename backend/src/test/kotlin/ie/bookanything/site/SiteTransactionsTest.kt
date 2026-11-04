package ie.bookanything.site

import ie.bookanything.auth.Role
import ie.bookanything.site.PlanJson.with
import ie.bookanything.support.Fixtures
import ie.bookanything.support.TestEnv
import ie.bookanything.support.access
import ie.bookanything.support.b
import ie.bookanything.support.s
import ie.bookanything.support.withApp
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Site commands run in the caller's transaction, so they can be one unit of work with other commands (a Bo action). */
class SiteTransactionsTest {
    private class Boom : RuntimeException("roll back")

    @Test
    fun `site commands commit or roll back with the caller's transaction`() {
        val env = TestEnv()
        withApp(env) { api ->
            val clinic = Fixtures.clinic(api)
            val access = env.access(clinic.owner, clinic.id, Role.ADMIN)
            val site = env.ctx.site.service
            val renamed = SiteCalls.draft(SiteCalls.state(api, clinic)).with("theme", "bold")

            assertFailsWith<Boom> {
                env.db.tx(access.businessId) { conn ->
                    site.save(conn, access, renamed, baseVersion = null)
                    site.publish(conn, access)
                    throw Boom()
                }
            }
            val untouched = SiteCalls.state(api, clinic)
            assertNull(SiteCalls.version(untouched), "the draft save rolled back with the transaction")
            assertTrue(SiteCalls.publicSite(api, clinic).b("isDefault"), "the publish rolled back too")

            val published = env.db.tx(access.businessId) { conn ->
                site.save(conn, access, renamed, baseVersion = null)
                site.publish(conn, access)
            }
            assertEquals(1, published.publishedVersion)
            assertEquals("bold", SiteCalls.publicSite(api, clinic)["plan"]!!.s("theme"))
        }
    }
}
