package ie.bookanything.security

import ie.bookanything.auth.Role
import ie.bookanything.module
import ie.bookanything.support.AccessWorld
import ie.bookanything.support.Api
import ie.bookanything.support.Caller
import ie.bookanything.support.Caller.ADMIN
import ie.bookanything.support.Caller.ANONYMOUS
import ie.bookanything.support.Caller.CUSTOMER
import ie.bookanything.support.Caller.OWNER
import ie.bookanything.support.Caller.STAFF
import ie.bookanything.support.OAuthClientSim
import ie.bookanything.support.TestEnv
import ie.bookanything.support.jsonOf
import ie.bookanything.support.s
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.http.HttpStatusCode.Companion.BadRequest
import io.ktor.http.HttpStatusCode.Companion.Conflict
import io.ktor.http.HttpStatusCode.Companion.Created
import io.ktor.http.HttpStatusCode.Companion.Forbidden
import io.ktor.http.HttpStatusCode.Companion.NoContent
import io.ktor.http.HttpStatusCode.Companion.NotFound
import io.ktor.http.HttpStatusCode.Companion.OK
import io.ktor.http.HttpStatusCode.Companion.ServiceUnavailable
import io.ktor.http.HttpStatusCode.Companion.Unauthorized
import io.ktor.server.application.plugin
import io.ktor.server.routing.RoutingRoot
import io.ktor.server.routing.getAllRoutes
import io.ktor.server.testing.testApplication
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.fail

/** Path params made for one caller: a booking to cancel, a resource to delete. */
private typealias Fresh = suspend AccessWorld.(Caller) -> Map<String, String>

/**
 * What every caller ([Caller]) gets from every route. Each route the application serves needs an entry in [MATRIX], so
 * a new route without a decision about who may call it fails `every route has a matrix entry`.
 *
 * Allowed callers are sent a request that passes authorisation but does as little as possible: reads, an empty body
 * that validation refuses (400 shows the caller got past the access check), or a fresh target made for that caller
 * ([Probe.fresh]) when the route only makes sense on a real one (cancel, delete).
 */
class RouteAccessMatrixTest {
    // ---------- Rules: what each caller should get ----------

    private sealed interface Rule {
        fun expected(caller: Caller): HttpStatusCode
    }

    /**
     * A business route needing [min]: anonymous 401, customers and other businesses 404 (membership is never revealed),
     * members below [min] 403, the rest [ok].
     */
    private data class Member(val min: Role, val ok: HttpStatusCode) : Rule {
        override fun expected(caller: Caller) = when {
            caller == ANONYMOUS -> Unauthorized
            !caller.isMember -> NotFound
            role(caller).rank < min.rank -> Forbidden
            else -> ok
        }
    }

    /** Public: everyone gets [ok]; a valid session changes nothing. Also signature-checked webhooks (tokens are ignored). */
    private data class Open(val ok: HttpStatusCode) : Rule {
        override fun expected(caller: Caller) = ok
    }

    /** Any signed-in user. */
    private data class SignedIn(val ok: HttpStatusCode) : Rule {
        override fun expected(caller: Caller) = if (caller == ANONYMOUS) Unauthorized else ok
    }

    /** Something one person holds (their booking, their connected app, their invitation): everyone else 404. */
    private data class Holder(val holder: Caller, val ok: HttpStatusCode) : Rule {
        override fun expected(caller: Caller) = when (caller) {
            ANONYMOUS -> Unauthorized
            holder -> ok
            else -> NotFound
        }
    }

    /** Everyone gets [status], whoever they are (the customer MCP refuses web sessions: it takes OAuth tokens only). */
    private data class Nobody(val status: HttpStatusCode) : Rule {
        override fun expected(caller: Caller) = status
    }

    // ---------- Probes: one per route ----------

    private class Probe(
        val method: String,
        val template: String,
        val rule: Rule,
        val body: String? = null,
        val query: String = "",
        val fresh: Fresh? = null,
        /** Needs a world of its own (it changes the business for everyone, e.g. deleting it). */
        val isolated: Boolean = false,
        /** A body that would succeed, for the checks that must get past validation to the lookup (scoping, foreign ids). */
        val valid: (AccessWorld.() -> String)? = null,
    ) {
        fun with(valid: AccessWorld.() -> String) = Probe(method, template, rule, body, query, fresh, isolated, valid)
        val route get() = "$method $template"
    }

