package ie.bookanything

import ie.bookanything.ai.usage.aiUsageRoutes
import ie.bookanything.assistant.assistantRoutes
import ie.bookanything.auth.clerkWebhookRoutes
import ie.bookanything.availability.availabilitySettingsRoutes
import ie.bookanything.booking.manageRoutes
import ie.bookanything.booking.publicRoutes
import ie.bookanything.booking.staffBookingRoutes
import ie.bookanything.business.businessScoped
import ie.bookanything.business.onboardingRoutes
import ie.bookanything.config.AppConfig
import ie.bookanything.config.ConfigException
import ie.bookanything.config.PushMode
import ie.bookanything.customers.customerGroupRoutes
import ie.bookanything.customers.customerRoutes
import ie.bookanything.db.Migrations
import ie.bookanything.db.createDataSource
import ie.bookanything.db.queryOne
import ie.bookanything.http.ApiJson
import ie.bookanything.http.NoStoreByDefault
import ie.bookanything.http.configureErrors
import ie.bookanything.jobs.JobWorker
import ie.bookanything.marketplace.marketplaceSettingsRoutes
import ie.bookanything.marketplace.publicMarketplaceRoutes
import ie.bookanything.mcp.customer.customerRequestRoutes
import ie.bookanything.mcp.mcpRoutes
import ie.bookanything.me.meRoutes
import ie.bookanything.notifications.emailPreviewRoutes
import ie.bookanything.notifications.inbox.inboxRoutes
import ie.bookanything.notifications.push.pushDeviceRoutes
import ie.bookanything.oauth.oauthRoutes
import ie.bookanything.oauth.oauthWellKnownRoutes
import ie.bookanything.offers.offerRoutes
import ie.bookanything.offers.publicOfferRoutes
import ie.bookanything.payments.paymentSettingsRoutes
import ie.bookanything.payments.stripeWebhookRoutes
import ie.bookanything.releases.releaseRoutes
import ie.bookanything.reports.reportRoutes
import ie.bookanything.resources.resourceRoutes
import ie.bookanything.seed.DemoSeeder
import ie.bookanything.services.questionRoutes
import ie.bookanything.services.serviceRoutes
import ie.bookanything.site.siteRoutes
import ie.bookanything.storage.publicUploadRoutes
import ie.bookanything.storage.uploadRoutes
import ie.bookanything.team.teamRoutes
import ie.bookanything.templates.aiRoutes
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.Application
import io.ktor.server.application.ApplicationStarted
import io.ktor.server.application.ApplicationStopping
import io.ktor.server.application.install
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty
import io.ktor.server.plugins.callid.CallId
import io.ktor.server.plugins.callid.callIdMdc
import io.ktor.server.plugins.calllogging.CallLogging
import io.ktor.server.plugins.compression.Compression
import io.ktor.server.plugins.compression.deflate
import io.ktor.server.plugins.compression.excludeContentType
import io.ktor.server.plugins.compression.gzip
import io.ktor.server.plugins.compression.minimumSize
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.plugins.cors.routing.CORS
import io.ktor.server.request.httpMethod
import io.ktor.server.request.path
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.route
import io.ktor.server.routing.routing
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.Serializable
import org.slf4j.LoggerFactory
import org.slf4j.event.Level
import java.util.UUID
import kotlin.system.exitProcess

private val log = LoggerFactory.getLogger("ie.bookanything.Application")

@Serializable
data class HealthDto(val status: String, val database: String)

