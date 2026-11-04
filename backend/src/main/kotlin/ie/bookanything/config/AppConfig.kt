package ie.bookanything.config

import ie.bookanything.geo.GeoConfig
import ie.bookanything.http.Cidr
import ie.bookanything.oauth.OAuthConfig

/**
 * Backend configuration, read from environment variables (docs/architecture.md section 10).
 * Construction validates combinations that must never reach production (dev auth, dev payments).
 */
enum class AppEnv { DEVELOPMENT, STAGING, PRODUCTION, TEST;

    /**
     * Production rules apply: no dev auth, dev payments, demo seed, fake model or rate-limit multiplier, and the
     * production settings are required. Staging is production in every check; it only has its own name, for logs,
     * error tracking and staging-only test features that may key off it later.
     */
    val isProductionLike: Boolean get() = this == PRODUCTION || this == STAGING

    /** The name logs and error tracking tag events with (`development`, `staging`, `production`, `test`). */
    val wire: String get() = name.lowercase()

    companion object {
        /**
         * Reads APP_ENV. A missing value means production (fail closed): development turns on dev auth, the dev
         * payment provider and a default token secret, so it must be asked for explicitly. TEST is only constructed
         * by the in-process test harness, never read from the environment.
         */
        fun parse(raw: String?): AppEnv = when (raw?.trim()?.lowercase()) {
            null, "", "production", "prod" -> PRODUCTION
            "staging" -> STAGING
            "development", "dev" -> DEVELOPMENT
            else -> throw ConfigException("APP_ENV must be development, staging or production (got '$raw').")
        }
    }
}

enum class AuthMode { CLERK, DEV }

class ConfigException(message: String) : RuntimeException(message)