    private companion object {
        fun role(caller: Caller) = when (caller) {
            OWNER -> Role.OWNER
            ADMIN -> Role.ADMIN
            else -> Role.STAFF
        }

        const val EMPTY = "{}"
        const val B = "/v1/businesses/{businessId}"
        const val RANGE = "from=2026-10-01&to=2026-10-31"

        fun get(path: String, rule: Rule, query: String = "", fresh: Fresh? = null) =
            Probe("GET", path, rule, query = query, fresh = fresh)
        fun post(path: String, rule: Rule, body: String? = EMPTY, fresh: Fresh? = null) =
            Probe("POST", path, rule, body = body, fresh = fresh)
        fun put(path: String, rule: Rule, body: String = EMPTY) = Probe("PUT", path, rule, body = body)
        fun patch(path: String, rule: Rule, body: String = EMPTY) = Probe("PATCH", path, rule, body = body)
        fun delete(path: String, rule: Rule, isolated: Boolean = false, fresh: Fresh? = null) =
            Probe("DELETE", path, rule, fresh = fresh, isolated = isolated)

        val S = Role.STAFF
        val A = Role.ADMIN
        val O = Role.OWNER

        /** The access decision for every route, grouped as in docs/architecture.md section 6. */
        val MATRIX: List<Probe> = listOf(
            // 6.1 Public
            get("/v1/health", Open(OK)),
            get("/v1/public/templates", Open(OK)),
            get("/v1/public/templates/{key}", Open(OK)),
            get("/v1/public/businesses/{slug}", Open(OK)),
            get("/v1/public/businesses/{slug}/services", Open(OK)),
            get("/v1/public/businesses/{slug}/availability", Open(OK), query = "serviceId={serviceId}&$RANGE"),
            get("/v1/public/businesses/{slug}/offers", Open(OK)),
            post("/v1/public/businesses/{slug}/bookings", Open(BadRequest)),
            get("/v1/public/manage/{token}", Open(OK)),
            post("/v1/public/manage/{token}/cancel", Open(OK), body = null, fresh = { mapOf("token" to booking().s("manageToken")) }),
            post("/v1/public/manage/{token}/reschedule", Open(BadRequest)),
            get("/v1/public/manage/{token}/availability", Open(OK), query = RANGE),
            post("/v1/public/manage/{token}/pay", Open(Conflict), body = null),
            get("/v1/public/dev-payments/{paymentId}", Open(OK)),
            post("/v1/public/dev-payments/{paymentId}/complete", Open(BadRequest)),
            get("/v1/public/uploads/{businessId}/{file}", Open(NotFound)),
            get("/v1/public/marketplace/meta", Open(OK)),
            get("/v1/public/marketplace/search", Open(OK)),
            post("/v1/webhooks/stripe", Open(ServiceUnavailable)),
            post("/v1/webhooks/clerk", Open(ServiceUnavailable)),
            get("/v1/dev/emails", Open(OK)),
            get("/v1/dev/emails/{template}", Open(OK)),
            // MCP: the anonymous server is public; the customer server takes OAuth access tokens only, never web sessions.
            post("/v1/mcp", Open(HttpStatusCode.Accepted)), // an empty JSON-RPC message is a notification
            get("/v1/mcp", Open(HttpStatusCode.MethodNotAllowed)),
            delete("/v1/mcp", Open(HttpStatusCode.MethodNotAllowed)),
            post("/v1/mcp/customer", Nobody(Unauthorized)),
            get("/v1/mcp/customer", Nobody(Unauthorized)),
            delete("/v1/mcp/customer", Nobody(Unauthorized)),
            // The business server takes business-MCP access tokens only (section 20.7).
            post("/v1/mcp/business", Nobody(Unauthorized)),
            get("/v1/mcp/business", Nobody(Unauthorized)),
            delete("/v1/mcp/business", Nobody(Unauthorized)),

            // 6.2 Me
            get("/v1/me", SignedIn(OK)),
            get("/v1/me/bookings", SignedIn(OK)),
            post(
                "/v1/me/bookings/{bookingId}/cancel", Holder(CUSTOMER, OK), body = null,
                fresh = { mapOf("bookingId" to booking(by = CUSTOMER)["booking"]!!.s("id")) },
            ),
            post("/v1/me/bookings/{bookingId}/reschedule", Holder(CUSTOMER, BadRequest)),
            get("/v1/me/bookings/{bookingId}/availability", Holder(CUSTOMER, OK), query = RANGE),
            post("/v1/me/bookings/{bookingId}/pay", Holder(CUSTOMER, Conflict), body = null),
            // Accepting makes the customer a member, so this one gets a world of its own.
            Probe(
                "POST", "/v1/invitations/{token}/accept", Holder(CUSTOMER, OK), body = null, isolated = true,
                fresh = { mapOf("token" to invitation(users.getValue(CUSTOMER))) },
            ),
            get("/v1/me/connected-apps", SignedIn(OK)),
            // 22 notifications and 20.8 approvals: always the signed-in person's own (anyone else's is 404, like an unknown one)
            get("/v1/me/notifications", SignedIn(OK)),
            post("/v1/me/notifications/{id}/read", SignedIn(NotFound), body = null),
            post("/v1/me/notifications/read-all", SignedIn(NoContent), body = null),
            get("/v1/me/notification-settings", SignedIn(OK)),
            patch("/v1/me/notification-settings", SignedIn(BadRequest)),
            // 22 the mobile app's phones (a token only ever registers or unregisters for the caller)
            post("/v1/me/push-devices", SignedIn(BadRequest)),
            delete("/v1/me/push-devices", SignedIn(BadRequest)),
            get("/v1/me/agent-requests", SignedIn(OK)),
            get("/v1/me/agent-requests/{id}", SignedIn(NotFound)),
            post("/v1/me/agent-requests/{id}/approve", SignedIn(NotFound), body = null),
            post("/v1/me/agent-requests/{id}/decline", SignedIn(NotFound), body = null),
            get("/v1/me/agent-settings", SignedIn(OK)),
            patch("/v1/me/agent-settings", SignedIn(BadRequest)),
            delete(
                "/v1/me/connected-apps/{grantId}", Holder(CUSTOMER, NoContent),
                fresh = {
                    val sim = OAuthClientSim(api).register()
                    sim.connect(users.getValue(CUSTOMER))
                    mapOf("grantId" to api.get("/v1/me/connected-apps", token(CUSTOMER)).let { res -> parseFirstId(res) })
                },
            ),

            // 6.3 Onboarding and AI
            post("/v1/businesses", SignedIn(BadRequest)),
            get("/v1/businesses/slug-available", SignedIn(OK), query = "slug=matrix-free-slug"),
            post("/v1/ai/business-draft", SignedIn(BadRequest)),

            // 6.4 Business settings
            get(B, Member(S, OK)),
            patch(B, Member(A, OK)),
            delete(B, Member(O, NoContent), isolated = true),
            get("$B/overview", Member(S, OK)),
            get("$B/customer-groups", Member(S, OK)),
            post("$B/customer-groups", Member(A, BadRequest)),
            patch("$B/customer-groups/{groupId}", Member(A, OK)),
            delete("$B/customer-groups/{groupId}", Member(A, NoContent), fresh = { mapOf("groupId" to group()) }),
            get("$B/questions", Member(S, OK)),
            post("$B/questions", Member(A, BadRequest)),
            patch("$B/questions/{questionId}", Member(A, OK)),
            delete("$B/questions/{questionId}", Member(A, NoContent), fresh = { mapOf("questionId" to question()) }),

            // 6.5 Resources and availability (staff: their own resources only)
            get("$B/resources", Member(S, OK)),
            post("$B/resources", Member(A, BadRequest)),
            patch("$B/resources/{resourceId}", Member(A, OK)),
            delete("$B/resources/{resourceId}", Member(A, NoContent), fresh = { mapOf("resourceId" to resource()) }),
            get("$B/resources/{resourceId}/availability", Member(S, OK)),
            put("$B/resources/{resourceId}/rules", Member(S, BadRequest)),
            post("$B/resources/{resourceId}/overrides", Member(S, BadRequest)),
            delete("$B/overrides/{overrideId}", Member(S, NoContent), fresh = { mapOf("overrideId" to override()) }),
            get("$B/closures", Member(S, OK)),
            post("$B/closures", Member(A, BadRequest)),

            // 6.6 Services
            get("$B/services", Member(S, OK)),
            post("$B/services", Member(A, BadRequest)),
            put("$B/services/{serviceId}", Member(A, BadRequest)).with {
                jsonOf(
                    "name" to "Renamed", "durationMinutes" to 30,
                    "requirements" to listOf(mapOf("label" to "Therapist", "resourceIds" to listOf(clinic.resource("Blake")))),
                )
            },
            delete("$B/services/{serviceId}", Member(A, NoContent), fresh = { mapOf("serviceId" to service()) }),

            // 6.7 Bookings, customers, team, reports
            get("$B/bookings", Member(S, OK), query = RANGE),
            get("$B/bookings/{bookingId}", Member(S, OK)),
            post("$B/bookings", Member(S, BadRequest)),
            patch("$B/bookings/{bookingId}", Member(S, OK)),
            post("$B/bookings/{bookingId}/cancel", Member(S, OK), fresh = { mapOf("bookingId" to booking()["booking"]!!.s("id")) }),
            post("$B/bookings/{bookingId}/reschedule", Member(S, BadRequest)).with {
                jsonOf("start" to nextStart(), "resourceIds" to listOf(clinic.resource(side))) // stays on its calendar
            },
            post("$B/bookings/{bookingId}/approve", Member(S, Conflict), body = null),
            post("$B/bookings/{bookingId}/decline", Member(S, Conflict)),
            post("$B/bookings/{bookingId}/send-payment-link", Member(S, Conflict), body = null),
            post("$B/bookings/{bookingId}/paid-in-person", Member(S, Conflict), body = null),
            post("$B/bookings/{bookingId}/status", Member(S, BadRequest)).with { jsonOf("status" to "completed") },
            get("$B/availability", Member(S, OK), query = "serviceId={serviceId}&$RANGE"),
            get("$B/customers", Member(S, OK)),
            get("$B/customers/{customerId}", Member(S, OK)),
            post("$B/customers", Member(S, BadRequest)),
            patch("$B/customers/{customerId}", Member(S, OK)),
            delete("$B/customers/{customerId}", Member(A, NoContent), fresh = { mapOf("customerId" to customer()) }),
            get("$B/customers/{customerId}/export", Member(A, OK)),
            get("$B/team", Member(S, OK)),
            post("$B/team/invitations", Member(A, BadRequest)),
            patch("$B/team/{memberId}", Member(A, OK)),
            delete("$B/team/{memberId}", Member(A, NoContent), fresh = { mapOf("memberId" to member("staff")) }),
            get("$B/reports/summary", Member(A, OK), query = RANGE),
            get("$B/audit", Member(A, OK)),

            // 6.8 Payments and billing
            get("$B/payments/status", Member(A, OK)),
            post("$B/payments/connect", Member(O, BadRequest)),
            get("$B/billing", Member(O, OK)),
            post("$B/billing/checkout", Member(O, BadRequest)),
            post("$B/billing/portal", Member(O, BadRequest)),
            get("$B/ai/usage", Member(A, OK)),

            // 15 Site builder (owners and admins), uploads
            get("$B/site", Member(A, OK)),
            put("$B/site", Member(A, BadRequest)),
            post("$B/site/publish", Member(A, OK), body = null),
            get("$B/site/versions", Member(A, OK)),
            get("$B/site/versions/{version}", Member(A, OK)),
            post("$B/site/versions/{version}/restore", Member(A, OK), body = null),
            post("$B/site/generate", Member(A, OK)),
            post("$B/site/edit", Member(A, BadRequest)),
            get("$B/site/stock", Member(A, OK), query = "q=room"),
            post("$B/site/stock/download", Member(A, BadRequest)),
            post("$B/uploads", Member(A, ServiceUnavailable)),

            // 17 Bo (threads and proposals belong to the member who made them)
            get("$B/assistant", Member(S, OK)),
            get("$B/assistant/threads", Member(S, OK)),
            post("$B/assistant/threads", Member(S, Created)),
            get("$B/assistant/threads/{threadId}", Member(S, OK), fresh = { mapOf("threadId" to thread(it)) }),
            delete("$B/assistant/threads/{threadId}", Member(S, NoContent), fresh = { mapOf("threadId" to thread(it)) }),
            post("$B/assistant/threads/{threadId}/messages", Member(S, BadRequest), fresh = { mapOf("threadId" to thread(it)) }),
            post("$B/assistant/actions/{actionId}/confirm", Member(S, OK), body = null, fresh = { mapOf("actionId" to action(it)) }),
            post("$B/assistant/actions/{actionId}/reject", Member(S, OK), body = null, fresh = { mapOf("actionId" to action(it)) }),
            post("$B/assistant/nudges/{nudgeId}/dismiss", Member(A, NotFound), body = null),
            // 20.8 approvals: the member's own AI apps' proposals (anyone else's is 404, like an unknown one)
            get("$B/agent-requests", Member(S, OK)),
            get("$B/agent-requests/{actionId}", Member(S, NotFound)),
            post("$B/agent-requests/{actionId}/approve", Member(S, NotFound), body = null),
            post("$B/agent-requests/{actionId}/decline", Member(S, NotFound), body = null),
            get("$B/assistant/memory", Member(S, OK)),
            post("$B/assistant/memory", Member(A, BadRequest)),
            patch("$B/assistant/memory/{memoryId}", Member(A, BadRequest)).with { jsonOf("text" to "Closed on Sundays") },
            delete("$B/assistant/memory/{memoryId}", Member(A, NoContent), fresh = { mapOf("memoryId" to memory()) }),

            // 18-19 Marketplace listing and deals (owners and admins)
            get("$B/marketplace", Member(A, OK)),
            put("$B/marketplace", Member(A, BadRequest)),
            get("$B/offers", Member(A, OK)),
            post("$B/offers", Member(A, BadRequest)),
            post("$B/offers/preview", Member(A, BadRequest)),
            put("$B/offers/{offerId}", Member(A, BadRequest)).with { AccessWorld.offerBody(clinic) },
            delete("$B/offers/{offerId}", Member(A, NoContent), fresh = { mapOf("offerId" to offer()) }),
            post("$B/offers/{offerId}/pause", Member(A, OK), body = null),
            post("$B/offers/{offerId}/resume", Member(A, OK), body = null),
            get("$B/release-schedules", Member(A, OK)),
            post("$B/release-schedules", Member(A, BadRequest)),
            put("$B/release-schedules/{scheduleId}", Member(A, BadRequest))
                .with { AccessWorld.releaseScheduleBody(clinic.service("Paid consult")) },
            delete("$B/release-schedules/{scheduleId}", Member(A, NoContent), fresh = { mapOf("scheduleId" to releaseSchedule()) }),
            put("$B/release-schedules/{scheduleId}/changes/{date}", Member(A, BadRequest)).with { """{"action":"hold"}""" },
            delete("$B/release-schedules/{scheduleId}/changes/{date}", Member(A, OK)),
            get("$B/releases", Member(A, OK), query = RANGE),

            // 20 OAuth authorization server (clients are public; consent needs the signed-in user)
            get("/.well-known/oauth-authorization-server", Open(OK)),
            get("/.well-known/oauth-protected-resource", Open(OK)),
            get("/.well-known/oauth-protected-resource/{...}", Open(OK)),
            post("/v1/oauth/register", Open(BadRequest)),
            post("/v1/oauth/token", Open(BadRequest)),
            post("/v1/oauth/revoke", Open(BadRequest)), // form-encoded only
            get("/v1/oauth/authorize", SignedIn(BadRequest)),
            post("/v1/oauth/authorize", SignedIn(BadRequest)),
        )

        suspend fun parseFirstId(res: HttpResponse): String =
            ie.bookanything.support.parse(res.bodyAsText()).let { (it as kotlinx.serialization.json.JsonArray).first().s("id") }
    }

