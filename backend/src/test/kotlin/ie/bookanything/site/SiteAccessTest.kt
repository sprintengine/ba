package ie.bookanything.site

import ie.bookanything.storage.FakeStock
import ie.bookanything.storage.LocalDiskStorage
import ie.bookanything.storage.upload
import ie.bookanything.support.Api
import ie.bookanything.support.Clinic
import ie.bookanything.support.Fixtures
import ie.bookanything.support.Images
import ie.bookanything.support.TestEnv
import ie.bookanything.support.TestUser
import ie.bookanything.support.assertError
import ie.bookanything.support.assertStatus
import ie.bookanything.support.jsonOf
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.withApp
import io.ktor.client.statement.HttpResponse
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.jsonArray
import java.nio.file.Files
import kotlin.test.Test
import kotlin.test.assertEquals

/** Every site route with every kind of caller: owner and admin allowed, staff 403, others 404, anonymous 401. */
class SiteAccessTest {
    private data class Caller(
        val name: String, val token: String?, val expected: (allowed: HttpStatusCode) -> Pair<HttpStatusCode, String?>,
    )

    private suspend fun member(api: Api, clinic: Clinic, role: String): TestUser {
        val user = TestUser.create(role, "Test ${role.replaceFirstChar { it.uppercase() }}")
        assertStatus(
            HttpStatusCode.Created,
            api.post("${clinic.base}/team/invitations", jsonOf("email" to user.email, "role" to role), clinic.owner.token),
        )
        assertEquals(listOf(clinic.slug), api.get("/v1/me", user.token).obj()["memberships"]!!.jsonArray.map { it.s("slug") })
        return user
    }

    @Test
    fun `site routes require an owner or admin`() {
        val env = TestEnv(
            storage = LocalDiskStorage(Files.createTempDirectory("uploads"), "http://localhost:3000"), stockImages = FakeStock(),
        )
        withApp(env) { api ->
            val clinic = Fixtures.clinic(api)
            SiteCalls.publish(api, clinic)
            val plan = SiteCalls.draft(SiteCalls.state(api, clinic))
            val base = clinic.base
            val routes: List<Pair<String, suspend (String?) -> HttpResponse>> = listOf(
                "GET /site" to { t -> api.get("$base/site", t) },
                "PUT /site" to { t -> api.put("$base/site", jsonOf("plan" to plan), t) },
                "POST /site/publish" to { t -> api.post("$base/site/publish", null, t) },
                "GET /site/versions" to { t -> api.get("$base/site/versions", t) },
                "GET /site/versions/1" to { t -> api.get("$base/site/versions/1", t) },
                "POST /site/versions/1/restore" to { t -> api.post("$base/site/versions/1/restore", null, t) },
                "POST /site/generate" to { t -> api.post("$base/site/generate", jsonOf("prompt" to "calm"), t) },
                "POST /site/edit" to { t -> api.post("$base/site/edit", jsonOf("instruction" to "hide the team"), t) },
                "GET /site/stock" to { t -> api.get("$base/site/stock?q=room", t) },
                "POST /site/stock/download" to { t ->
                    api.post(
                        "$base/site/stock/download",
                        jsonOf("downloadLocation" to "https://api.unsplash.com/photos/a/download"), t,
                    )
                },
                "POST /uploads" to { t -> api.upload(clinic, Images.png(), token = t) },
            )
            val allowed = mapOf("POST /site/stock/download" to HttpStatusCode.NoContent, "POST /uploads" to HttpStatusCode.Created)
            val admin = member(api, clinic, "admin")
            val staff = member(api, clinic, "staff")
            val otherOwner = Fixtures.clinic(api).owner
            val callers = listOf(
                Caller("owner", clinic.owner.token) { it to null },
                Caller("admin", admin.token) { it to null },
                Caller("staff", staff.token) { HttpStatusCode.Forbidden to "FORBIDDEN" },
                Caller("signed-in customer", TestUser.create("customer").token) { HttpStatusCode.NotFound to "NOT_FOUND" },
                Caller("owner of another business", otherOwner.token) { HttpStatusCode.NotFound to "NOT_FOUND" },
                Caller("anonymous", null) { HttpStatusCode.Unauthorized to "UNAUTHENTICATED" },
            )
            for (caller in callers) {
                for ((route, call) in routes) {
                    val (status, code) = caller.expected(allowed[route] ?: HttpStatusCode.OK)
                    val res = call(caller.token)
                    if (code == null) assertStatus(status, res) else assertError(status, code, res)
                    if (res.status != status) error("${caller.name} $route")
                }
            }
            // The public file route needs no sign-in.
            val url = api.upload(clinic, Images.png()).obj().s("url").removePrefix("http://localhost:3000/api")
            assertStatus(HttpStatusCode.OK, api.get(url))
        }
    }
}
