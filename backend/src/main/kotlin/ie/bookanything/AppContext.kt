package ie.bookanything

import ie.bookanything.ai.AiModule
import ie.bookanything.ai.AnthropicModelClient
import ie.bookanything.ai.ModelClient
import ie.bookanything.ai.fake.FakeScript
import ie.bookanything.ai.fake.ScriptedModelClient
import ie.bookanything.ai.usage.AiOverageReporter
import ie.bookanything.ai.usage.PriceTable
import ie.bookanything.ai.usage.StripeAiOverageReporter
import ie.bookanything.assistant.AssistantModule
import ie.bookanything.auth.Authenticator
import ie.bookanything.auth.BusinessAccess
import ie.bookanything.auth.ClerkJwtVerifier
import ie.bookanything.auth.DevTokenVerifier
import ie.bookanything.auth.Memberships
import ie.bookanything.auth.Role
import ie.bookanything.auth.TokenService
import ie.bookanything.auth.TokenVerifier
import ie.bookanything.booking.BookingModule
import ie.bookanything.business.BusinessRepository
import ie.bookanything.business.ReservedSlugs
import ie.bookanything.config.AppConfig
import ie.bookanything.config.AuthMode
import ie.bookanything.config.PushMode
import ie.bookanything.db.Db
import ie.bookanything.geo.Geocoder
import ie.bookanything.geo.TableGeocoder
import ie.bookanything.http.ClientIpResolver
import ie.bookanything.http.Errors
import ie.bookanything.http.RateLimiter
import ie.bookanything.http.parseUuidOrNull
import ie.bookanything.http.pathUuid
import ie.bookanything.marketplace.MarketplaceSearch
import ie.bookanything.notifications.EmailSender
import ie.bookanything.notifications.LogEmailSender
import ie.bookanything.notifications.NoopSmsSender
import ie.bookanything.notifications.ResendEmailSender
import ie.bookanything.notifications.SmsSender
import ie.bookanything.notifications.TwilioSmsSender
import ie.bookanything.notifications.inbox.Inbox
import ie.bookanything.notifications.push.DisabledPushSender
import ie.bookanything.notifications.push.ExpoPushSender
import ie.bookanything.notifications.push.LogPushSender
import ie.bookanything.notifications.push.PushSender
import ie.bookanything.oauth.ClientMetadataFetcher
import ie.bookanything.oauth.HttpClientMetadataFetcher
import ie.bookanything.oauth.OAuthServer
import ie.bookanything.payments.ConnectExisting
import ie.bookanything.payments.PaymentProvider
import ie.bookanything.payments.PaymentProviders
import ie.bookanything.payments.SdkStripeGateway
import ie.bookanything.site.SiteModule
import ie.bookanything.site.stock.DisabledStockImages
import ie.bookanything.site.stock.StockImageProvider
import ie.bookanything.site.stock.UnsplashStockImages
import ie.bookanything.storage.AssetStorage
import ie.bookanything.storage.AssetStorages
import ie.bookanything.storage.DisabledStorage
import ie.bookanything.templates.AnthropicDraftGenerator
import ie.bookanything.templates.BusinessDraftGenerator
import ie.bookanything.templates.SafeWebsiteFetcher
import ie.bookanything.templates.TemplateDraftGenerator
import ie.bookanything.templates.WebsiteFetcher
import io.ktor.server.application.ApplicationCall
import io.ktor.util.AttributeKey
import java.time.Clock
import java.time.Instant
import javax.sql.DataSource

/**
 * The composition root: infrastructure and seams come in through the constructor (tests pass fakes, see
 * `support/TestSupport.kt`), feature modules are built from them once. [create] is the only place that picks an
 * implementation from configuration (docs/engineering.md section 4).
 */