    // ---------- Running a probe ----------

    private fun resolve(template: String, params: Map<String, String>): String =
        Regex("""\{([A-Za-z.]+)\}""").replace(template) { m ->
            when (val name = m.groupValues[1]) {
                "..." -> "mcp"
                else -> params[name] ?: error("No value for {$name} in $template")
            }
        }

    private suspend fun call(
        world: AccessWorld,
        probe: Probe,
        caller: Caller,
        params: Map<String, String>,
        body: String? = probe.body,
    ): HttpResponse {
        val path = resolve(probe.template, params) + if (probe.query.isEmpty()) "" else "?" + resolve(probe.query, params)
        val token = world.token(caller)
        return when (probe.method) {
            "GET" -> world.api.get(path, token)
            "POST" -> world.api.post(path, body, token)
            "PUT" -> world.api.put(path, body ?: EMPTY, token)
            "PATCH" -> world.api.patch(path, body ?: EMPTY, token)
            "DELETE" -> world.api.delete(path, token)
            else -> error("Unknown method ${probe.method}")
        }
    }

    /** Runs [probe] for every caller (non-members first); returns a line per caller that got something else. */
    private suspend fun mismatches(env: TestEnv, api: Api, shared: AccessWorld, probe: Probe): List<String> {
        val world = if (probe.isolated) AccessWorld.create(env, api) else shared
        return Caller.entries.mapNotNull { caller ->
            val params = world.params + (probe.fresh?.invoke(world, caller).orEmpty())
            val res = call(world, probe, caller, params)
            val want = probe.rule.expected(caller)
            val got = res.status
            if (got == want) null else "${probe.route} as ${caller.label}: expected $want, got $got ${res.bodyAsText().take(160)}"
        }
    }

