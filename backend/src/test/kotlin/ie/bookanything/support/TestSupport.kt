package ie.bookanything.support

import ie.bookanything.AppContext
import ie.bookanything.ai.ModelClient
import ie.bookanything.ai.usage.AiOverageReporter
import ie.bookanything.auth.DevTokenVerifier
import ie.bookanything.auth.TokenService
import ie.bookanything.auth.TokenVerifier
import ie.bookanything.config.AppConfig
import ie.bookanything.config.AppEnv
import ie.bookanything.config.AuthMode
import ie.bookanything.config.ClerkConfig
import ie.bookanything.config.DatabaseConfig
import ie.bookanything.config.StripeConfig
import ie.bookanything.db.Db
import ie.bookanything.db.Migrations
import ie.bookanything.db.createDataSource
import ie.bookanything.module
import ie.bookanything.notifications.EmailMessage
import ie.bookanything.notifications.EmailSender
import ie.bookanything.notifications.NoopSmsSender
import ie.bookanything.notifications.SendResult
import ie.bookanything.notifications.SmsSender
import ie.bookanything.notifications.push.DisabledPushSender
import ie.bookanything.notifications.push.PushSender
import ie.bookanything.oauth.ClientMetadataFetcher
import ie.bookanything.payments.DevPaymentProvider
import ie.bookanything.payments.PaymentProvider
import ie.bookanything.site.stock.DisabledStockImages
import ie.bookanything.site.stock.StockImageProvider
import ie.bookanything.storage.AssetStorage
import ie.bookanything.storage.DisabledStorage
import ie.bookanything.templates.WebsiteFetcher
import io.ktor.client.HttpClient
import io.ktor.client.request.HttpRequestBuilder
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.ApplicationTestBuilder
import io.ktor.server.testing.testApplication
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.testcontainers.postgresql.PostgreSQLContainer
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicInteger
import javax.sql.DataSource
import kotlin.test.assertEquals
import kotlin.test.fail

/** One Postgres 16 container per test JVM, migrated once. Tests fail (never skip) without Docker. */
object TestDatabase {
    private val container: PostgreSQLContainer by lazy {
        PostgreSQLContainer("postgres:16-alpine").apply { start() }
    }

    val dataSource: DataSource by lazy {
        val ds = createDataSource(DatabaseConfig(container.jdbcUrl, container.username, container.password, 20))
        Migrations.migrate(ds)
        ds
    }

    val jdbcUrl: String get() = container.jdbcUrl
    val username: String get() = container.username
    val password: String get() = container.password
}

class MutableClock(var instant: Instant, private val zoneId: ZoneId = ZoneOffset.UTC) : Clock() {
    override fun getZone(): ZoneId = zoneId
    override fun withZone(zone: ZoneId): Clock = MutableClock(instant, zone).also { it.instant = instant }
    override fun instant(): Instant = instant
    fun advanceMinutes(minutes: Long) { instant = instant.plusSeconds(minutes * 60) }
}

object TestConfig {
    fun config(
        env: AppEnv = AppEnv.TEST,
        authMode: AuthMode = AuthMode.DEV,
        clerk: ClerkConfig = ClerkConfig(null, null, emptySet(), null),
        rateLimits: Boolean = false,
        stripe: StripeConfig = StripeConfig(null, null, null, null, null),
        // On here so the site builder stays covered; SitesDisabledTest covers the production default (off).
        sites: Boolean = true,
        // On here so Bo stays covered; AssistantDisabledTest covers the production default (off).
        assistant: Boolean = true,
    ) = AppConfig(
        env = env, host = "127.0.0.1", port = 0, appBaseUrl = "http://localhost:3000",
        database = DatabaseConfig(TestDatabase.jdbcUrl, TestDatabase.username, TestDatabase.password, 10),
        runMigrationsOnStart = false, authMode = authMode, clerk = clerk,
        stripe = stripe,
        trustForwardedFor = false, jobsEnabled = false, corsAllowedOrigins = emptyList(),
        tokenSecret = AppConfig.DEV_TOKEN_SECRET, rateLimitsEnabled = rateLimits,
        sitesEnabled = sites,
        assistantEnabled = assistant,
    )
}

/** Captures emails in memory instead of sending them. */
class RecordingEmailSender(override val from: String = "test@bookanything.test") : EmailSender {
    val sent = CopyOnWriteArrayList<EmailMessage>()
    override fun send(message: EmailMessage): SendResult {
        sent.add(message)
        return SendResult("sent", "rec_${sent.size}")
    }
}

/** Default test "now": Monday 5 October 2026, 08:00 UTC (09:00 in Dublin). */
val DEFAULT_NOW: Instant = Instant.parse("2026-10-05T08:00:00Z")