data class AppConfig(
    val env: AppEnv,
    val host: String,
    val port: Int,
    val appBaseUrl: String,
    val database: DatabaseConfig,
    val runMigrationsOnStart: Boolean,
    val authMode: AuthMode,
    val clerk: ClerkConfig,
    val stripe: StripeConfig,
    val trustForwardedFor: Boolean,
    val jobsEnabled: Boolean,
    val corsAllowedOrigins: List<String>,
    /** HMAC secret used to derive booking manage tokens and invitation tokens. */
    val tokenSecret: String,
    val rateLimitsEnabled: Boolean = true,
    /**
     * Development only: every rate limit allows this many times its requests, so an end-to-end suite that books through one
     * address can run repeatedly while the limiter itself stays on. Refused in production.
     */
    val rateLimitMultiplier: Int = 1,
    /**
     * Proxies whose X-Forwarded-For entries are trusted (IPs or CIDRs). Default: loopback and
     * private ranges. Only used when [trustForwardedFor] is on.
     */
    val trustedProxies: List<String> = DEFAULT_TRUSTED_PROXIES,
    /**
     * When set, the number of proxy hops in front of the API (e.g. 2 for "platform load balancer
     * + Next.js"). Takes precedence over [trustedProxies] for picking the client address.
     */
    val trustedProxyHops: Int? = null,
    /**
     * A header a trusted proxy sets to the client address, one address, overwritten on every request (`CF-Connecting-IP`
     * behind Cloudflare). Takes precedence over `X-Forwarded-For` when present on a request from a trusted proxy.
     */
    val clientIpHeader: String? = null,
    /** Unsplash API access key for stock photos in the site editor; null = stock photos off. */
    val unsplashAccessKey: String? = null,
    /**
     * Business websites and the site builder (section 15). Off by default: we sell booking, not websites, so
     * `/{slug}` is the booking portal and the site routes answer 404. Kept behind this switch rather than deleted.
     */
    val sitesEnabled: Boolean = false,
    /**
     * Bo, the business assistant (section 17). Off by default: owners who want AI connect their own assistant to the
     * business MCP (section 20.7), which stays on either way. When off the `/assistant…` routes answer 404, nudges are
     * not refreshed and nothing is metered for Bo. Kept behind this switch rather than deleted.
     */
    val assistantEnabled: Boolean = false,
    val email: EmailConfig = EmailConfig(),
    val sms: SmsConfig = SmsConfig(),
    /** Push notifications to the mobile app (section 22). */
    val push: PushConfig = PushConfig(),
    val storage: StorageConfig = StorageConfig(),
    val ai: AiConfig = AiConfig(),
    /** Geocoding for the marketplace (section 18). */
    val geo: GeoConfig = GeoConfig(),
    /**
     * OAuth authorization server and the MCP resource URLs (section 20); defaults derive from [appBaseUrl], with the
     * business MCP on.
     */
    val oauth: OAuthConfig = OAuthConfig.fromEnvironment({ null }, appBaseUrl),
    /**
     * The build running (`APP_VERSION`): the release train names the image for the nightly that built it, e.g.
     * `0.4.0-nightly.20261104.17`, and never rebuilds it to stage or release it; `dev` otherwise. `/v1/health` reports
     * it, so a deploy and the monitor can tell which build answers.
     */
    val version: String = DEV_VERSION,
) {
    val isDevelopment: Boolean get() = env == AppEnv.DEVELOPMENT || env == AppEnv.TEST

    /** Production or staging: every production rule applies (see [AppEnv.isProductionLike]). */
    val isProduction: Boolean get() = env.isProductionLike

    /** The frontend URLs we hand out and the origins we may redirect to. */
    val urls: AppUrls get() = AppUrls(appBaseUrl, corsAllowedOrigins)

    init {
        if (authMode == AuthMode.DEV && env != AppEnv.DEVELOPMENT && env != AppEnv.TEST) {
            throw ConfigException("AUTH_MODE=dev is refused unless APP_ENV=development.")
        }
        if (authMode == AuthMode.CLERK && clerk.issuer.isNullOrBlank()) {
            throw ConfigException("CLERK_ISSUER is required when AUTH_MODE=clerk.")
        }
        if (isProduction && authMode == AuthMode.CLERK && clerk.authorizedParties.isEmpty()) {
            throw ConfigException("CLERK_AUTHORIZED_PARTIES is required in production (the app origins allowed in the token's azp claim).")
        }
        if (isProduction && tokenSecret == DEV_TOKEN_SECRET) {
            throw ConfigException("TOKEN_SECRET must be set in production.")
        }
        if (ai.fakeScript != null && isProduction) {
            throw ConfigException("AI_FAKE_SCRIPT is refused unless APP_ENV=development.")
        }
        if (rateLimitMultiplier != 1 && !isDevelopment) {
            throw ConfigException("RATE_LIMIT_MULTIPLIER is refused unless APP_ENV=development.")
        }
        if (rateLimitMultiplier !in 1..MAX_RATE_LIMIT_MULTIPLIER) {
            throw ConfigException("RATE_LIMIT_MULTIPLIER must be between 1 and $MAX_RATE_LIMIT_MULTIPLIER.")
        }
        if (tokenSecret.length < 16) {
            throw ConfigException("TOKEN_SECRET must be at least 16 characters.")
        }
    }

    companion object {
        const val DEV_TOKEN_SECRET = "dev-only-token-secret-change-me"
        const val DEV_VERSION = "dev"
        const val MAX_RATE_LIMIT_MULTIPLIER = 1000
        val DEFAULT_TRUSTED_PROXIES = listOf("127.0.0.0/8", "::1/128", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "fc00::/7")

        fun fromEnvironment(environment: Map<String, String> = System.getenv()): AppConfig {
            val env = EnvReader(environment)
            val appEnv = AppEnv.parse(env.str("APP_ENV"))
            // Only an explicit development environment gets development defaults (TEST is never read from the environment).
            val dev = appEnv == AppEnv.DEVELOPMENT
            val authMode = authMode(env, dev)
            val database = DatabaseConfig.fromEnvironment(env, dev)
            val appBaseUrl = (env.str("APP_BASE_URL") ?: "http://localhost:3000").trimEnd('/')
            return AppConfig(
                env = appEnv,
                host = env.str("APP_HOST") ?: "0.0.0.0",
                port = env.int("PORT", 8080),
                appBaseUrl = appBaseUrl,
                database = database,
                runMigrationsOnStart = env.bool("RUN_MIGRATIONS_ON_START", dev),
                authMode = authMode,
                clerk = ClerkConfig.fromEnvironment(env),
                stripe = StripeConfig.fromEnvironment(env),
                trustForwardedFor = env.bool("TRUST_FORWARDED_FOR", false),
                jobsEnabled = env.bool("JOBS_ENABLED", true),
                corsAllowedOrigins = env.list("CORS_ALLOWED_ORIGINS") { it.trimEnd('/') }.orEmpty(),
                tokenSecret = env.str("TOKEN_SECRET")
                    ?: if (dev) DEV_TOKEN_SECRET else throw ConfigException("TOKEN_SECRET is required in production."),
                rateLimitsEnabled = env.bool("RATE_LIMITS_ENABLED", true),
                rateLimitMultiplier = env.int("RATE_LIMIT_MULTIPLIER", 1),
                trustedProxies = trustedProxies(env),
                trustedProxyHops = trustedProxyHops(env),
                clientIpHeader = clientIpHeader(env),
                unsplashAccessKey = env.str("UNSPLASH_ACCESS_KEY"),
                sitesEnabled = env.bool("SITES_ENABLED", false),
                assistantEnabled = env.bool("ASSISTANT_ENABLED", false),
                email = EmailConfig.fromEnvironment(env),
                sms = SmsConfig.fromEnvironment(env),
                push = PushConfig.fromEnvironment(env, dev),
                storage = StorageConfig.fromEnvironment(env::str, dev),
                ai = AiConfig.fromEnvironment(env, production = !dev),
                geo = GeoConfig.fromEnvironment(env::str),
                oauth = OAuthConfig.fromEnvironment(env::str, appBaseUrl),
                version = env.str("APP_VERSION") ?: DEV_VERSION,
            )
        }

        /** Dev auth by default in development without a Clerk issuer; Clerk otherwise. */
        private fun authMode(env: EnvReader, dev: Boolean): AuthMode = env.choice(
            "AUTH_MODE",
            mapOf(
                null to if (dev && env.str("CLERK_ISSUER") == null) AuthMode.DEV else AuthMode.CLERK,
                "clerk" to AuthMode.CLERK, "dev" to AuthMode.DEV,
            ),
            "AUTH_MODE must be clerk or dev.",
        )

        private fun trustedProxies(env: EnvReader): List<String> {
            val proxies = env.list("TRUSTED_PROXIES") ?: return DEFAULT_TRUSTED_PROXIES
            proxies.firstOrNull { Cidr.parse(it) == null }?.let { throw ConfigException("TRUSTED_PROXIES has an invalid entry '$it'.") }
            return proxies
        }

        private val HEADER_NAME = Regex("^[A-Za-z0-9-]{1,64}$")

        private fun clientIpHeader(env: EnvReader): String? = env.str("CLIENT_IP_HEADER")?.let { name ->
            name.takeIf { HEADER_NAME.matches(it) }
                ?: throw ConfigException("CLIENT_IP_HEADER must be a header name, e.g. CF-Connecting-IP.")
        }

        private fun trustedProxyHops(env: EnvReader): Int? = env.str("TRUSTED_PROXY_HOPS")?.let { raw ->
            raw.toIntOrNull()?.takeIf { it in 1..10 } ?: throw ConfigException("TRUSTED_PROXY_HOPS must be an integer between 1 and 10.")
        }
    }
}