    private fun servedRoutes(env: TestEnv): Set<String> {
        var routes: List<String> = emptyList()
        testApplication {
            application {
                module(env.ctx)
                routes = plugin(RoutingRoot).getAllRoutes().map { it.toString() }
            }
            startApplication()
        }
        return routes.mapNotNull { raw ->
            val method = Regex("""\(method:([A-Z]+)\)""").find(raw)!!.groupValues[1]
            val path = raw.replace(Regex("""/\([^)]*\)"""), "").ifEmpty { "/" }
            if (method == "OPTIONS") null else "$method $path"
        }.toSet()
    }

    @Test
    fun `every route has a matrix entry`() {
        val served = servedRoutes(TestEnv())
        val listed = MATRIX.map { it.route }
        val duplicates = listed.groupBy { it }.filterValues { it.size > 1 }.keys
        assertEquals(emptySet(), duplicates, "duplicate matrix entries")
        val missing = served - listed.toSet()
        val stale = listed.toSet() - served
        if (missing.isNotEmpty() || stale.isNotEmpty()) {
            fail(
                "Routes without a matrix entry (decide who may call them):\n  ${missing.sorted().joinToString("\n  ")}\n" +
                    "Matrix entries for routes that no longer exist:\n  ${stale.sorted().joinToString("\n  ")}",
            )
        }
    }