fun main(args: Array<String>) {
    val config = try {
        AppConfig.fromEnvironment()
    } catch (e: ConfigException) {
        System.err.println("Configuration error: ${e.message ?: e.javaClass.simpleName}")
        exitProcess(2)
    }
    when (args.firstOrNull()) {
        "migrate" -> {
            createDataSource(config.database).use { Migrations.migrate(it) }
            log.info("migrations applied")
            return
        }
        "seed-demo" -> {
            if (!config.isDevelopment) {
                System.err.println("seed-demo is only available with APP_ENV=development.")
                exitProcess(2)
            }
            createDataSource(config.database).use { ds ->
                Migrations.migrate(ds)
                DemoSeeder(AppContext.create(config, ds)).seed()
            }
            return
        }
        "email-preview" -> {
            val dir = java.io.File(args.getOrNull(1) ?: "build/email-previews")
            ie.bookanything.notifications.EmailPreviews.writeAll(dir).forEach { println(it.path) }
            return
        }
        null, "serve" -> Unit
        else -> {
            System.err.println("Unknown command '${args.first()}'. Commands: serve (default), migrate, seed-demo, email-preview [dir]")
            exitProcess(2)
        }
    }
    val dataSource = createDataSource(config.database)
    if (config.runMigrationsOnStart) Migrations.migrate(dataSource)
    val ctx = AppContext.create(config, dataSource)
    embeddedServer(Netty, port = config.port, host = config.host) {
        module(ctx, startWorker = config.jobsEnabled)
        monitor.subscribe(ApplicationStopping) { dataSource.close() }
    }.start(wait = true)
}

private val SECRET_PATH = Regex("/(manage|invitations)/[^/]+")

/** Manage and invitation tokens are bearer secrets: never write them to logs. */
fun redactPath(path: String): String = SECRET_PATH.replace(path) { "/${it.groupValues[1]}/[redacted]" }

private val REQUEST_ID = Regex("^[A-Za-z0-9._\\-]{8,128}$")

fun Application.module(ctx: AppContext, startWorker: Boolean = false) {
    installRequestLogging()
    installCompression()
    install(NoStoreByDefault)
    configureErrors()
    installStartupLog(ctx)
    installWorker(if (startWorker) JobWorker(ctx) else null)
    routing {
        // Installed on the routing root (not the application) so the MCP route can use MCP's own JSON settings.
        install(ContentNegotiation) { json(ApiJson) }
        apiRoutes(ctx)
    }
}

/** A request id per call (the caller's `X-Request-Id` when well formed) and one log line per API request, secrets redacted. */
private fun Application.installRequestLogging() {
    install(CallId) {
        retrieveFromHeader(HttpHeaders.XRequestId)
        verify { REQUEST_ID.matches(it) }
        generate { UUID.randomUUID().toString() }
        replyToHeader(HttpHeaders.XRequestId)
    }
    install(CallLogging) {
        level = Level.INFO
        callIdMdc("requestId")
        mdc("businessId") { call -> call.attributes.getOrNull(BusinessIdAttribute) }
        filter { call -> call.request.path().startsWith("/v1") && call.request.path() != "/v1/health" }
        format { call -> "${call.request.httpMethod.value} ${redactPath(call.request.path())} -> ${call.response.status()?.value ?: "-"}" }
    }
}

/**
 * gzip (or deflate) for responses of [COMPRESS_MIN_BYTES] or more when the client accepts it: JSON shrinks 5-15x (a month
 * of availability or bookings is 75 KB raw). Not for server-sent events, which must reach the client as they are
 * written, nor for images, which are compressed already.
 */
private fun Application.installCompression() {
    install(Compression) {
        gzip { priority = 1.0 }
        deflate { priority = 0.9 }
        minimumSize(COMPRESS_MIN_BYTES)
        excludeContentType(ContentType.Text.EventStream, ContentType.Image.Any, ContentType.Video.Any, ContentType.Audio.Any)
    }
}

/** Below this a response fits a packet or two anyway, and compressing it costs more than it saves. */
private const val COMPRESS_MIN_BYTES = 1024L

/** Logs which providers this instance runs with, and warns about settings that leave a feature half set up. */
private fun Application.installStartupLog(ctx: AppContext) {
    monitor.subscribe(ApplicationStarted) {
        val c = ctx.config
        log.info(
            "bookanything API started env={} auth={} payments={} email={} sms={} push={} ai={} storage={} stock={} geocoder={} sites={}",
            c.env, c.authMode, ctx.payments.name,
            if (c.email.resendApiKey != null) "resend" else "log", if (ctx.sms.enabled) "twilio" else "off", ctx.push.name,
            ctx.ai.model?.modelId ?: "templates",
            ctx.storage.name, if (ctx.stockImages.enabled) "unsplash" else "off", c.geo.providerName,
            if (c.sitesEnabled) "on" else "off",
        )
        configWarnings(c, ctx.payments.name).forEach { warning -> log.warn(warning) }
    }
}