class AppContext(
    val config: AppConfig,
    val db: Db,
    val clock: Clock,
    val tokens: TokenService,
    val verifier: TokenVerifier,
    val payments: PaymentProvider,
    val email: EmailSender,
    val sms: SmsSender,
    /** The raw model provider; null when no model is configured. Only ever used through [ai]. */
    modelClient: ModelClient? = null,
    websiteFetcher: WebsiteFetcher = SafeWebsiteFetcher(),
    val storage: AssetStorage = DisabledStorage,
    val stockImages: StockImageProvider = DisabledStockImages,
    prices: PriceTable = PriceTable.load(config.ai.pricesFile),
    /** Where AI overage is reported (Stripe Billing Meters); null keeps the allowance a hard limit. */
    overageReporter: AiOverageReporter? = null,
    val geocoder: Geocoder = TableGeocoder(),
    val clientMetadataFetcher: ClientMetadataFetcher = HttpClientMetadataFetcher(),
    /** Push notifications to the mobile app; off unless configured (section 22). */
    val push: PushSender = DisabledPushSender,
) {
    val auth = Authenticator(verifier, db)
    val inbox = Inbox(push = push.enabled)
    val rateLimiter = RateLimiter(
        db, config.rateLimitsEnabled,
        ClientIpResolver(config.trustForwardedFor, config.trustedProxies, config.trustedProxyHops, config.clientIpHeader),
        multiplier = config.rateLimitMultiplier,
    )

    val ai = AiModule(db, clock, config.ai, prices, modelClient, overageReporter)
    val booking = BookingModule(db, clock, tokens, payments, config.urls, inbox)
    val site = SiteModule(db, clock, storage, stockImages, ai, websiteFetcher)
    val assistant = AssistantModule(db, clock, config.ai.assistantEffort, ai, booking, payments, inbox, config.sitesEnabled)
    val draftGenerator: BusinessDraftGenerator = ai.model?.let { AnthropicDraftGenerator(it, websiteFetcher) } ?: TemplateDraftGenerator()
    val marketplace = MarketplaceSearch(payments)
    val oauth = OAuthServer(config.oauth, db, clientMetadataFetcher, clock)
    val connectExisting = ConnectExisting(
        db, clock, tokens, payments, config.urls,
        config.stripe.connectRedirectUri ?: (config.oauth.apiBaseUrl + ConnectExisting.CALLBACK_PATH),
    )

    /** Bo is offered to this deployment's businesses: switched on (`ASSISTANT_ENABLED`) and a model to run it. */
    val assistantAvailable: Boolean get() = config.assistantEnabled && ai.model != null

    fun now(): Instant = clock.instant()

    companion object {
        fun create(
            config: AppConfig,
            dataSource: DataSource,
            clock: Clock = Clock.systemUTC(),
            verifier: TokenVerifier? = null,
        ): AppContext {
            val db = Db(dataSource)
            val stripeGateway = config.stripe.secretKey?.let { SdkStripeGateway(it) }
            return AppContext(
                config = config,
                db = db,
                clock = clock,
                tokens = TokenService(config.tokenSecret),
                verifier = verifier ?: when (config.authMode) {
                    AuthMode.DEV -> DevTokenVerifier()
                    AuthMode.CLERK -> ClerkJwtVerifier(config.clerk)
                },
                payments = PaymentProviders.select(config, clock),
                email = config.email.resendApiKey?.let { ResendEmailSender(it, config.email.from) } ?: LogEmailSender(config.email.from),
                sms = with(config.sms) {
                    if (twilioAccountSid != null && twilioAuthToken != null && twilioFrom != null) {
                        TwilioSmsSender(twilioAccountSid, twilioAuthToken, twilioFrom)
                    } else {
                        NoopSmsSender()
                    }
                },
                modelClient = modelClient(config),
                storage = AssetStorages.fromConfig(config),
                stockImages = config.unsplashAccessKey?.let { UnsplashStockImages(it) } ?: DisabledStockImages,
                overageReporter = config.ai.overageMeterEvent?.let { event -> stripeGateway?.let { StripeAiOverageReporter(it, event) } },
                geocoder = config.geo.geocoder(),
                push = when (config.push.mode) {
                    PushMode.EXPO -> ExpoPushSender(config.push.expoAccessToken)
                    PushMode.LOG -> LogPushSender()
                    PushMode.OFF -> DisabledPushSender
                },
            )
        }

        /** The scripted fake (development only; AppConfig refuses it in production), else Anthropic, else none. */
        fun modelClient(config: AppConfig): ModelClient? = when {
            config.ai.fakeScript != null && config.isDevelopment -> ScriptedModelClient(FakeScript.load(config.ai.fakeScript))
            else -> AnthropicModelClient.fromConfig(config)
        }
    }
}

val BusinessIdAttribute = AttributeKey<String>("bookanything.businessId")

/** Resolves the signed-in user's access to `{businessId}` with at least [min] role. */
suspend fun ApplicationCall.businessAccess(ctx: AppContext, min: Role = Role.STAFF): BusinessAccess {
    val user = ctx.auth.requireUser(this)
    val businessId = pathUuid("businessId")
    attributes.put(BusinessIdAttribute, businessId.toString())
    return Memberships.require(ctx.db, user, businessId, min)
}

/**
 * [businessAccess] where `{businessId}` may also be the business's slug, for `GET /businesses/{idOrSlug}`: the
 * dashboard knows the slug from its URL before `/me` has said which business it is, and fetches both at once. Same
 * rules and answers: an unknown slug is 404 like a business the user isn't a member of. A value that parses as an id is
 * an id (slugs can't be UUID-shaped: [ReservedSlugs.problem]).
 */
suspend fun ApplicationCall.businessAccessByIdOrSlug(ctx: AppContext, min: Role = Role.STAFF): BusinessAccess {
    val user = ctx.auth.requireUser(this)
    val raw = parameters["businessId"]
    val slug = raw?.lowercase()?.takeIf { ReservedSlugs.problem(it) == null }
    val businessId = parseUuidOrNull(raw)
        ?: slug?.let { ctx.db.read { conn -> BusinessRepository.idBySlug(conn, it) } }
        ?: throw Errors.notFound("Business")
    attributes.put(BusinessIdAttribute, businessId.toString())
    return Memberships.require(ctx.db, user, businessId, min)
}