    @Test
    fun `every route answers each caller as the matrix says`() {
        val env = TestEnv()
        ie.bookanything.support.withApp(env) { api ->
            val world = AccessWorld.create(env, api)
            val problems = MATRIX.flatMap { mismatches(env, api, world, it) }
            if (problems.isNotEmpty()) fail("${problems.size} access mismatches:\n" + problems.joinToString("\n"))
        }
    }

    /** What staff linked to Alex get from a member route aimed at Blake's booking, customer, calendar or time off. */
    private val staffElsewhere = mapOf(
        "bookingId" to NotFound, "customerId" to NotFound, "resourceId" to Forbidden, "overrideId" to Forbidden,
    )

    @Test
    fun `staff reach only their own resources' bookings, customers and calendars`() {
        val env = TestEnv()
        ie.bookanything.support.withApp(env) { api ->
            val world = AccessWorld.create(env, api).apply { side = "Blake" }
            val scoped = MATRIX.filter { p -> p.rule is Member && (p.rule as Member).min == Role.STAFF && scopedParam(p) != null }
            check(scoped.size >= 14) { "expected every booking, customer and calendar route, found ${scoped.map { it.route }}" }
            val denied = setOf(Unauthorized, Forbidden, NotFound)
            val problems = scoped.flatMap { probe ->
                val param = scopedParam(probe)!!
                listOf(STAFF, ADMIN).mapNotNull { caller ->
                    val fresh = probe.fresh?.invoke(world, caller).orEmpty()
                    val params = world.params + mapOf(param to world.params.getValue("blake.$param")) + fresh
                    val got = call(world, probe, caller, params, probe.valid?.invoke(world) ?: probe.body).status
                    val want = staffElsewhere.getValue(param)
                    when {
                        caller == STAFF && got != want -> "${probe.route} on Blake as staff: expected $want, got $got"
                        caller == ADMIN && got in denied -> "${probe.route} on Blake as admin: denied with $got"
                        else -> null
                    }
                }
            }
            if (problems.isNotEmpty()) fail(problems.joinToString("\n"))
        }
    }

