package ie.bookanything.site

import ie.bookanything.site.PlanJson.with
import ie.bookanything.support.Api
import ie.bookanything.support.Clinic
import ie.bookanything.support.Fixtures
import ie.bookanything.support.Fixtures.book
import ie.bookanything.support.TestCredits
import ie.bookanything.support.TestDatabase
import ie.bookanything.support.TestEnv
import ie.bookanything.support.a
import ie.bookanything.support.assertError
import ie.bookanything.support.assertStatus
import ie.bookanything.support.b
import ie.bookanything.support.i
import ie.bookanything.support.jsonOf
import ie.bookanything.support.o
import ie.bookanything.support.obj
import ie.bookanything.support.parse
import ie.bookanything.support.s
import ie.bookanything.support.withApp
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Shared calls for site integration tests. */
object SiteCalls {
    suspend fun state(api: Api, clinic: Clinic, token: String = clinic.owner.token): JsonObject {
        val res = api.get("${clinic.base}/site", token)
        assertStatus(HttpStatusCode.OK, res)
        return res.obj()
    }

    suspend fun save(api: Api, clinic: Clinic, plan: JsonElement, baseVersion: Int?) =
        api.put("${clinic.base}/site", jsonOf("plan" to plan, "baseVersion" to baseVersion), clinic.owner.token)

    suspend fun saveOk(api: Api, clinic: Clinic, plan: JsonElement, baseVersion: Int?): JsonObject {
        val res = save(api, clinic, plan, baseVersion)
        assertStatus(HttpStatusCode.OK, res)
        return res.obj()
    }

    suspend fun publish(api: Api, clinic: Clinic): JsonObject {
        val res = api.post("${clinic.base}/site/publish", null, clinic.owner.token)
        assertStatus(HttpStatusCode.OK, res)
        return res.obj()
    }

    suspend fun publicSite(api: Api, clinic: Clinic): JsonObject {
        val res = api.get(clinic.public)
        assertStatus(HttpStatusCode.OK, res)
        return res.obj()["site"]!!.o
    }

    fun draft(state: JsonObject) = state["draft"]!!.o
    fun version(state: JsonObject) = state["draftVersion"]?.takeIf { it !is JsonNull }?.jsonPrimitive?.content?.toInt()
    fun index(plan: JsonObject, type: String) = plan["sections"]!!.jsonArray.indexOfFirst { it.s("type") == type }
    fun section(plan: JsonObject, type: String) = plan["sections"]!!.jsonArray[index(plan, type)].o
}

class SiteLifecycleTest {
    private fun count(sql: String, vararg params: Any?) = Fixtures.sqlOne(sql, *params) { it.getInt(1) }!!

    private fun isPublished(clinic: Clinic) =
        TestDatabase.dataSource.connection.use { SiteRepository.isPublished(it, UUID.fromString(clinic.id)) }