class TestEnv(
    val clock: MutableClock = MutableClock(DEFAULT_NOW),
    config: AppConfig = TestConfig.config(),
    verifier: TokenVerifier = DevTokenVerifier(),
    payments: PaymentProvider = DevPaymentProvider("http://localhost:3000"),
    sms: SmsSender = NoopSmsSender(),
    modelClient: ModelClient? = null,
    websiteFetcher: WebsiteFetcher = WebsiteFetcher { null },
    storage: AssetStorage = DisabledStorage,
    stockImages: StockImageProvider = DisabledStockImages,
    overageReporter: AiOverageReporter? = null,
    /** Client ID Metadata Documents: none by default (tests never fetch from the network). */
    clientMetadataFetcher: ClientMetadataFetcher = ClientMetadataFetcher { null },
    /** The shared test database by default; a [CountingDataSource] over it to count one app's statements. */
    dataSource: DataSource = TestDatabase.dataSource,
    /** Push notifications: off by default (nothing queued); a [FakePushSender] to see what would be pushed. */
    push: PushSender = DisabledPushSender,
) {
    val email = RecordingEmailSender()
    val ctx = AppContext(
        config = config, db = Db(dataSource), clock = clock, tokens = TokenService(config.tokenSecret),
        verifier = verifier, payments = payments, email = email, sms = sms, modelClient = modelClient,
        websiteFetcher = websiteFetcher, storage = storage, stockImages = stockImages, overageReporter = overageReporter,
        clientMetadataFetcher = clientMetadataFetcher, push = push,
    )
    val db get() = ctx.db
}

private val counter = AtomicInteger(0)

fun unique(prefix: String) = "$prefix-${System.nanoTime().toString(36).takeLast(6)}${counter.incrementAndGet()}"

fun devToken(sub: String, email: String = "$sub@bookanything.test", name: String? = "Test User"): String =
    DevTokenVerifier.token(if (sub.startsWith("dev_")) sub else "dev_$sub", email.lowercase(), name)

/** A dev-auth identity with a unique subject and email. */
data class TestUser(val token: String, val email: String) {
    companion object {
        fun create(prefix: String = "user", name: String = "Test User"): TestUser {
            val id = unique(prefix)
            val email = "$id@bookanything.test"
            return TestUser(devToken("dev_$id", email, name), email)
        }
    }
}

val json = Json { ignoreUnknownKeys = true }

fun parse(text: String): JsonElement = json.parseToJsonElement(text)
suspend fun HttpResponse.obj(): JsonObject = parse(bodyAsText()).jsonObject
suspend fun HttpResponse.arr(): JsonArray = parse(bodyAsText()).jsonArray
val JsonElement.o: JsonObject get() = jsonObject
val JsonElement.a: JsonArray get() = jsonArray
fun JsonElement.s(key: String): String = jsonObject[key]!!.jsonPrimitive.content
fun JsonElement.sOrNull(key: String): String? = jsonObject[key]?.takeIf { it !is JsonNull }?.jsonPrimitive?.content
fun JsonElement.i(key: String): Int = jsonObject[key]!!.jsonPrimitive.content.toInt()
fun JsonElement.b(key: String): Boolean = jsonObject[key]!!.jsonPrimitive.content.toBoolean()

fun jsonOf(vararg pairs: Pair<String, Any?>): String = JsonObject(pairs.associate { (k, v) -> k to toJson(v) }).toString()

fun toJson(v: Any?): JsonElement = when (v) {
    null -> JsonNull
    is JsonElement -> v
    is String -> JsonPrimitive(v)
    is Number -> JsonPrimitive(v)
    is Boolean -> JsonPrimitive(v)
    is Map<*, *> -> JsonObject(v.entries.associate { (k, value) -> k.toString() to toJson(value) })
    is List<*> -> JsonArray(v.map(::toJson))
    else -> JsonPrimitive(v.toString())
}

suspend fun assertStatus(expected: HttpStatusCode, response: HttpResponse) {
    if (response.status != expected) fail("Expected $expected but got ${response.status}: ${response.bodyAsText()}")
}

suspend fun assertError(expected: HttpStatusCode, code: String, response: HttpResponse) {
    val body = response.bodyAsText()
    if (response.status != expected) fail("Expected $expected $code but got ${response.status}: $body")
    assertEquals(code, parse(body).o["error"]!!.s("code"), body)
}

fun HttpRequestBuilder.auth(token: String?) {
    if (token != null) header(HttpHeaders.Authorization, "Bearer $token")
}

fun HttpRequestBuilder.jsonBody(body: String) {
    contentType(ContentType.Application.Json)
    setBody(body)
}

/** Thin API client used by route tests. */
class Api(val client: HttpClient) {
    suspend fun get(path: String, token: String? = null) = client.get(path) { auth(token) }
    suspend fun post(path: String, body: String? = null, token: String? = null, headers: Map<String, String> = emptyMap()) =
        client.post(path) { auth(token); headers.forEach { (k, v) -> header(k, v) }; if (body != null) jsonBody(body) }
    suspend fun put(path: String, body: String, token: String? = null) = client.put(path) { auth(token); jsonBody(body) }
    suspend fun patch(path: String, body: String, token: String? = null) = client.patch(path) { auth(token); jsonBody(body) }
    suspend fun delete(path: String, token: String? = null, body: String? = null) =
        client.delete(path) { auth(token); if (body != null) jsonBody(body) }

    /** Creates a business from a template (with a unique slug) and returns the Business JSON. */
    suspend fun createFromTemplate(key: String, owner: TestUser, customize: (JsonObject) -> JsonObject = { it }): JsonObject {
        val setup = get("/v1/public/templates/$key").obj()
        val withSlug = JsonObject(setup + mapOf("slug" to JsonPrimitive(unique(key.replace('_', '-')))))
        val res = post("/v1/businesses", customize(withSlug).toString(), owner.token)
        assertStatus(HttpStatusCode.Created, res)
        return res.obj()
    }
}

fun withApp(env: TestEnv = TestEnv(), block: suspend ApplicationTestBuilder.(Api) -> Unit) = testApplication {
    application { module(env.ctx) }
    block(Api(client))
}

fun newId(): UUID = UUID.randomUUID()