    /** The staff-scoped id a route's path is about, if any. */
    private fun scopedParam(probe: Probe): String? = staffElsewhere.keys.firstOrNull { "{$it}" in probe.template }

    @Test
    fun `another business's ids are not found in your own routes`() {
        val env = TestEnv()
        ie.bookanything.support.withApp(env) { api ->
            val world = AccessWorld.create(env, api)
            val ids = setOf(
                "bookingId", "customerId", "resourceId", "serviceId", "groupId", "questionId", "overrideId", "memberId", "offerId",
                "memoryId", "scheduleId",
            )
            val probes = MATRIX.filter { p -> p.rule is Member && ids.any { "{$it}" in p.template } }
            val problems = probes.mapNotNull { probe ->
                val foreign = ids.filter { "{$it}" in probe.template }.associateWith { world.foreign.getValue(it) }
                val res = call(world, probe, OWNER, world.params + foreign, probe.valid?.invoke(world) ?: probe.body)
                if (res.status == NotFound) null else "${probe.route} with the other business's ${foreign.keys}: got ${res.status}"
            }
            if (problems.isNotEmpty()) fail(problems.joinToString("\n"))
        }
    }

    /**
     * `GET /businesses/{businessId}` also takes the business's slug (the dashboard asks by its URL while `/me` loads):
     * every caller gets what [MATRIX] says for the id, and the same body; another business's slug, or one that doesn't
     * exist, is not found.
     */
    @Test
    fun `the business read by its slug answers each caller as by its id`() {
        val env = TestEnv()
        ie.bookanything.support.withApp(env) { api ->
            val world = AccessWorld.create(env, api)
            val probe = MATRIX.single { it.route == "GET $B" }
            val slug = world.params.getValue("slug")
            val problems = Caller.entries.mapNotNull { caller ->
                val byId = call(world, probe, caller, world.params)
                val bySlug = call(world, probe, caller, world.params + ("businessId" to slug))
                val want = probe.rule.expected(caller)
                when {
                    bySlug.status != want -> "by slug as ${caller.label}: expected $want, got ${bySlug.status}"
                    want == OK && bySlug.bodyAsText() != byId.bodyAsText() -> "by slug as ${caller.label}: not the body read by id"
                    else -> null
                }
            }.toMutableList()
            for (other in listOf(world.foreign.getValue("slug"), "no-such-business", slug.uppercase(), "x".repeat(200))) {
                val res = call(world, probe, OWNER, world.params + ("businessId" to other))
                val want = if (other == slug.uppercase()) OK else NotFound
                if (res.status != want) problems += "by slug $other as owner: expected $want, got ${res.status}"
            }
            if (problems.isNotEmpty()) fail(problems.joinToString("\n"))
        }
    }