    @Test
    fun `a business without a site gets the default plan everywhere`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val state = SiteCalls.state(api, clinic)
        assertNull(SiteCalls.version(state))
        assertEquals(JsonNull, state["published"])
        assertEquals(JsonNull, state["publishedAt"])
        assertFalse(state.b("hasUnpublishedChanges"))
        val draft = SiteCalls.draft(state)
        assertEquals("calm", draft.s("theme"))
        assertEquals(
            listOf("hero", "services", "team", "hours", "faq", "testimonials", "cta", "contact"),
            draft["sections"]!!.jsonArray.map { it.s("id") },
        )
        assertEquals(listOf("Alex", "Blake"), state["context"]!!.o["team"]!!.jsonArray.map { it.s("name") })
        val hours = state["context"]!!.o["openingHours"]!!.jsonArray
        assertEquals((1..7).toList(), hours.map { it.i("dayOfWeek") })
        assertEquals(listOf("09:00-17:00", "18:00-20:00"), hours[0].o["intervals"]!!.jsonArray.map { "${it.s("start")}-${it.s("end")}" })
        assertEquals(
            listOf("09:00-12:00"), hours[5].o["intervals"]!!.jsonArray.map { "${it.s("start")}-${it.s("end")}" }, "audiences are ignored",
        )
        assertEquals(0, hours[6].o["intervals"]!!.jsonArray.size)
        val ai = state["ai"]!!.o
        assertEquals("false", ai["model"]!!.jsonPrimitive.content)
        val credits = ai["credits"]!!.o
        val free = TestCredits.shown(TestCredits.micro(TestCredits.allowances.free))
        assertEquals(
            listOf(free, "0.0", free, "false", "false", "2026-11-01", "false"),
            listOf(
                "limit", "used", "remaining", "runningLow", "limitReached", "resetsOn", "overage",
            ).map { credits[it]!!.jsonPrimitive.content },
        )
        assertFalse(state["stock"]!!.o.b("enabled"))
        assertEquals(false, state["uploads"]!!.o.b("enabled"))
        assertEquals(5 * 1024 * 1024, state["uploads"]!!.o.i("maxBytes"))
        val site = SiteCalls.publicSite(api, clinic)
        assertTrue(site.b("isDefault"))
        assertEquals(draft, site["plan"]!!.o)
        assertEquals(state["context"], site["context"])
        assertEquals(0, api.get("${clinic.base}/site/versions", clinic.owner.token).obj()["items"]!!.jsonArray.size)
    }

    @Test
    fun `opening hours only use rules valid today`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val rules = jsonOf(
            "rules" to listOf(
                mapOf("dayOfWeek" to 7, "startTime" to "10:00", "endTime" to "12:00", "validFrom" to "2027-01-01"),
                mapOf("dayOfWeek" to 7, "startTime" to "13:00", "endTime" to "14:00", "validUntil" to "2026-10-04"),
                mapOf(
                    "dayOfWeek" to 7, "startTime" to "15:00", "endTime" to "16:00", "validFrom" to "2026-10-05",
                    "validUntil" to "2026-10-05",
                ),
            ),
        )
        assertStatus(HttpStatusCode.OK, api.put("${clinic.base}/resources/${clinic.resource("Studio")}/rules", rules, clinic.owner.token))
        val sunday = SiteCalls.state(api, clinic)["context"]!!.o["openingHours"]!!.jsonArray[6].o["intervals"]!!.jsonArray
        assertEquals(listOf("15:00"), sunday.map { it.s("start") })
    }

    @Test
    fun `save, publish, edit again and restore`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val default = SiteCalls.draft(SiteCalls.state(api, clinic))
        // Saving the unchanged default creates nothing.
        assertNull(SiteCalls.version(SiteCalls.saveOk(api, clinic, default, null)))

        val bold = default.with("theme", "bold").with("palette.primaryColor", "#1D4ED8")
        val v1 = SiteCalls.saveOk(api, clinic, bold, null)
        assertEquals(1, SiteCalls.version(v1))
        assertTrue(v1.b("hasUnpublishedChanges"))
        assertTrue(SiteCalls.publicSite(api, clinic).b("isDefault"), "drafts are never public")
        assertFalse(isPublished(clinic))
        assertError(HttpStatusCode.Conflict, "CONFLICT", SiteCalls.save(api, clinic, bold.with("theme", "minimal"), 0))
        assertEquals(1, SiteCalls.version(SiteCalls.saveOk(api, clinic, bold, 1)), "unchanged: no new version")

        val published = SiteCalls.publish(api, clinic)
        assertEquals(1, published.i("publishedVersion"))
        assertEquals("2026-10-05T09:00:00+01:00", published.s("publishedAt"))
        assertFalse(published.b("hasUnpublishedChanges"))
        assertTrue(isPublished(clinic))
        val site = SiteCalls.publicSite(api, clinic)
        assertFalse(site.b("isDefault"))
        assertEquals("bold", site["plan"]!!.o.s("theme"))
        assertEquals("#1d4ed8", api.get(clinic.public).obj()["branding"]!!.o.s("primaryColor"), "publishing sets the business colour")
        assertEquals(1, SiteCalls.publish(api, clinic).i("publishedVersion"), "publishing again is a no-op")

        // A new draft does not change the public site until it is published.
        val teamIndex = SiteCalls.index(bold, "team")
        val hidden = bold.with("sections[$teamIndex].enabled", JsonPrimitive(false))
        val v2 = SiteCalls.saveOk(api, clinic, hidden, 1)
        assertEquals(2, SiteCalls.version(v2))
        assertTrue(v2.b("hasUnpublishedChanges"))
        assertTrue(SiteCalls.section(SiteCalls.publicSite(api, clinic)["plan"]!!.o, "team").b("enabled"))
        SiteCalls.publish(api, clinic)
        assertFalse(SiteCalls.section(SiteCalls.publicSite(api, clinic)["plan"]!!.o, "team").b("enabled"))

        val versions = api.get("${clinic.base}/site/versions", clinic.owner.token).obj()["items"]!!.jsonArray
        assertEquals(listOf(2, 1), versions.map { it.i("version") })
        assertEquals(listOf("Hid section: Team"), versions[0].o["changes"]!!.jsonArray.map { it.jsonPrimitive.content })
        assertEquals(
            listOf("Theme: Calm → Bold", "Palette: primary colour changed"),
            versions[1].o["changes"]!!.jsonArray.map { it.jsonPrimitive.content },
        )
        assertEquals(listOf("owner", "owner"), versions.map { it.s("source") })
        assertEquals("owner", versions[0].s("actorType"))
        assertEquals("Olive Owner", versions[0].s("actorName"))
        assertTrue(versions[0].b("isPublished") && versions[0].b("isDraft"))
        assertFalse(versions[1].b("isPublished") || versions[1].b("isDraft"))

        val detail = api.get("${clinic.base}/site/versions/1", clinic.owner.token).obj()
        val normalizedBold = bold.with("palette.primaryColor", "#1d4ed8")
        assertEquals(normalizedBold, detail["plan"]!!.o)
        assertEquals(
            listOf("version", "source", "instruction", "changes", "actorType", "actorName", "createdAt", "isPublished", "isDraft", "plan"),
            detail.keys.toList(),
        )
        assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.get("${clinic.base}/site/versions/99", clinic.owner.token))
        assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", api.get("${clinic.base}/site/versions/abc", clinic.owner.token))
        assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", api.get("${clinic.base}/site/versions/0", clinic.owner.token))

        val restored = api.post("${clinic.base}/site/versions/1/restore", null, clinic.owner.token)
        assertStatus(HttpStatusCode.OK, restored)
        assertEquals(3, SiteCalls.version(restored.obj()))
        assertEquals(normalizedBold, SiteCalls.draft(restored.obj()))
        assertTrue(restored.obj().b("hasUnpublishedChanges"))
        val v3 = api.get("${clinic.base}/site/versions", clinic.owner.token).obj()["items"]!!.jsonArray[0]
        assertEquals("restore", v3.s("source"))
        assertEquals(listOf("Showed section: Team"), v3.o["changes"]!!.jsonArray.map { it.jsonPrimitive.content })
        assertEquals(
            3, SiteCalls.version(api.post("${clinic.base}/site/versions/3/restore", null, clinic.owner.token).obj()),
            "restoring the draft itself changes nothing",
        )
        assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.post("${clinic.base}/site/versions/42/restore", null, clinic.owner.token))

        val actions = Fixtures.sqlOne(
            "SELECT string_agg(action, ',' ORDER BY occurred_at, action) FROM audit_events WHERE business_id = ? AND entity_type = 'site'",
            clinic.id,
        ) { it.getString(1) }!!
        assertEquals(setOf("site.updated", "site.published", "site.restored"), actions.split(',').toSet())
    }

    @Test
    fun `publishing a never-saved site pins the default plan as version 1`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val default = SiteCalls.draft(SiteCalls.state(api, clinic))
        val published = SiteCalls.publish(api, clinic)
        assertEquals(1, published.i("draftVersion"))
        assertEquals(1, published.i("publishedVersion"))
        assertEquals(default, published["published"]!!.o)
        assertEquals(
            "template", api.get("${clinic.base}/site/versions", clinic.owner.token).obj()["items"]!!.jsonArray.single().s("source"),
        )
        assertFalse(SiteCalls.publicSite(api, clinic).b("isDefault"))
    }

    @Test
    fun `invalid plans are rejected with field paths`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val draft = SiteCalls.draft(SiteCalls.state(api, clinic))
        val t = SiteCalls.index(draft, "testimonials")
        val res = SiteCalls.save(api, clinic, draft.with("sections[$t].content.rating", JsonPrimitive(5)).with("theme", "neon"), null)
        assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", res)
        val fields = parse(res.bodyAsText()).o["error"]!!.o["fields"]!!.o
        assertEquals(setOf("sections[$t].content.rating", "theme"), fields.keys)
        assertError(
            HttpStatusCode.BadRequest, "INVALID_REQUEST", api.put("${clinic.base}/site", jsonOf("baseVersion" to null), clinic.owner.token),
        )
        assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", api.put("${clinic.base}/site", "{not json", clinic.owner.token))
        assertError(
            HttpStatusCode.BadRequest, "INVALID_REQUEST", api.put("${clinic.base}/site", jsonOf("plan" to "calm"), clinic.owner.token),
        )
        assertError(
            HttpStatusCode.BadRequest, "INVALID_REQUEST",
            api.put("${clinic.base}/site", jsonOf("plan" to draft, "baseVersion" to "one"), clinic.owner.token),
        )
        // Another business's service is unknown here.
        val other = Fixtures.clinic(api)
        val s = SiteCalls.index(draft, "services")
        val foreign = draft.with(
            "sections[$s].content.serviceIds", kotlinx.serialization.json.JsonArray(listOf(JsonPrimitive(other.service("Consult")))),
        )
        assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", SiteCalls.save(api, clinic, foreign, null))
        assertNull(SiteCalls.version(SiteCalls.state(api, clinic)))
    }

    @Test
    fun `restore drops services and people that are gone`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val draft = SiteCalls.draft(SiteCalls.state(api, clinic))
        val s = SiteCalls.index(draft, "services")
        val team = SiteCalls.index(draft, "team")
        val plan = draft
            .with(
                "sections[$s].content.serviceIds",
                kotlinx.serialization.json.JsonArray(listOf(clinic.service("Class"), clinic.service("Consult")).map(::JsonPrimitive)),
            )
            .with(
                "sections[$team].content.members",
                kotlinx.serialization.json.JsonArray(
                    listOf("Alex", "Blake").map {
                        JsonObject(mapOf("resourceId" to JsonPrimitive(clinic.resource(it)), "bio" to JsonPrimitive("$it's bio")))
                    },
                ),
            )
        SiteCalls.saveOk(api, clinic, plan, null)
        SiteCalls.saveOk(api, clinic, plan.with("theme", "bold"), 1)
        assertStatus(HttpStatusCode.NoContent, api.delete("${clinic.base}/services/${clinic.service("Class")}", clinic.owner.token))
        assertStatus(
            HttpStatusCode.OK,
            api.patch("${clinic.base}/resources/${clinic.resource("Blake")}", jsonOf("isActive" to false), clinic.owner.token),
        )
        // Saving the old plan as is is now invalid...
        assertError(HttpStatusCode.BadRequest, "INVALID_REQUEST", SiteCalls.save(api, clinic, plan, 2))
        // ...but restoring it drops the stale references.
        val restored = api.post("${clinic.base}/site/versions/1/restore", null, clinic.owner.token)
        assertStatus(HttpStatusCode.OK, restored)
        val draftAfter = SiteCalls.draft(restored.obj())
        assertEquals(
            listOf(clinic.service("Consult")),
            SiteCalls.section(draftAfter, "services")["content"]!!.o["serviceIds"]!!.jsonArray.map { it.jsonPrimitive.content },
        )
        assertEquals(
            listOf(clinic.resource("Alex")),
            SiteCalls.section(draftAfter, "team")["content"]!!.o["members"]!!.jsonArray.map { it.s("resourceId") },
        )
        assertEquals(listOf("Alex"), restored.obj()["context"]!!.o["team"]!!.a.map { it.s("name") })
    }

    @Test
    fun `the newest 50 versions are kept plus the published one`() = withApp { api ->
        val clinic = Fixtures.clinic(api)
        val draft = SiteCalls.draft(SiteCalls.state(api, clinic))
        val h = SiteCalls.index(draft, "hero")
        SiteCalls.saveOk(api, clinic, draft.with("sections[$h].content.headline", "Version 1"), null)
        SiteCalls.publish(api, clinic)
        for (v in 2..56) SiteCalls.saveOk(api, clinic, draft.with("sections[$h].content.headline", "Version $v"), v - 1)
        val versions = api.get("${clinic.base}/site/versions", clinic.owner.token).obj()["items"]!!.jsonArray.map { it.i("version") }
        assertEquals((56 downTo 7).toList() + 1, versions)
        assertEquals(
            "Version 1",
            SiteCalls.section(
                api.get("${clinic.base}/site/versions/1", clinic.owner.token).obj()["plan"]!!.o,
                "hero",
            )["content"]!!.o.s("headline"),
        )
        assertError(HttpStatusCode.NotFound, "NOT_FOUND", api.get("${clinic.base}/site/versions/6", clinic.owner.token))
    }

    @Test
    fun `only the public business page embeds the site`() {
        val env = TestEnv()
        withApp(env) { api ->
            val clinic = Fixtures.clinic(api)
            SiteCalls.publish(api, clinic)
            val held = book(api, clinic, "Paid consult", "2026-10-07T12:00:00+01:00", resourceId = clinic.resource("Alex"))
            val paymentId = held["next"]!!.s("checkoutUrl").substringAfterLast('/')
            val dev = api.get("/v1/public/dev-payments/$paymentId").obj()
            assertEquals(JsonNull, dev["business"]!!.o["site"])
            val business = api.get(clinic.base, clinic.owner.token).obj()
            assertFalse(business.containsKey("site"), "the dashboard Business type is unchanged")
            val mcp = api.client.post("/v1/mcp") {
                header("Accept", "application/json, text/event-stream")
                header("MCP-Protocol-Version", "2025-06-18")
                contentType(ContentType.Application.Json)
                setBody(
                    """{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"find_business","arguments":{"slug":"${clinic.slug}"}}}""",
                )
            }
            val text = parse(mcp.bodyAsText()).o["result"]!!.o["content"]!!.jsonArray[0].o.s("text")
            val found = parse(text).o
            assertEquals(clinic.slug, found.s("slug"))
            assertEquals(JsonNull, found["site"])
            assertTrue(SiteCalls.publicSite(api, clinic).containsKey("plan"))
        }
    }

    @Test
    fun `site tables are isolated by row level security`() = withApp { api ->
        val a = Fixtures.clinic(api)
        val b = Fixtures.clinic(api)
        SiteCalls.publish(api, a)
        SiteCalls.publish(api, b)
        Fixtures.sql(
            "INSERT INTO ai_usage (business_id, feature, model, status, price_version) VALUES (?, 'site_edit', 'm', 'settled', 'v'), (?, " +
                "'site_edit', 'm', 'settled', 'v')",
            java.util.UUID.fromString(a.id), java.util.UUID.fromString(b.id),
        )
        TestDatabase.dataSource.connection.use { c ->
            c.createStatement().use { st ->
                st.execute(
                    "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rls_probe') THEN CREATE ROLE rls_probe NOLOGIN; " +
                        "END IF; END $$",
                )
                st.execute("GRANT SELECT ON ALL TABLES IN SCHEMA public TO rls_probe")
            }
            c.autoCommit = false
            c.createStatement().use { st ->
                st.execute("SET LOCAL ROLE rls_probe")
                st.execute("SELECT set_config('app.business_id', '${a.id}', true)")
                for (table in listOf("business_sites", "site_versions", "ai_usage")) {
                    st.executeQuery("SELECT DISTINCT business_id::text FROM $table").use { rs ->
                        assertEquals(listOf(a.id), generateSequence { if (rs.next()) rs.getString(1) else null }.toList(), table)
                    }
                }
            }
            c.rollback()
            c.autoCommit = true
        }
        assertEquals(1, count("SELECT count(*) FROM business_sites WHERE business_id = ?", java.util.UUID.fromString(b.id)))
    }
}