/** Settings that are valid but leave a feature unusable. */
fun configWarnings(c: AppConfig, paymentProvider: String): List<String> = listOfNotNull(
    "STRIPE_SECRET_KEY is set but no STRIPE_WEBHOOK_SECRET / STRIPE_CONNECT_WEBHOOK_SECRET: payments will never be confirmed"
        .takeIf { paymentProvider == "stripe" && c.stripe.webhookSecret == null && c.stripe.connectWebhookSecret == null },
    "STRIPE_PRICE_PRO / STRIPE_PRICE_BUSINESS not set: plan checkout is unavailable"
        .takeIf { c.stripe.secretKey != null && (c.stripe.pricePro == null || c.stripe.priceBusiness == null) },
    "CLERK_WEBHOOK_SECRET not set: deleted Clerk users are not anonymised".takeIf { c.isProduction && c.clerk.webhookSecret == null },
    "EXPO_ACCESS_TOKEN is set but PUSH_NOTIFICATIONS is not expo: push notifications are not sent"
        .takeIf { c.push.expoAccessToken != null && c.push.mode != PushMode.EXPO },
)

/** Starts the job worker once the server is up and stops it on shutdown. */
private fun Application.installWorker(worker: JobWorker?) {
    monitor.subscribe(ApplicationStarted) { worker?.start() }
    monitor.subscribe(ApplicationStopping) { worker?.stop() }
}

/** The API: OAuth discovery at the root, everything else under `/v1`. */
private fun Route.apiRoutes(ctx: AppContext) {
    oauthWellKnownRoutes(ctx)
    route("/v1") {
        healthRoute(ctx)
        route("/public") {
            publicCors(ctx.config.corsAllowedOrigins)
            publicRoutes(ctx)
            manageRoutes(ctx)
            publicUploadRoutes(ctx)
            publicMarketplaceRoutes(ctx)
            publicOfferRoutes(ctx)
        }

        emailPreviewRoutes(ctx)
        mcpRoutes(ctx)
        oauthRoutes(ctx)
        stripeWebhookRoutes(ctx)
        clerkWebhookRoutes(ctx)
        meRoutes(ctx)
        inboxRoutes(ctx)
        pushDeviceRoutes(ctx)
        customerRequestRoutes(ctx)
        onboardingRoutes(ctx)
        aiRoutes(ctx)
        businessScoped(ctx) {
            customerGroupRoutes(ctx)
            questionRoutes(ctx)
            resourceRoutes(ctx)
            availabilitySettingsRoutes(ctx)
            serviceRoutes(ctx)
            staffBookingRoutes(ctx)
            customerRoutes(ctx)
            teamRoutes(ctx)
            reportRoutes(ctx)
            paymentSettingsRoutes(ctx)
            if (ctx.config.sitesEnabled) siteRoutes(ctx)
            uploadRoutes(ctx)
            aiUsageRoutes(ctx)
            assistantRoutes(ctx)
            offerRoutes(ctx)
            releaseRoutes(ctx)
            marketplaceSettingsRoutes(ctx)
        }
    }
}

/** `GET /v1/health`: 200 when the database answers within 3 s, else 503. */
private fun Route.healthRoute(ctx: AppContext) {
    get("/health") {
        val ok = withTimeoutOrNull(3_000) {
            withContext(Dispatchers.IO) {
                runCatching {
                    ctx.db.dataSource.connection.use { c -> c.queryOne("SELECT 1") { it.getInt(1) } == 1 }
                }.getOrDefault(false)
            }
        } ?: false
        if (ok) {
            call.respond(HealthDto("ok", "ok"))
        } else {
            call.respond(HttpStatusCode.ServiceUnavailable, HealthDto("degraded", "unavailable"))
        }
    }
}

/** Embeds on [origins] may call the public API (and only it) from the browser. */
private fun Route.publicCors(origins: List<String>) {
    if (origins.isEmpty()) return
    install(CORS) {
        origins.forEach { origin ->
            val uri = java.net.URI(origin)
            allowHost(uri.authority, schemes = listOf(uri.scheme))
        }
        allowMethod(HttpMethod.Get)
        allowMethod(HttpMethod.Post)
        allowHeader(HttpHeaders.ContentType)
        allowHeader("Idempotency-Key")
        exposeHeader(HttpHeaders.XRequestId)
    }
}