    @Test
    fun `every served route is documented in openapi yaml`() {
        val spec = specRoutes()
        val served = servedRoutes(TestEnv()).map { it.replace("{...}", "mcp") }.toSet()
        val undocumented = served - spec
        val unserved = spec - served
        if (undocumented.isNotEmpty() || unserved.isNotEmpty()) {
            fail(
                "Served but not in openapi.yaml:\n  ${undocumented.sorted().joinToString("\n  ")}\n" +
                    "In openapi.yaml but not served:\n  ${unserved.sorted().joinToString("\n  ")}",
            )
        }
    }

    /** "METHOD /path" for every operation in backend/openapi.yaml. */
    private fun specRoutes(): Set<String> {
        val methods = setOf("get", "post", "put", "patch", "delete")
        var path: String? = null
        val out = mutableSetOf<String>()
        File("openapi.yaml").readLines().forEach { line ->
            Regex("""^  (/\S*):\s*$""").find(line)?.let { path = it.groupValues[1]; return@forEach }
            if (line.isNotEmpty() && !line.startsWith(" ")) path = null
            Regex("""^    ([a-z]+):""").find(line)?.groupValues?.get(1)?.takeIf { it in methods }?.let { m ->
                path?.let { out += "${m.uppercase()} $it" }
            }
        }
        return out
    }
}
