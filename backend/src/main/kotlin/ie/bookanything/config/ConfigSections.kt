package ie.bookanything.config

import ie.bookanything.ai.Effort
import ie.bookanything.ai.usage.AiAllowances
import ie.bookanything.ai.usage.CreditValue

// The sections of [AppConfig], each with its reader over [EnvReader].

data class DatabaseConfig(
    val jdbcUrl: String,
    val username: String?,
    val password: String?,
    val poolSize: Int,
    /** Longest a statement may run (Postgres `statement_timeout`); migrations are exempt. 0 turns it off. */
    val statementTimeoutSeconds: Int = DEFAULT_STATEMENT_TIMEOUT_SECONDS,
    /**
     * Longest a transaction may sit idle between statements (`idle_in_transaction_session_timeout`) before Postgres ends
     * the session, releasing its locks. Above the slowest Stripe call made inside a booking transaction. 0 turns it off.
     */
    val idleInTransactionTimeoutSeconds: Int = DEFAULT_IDLE_IN_TRANSACTION_TIMEOUT_SECONDS,
) {
    companion object {
        const val DEFAULT_URL = "jdbc:postgresql://localhost:5432/bookanything_dev"
        const val DEFAULT_STATEMENT_TIMEOUT_SECONDS = 60
        const val DEFAULT_IDLE_IN_TRANSACTION_TIMEOUT_SECONDS = 120

        fun fromEnvironment(env: EnvReader, dev: Boolean): DatabaseConfig {
            val parsed = env.str("DATABASE_URL")?.let(::parseUrl)
            return DatabaseConfig(
                jdbcUrl = parsed?.first ?: if (dev) DEFAULT_URL else throw ConfigException("DATABASE_URL is required in production."),
                username = env.str("DATABASE_USERNAME") ?: parsed?.second,
                password = env.str("DATABASE_PASSWORD") ?: parsed?.third,
                poolSize = env.int("DATABASE_POOL_SIZE", 10).coerceIn(2, 100),
                statementTimeoutSeconds = env.int("DATABASE_STATEMENT_TIMEOUT_SECONDS", DEFAULT_STATEMENT_TIMEOUT_SECONDS).coerceAtLeast(0),
                idleInTransactionTimeoutSeconds = env.int(
                    "DATABASE_IDLE_IN_TRANSACTION_TIMEOUT_SECONDS", DEFAULT_IDLE_IN_TRANSACTION_TIMEOUT_SECONDS,
                ).coerceAtLeast(0),
            )
        }

        /**
         * Accepts JDBC URLs and `postgres://user:pass@host:port/db` (Render/Fly style).
         * Returns (jdbcUrl, username?, password?).
         */
        fun parseUrl(raw: String): Triple<String, String?, String?> {
            if (raw.startsWith("jdbc:postgresql:")) return Triple(raw, null, null)
            if (!raw.startsWith("postgres://") && !raw.startsWith("postgresql://")) {
                throw ConfigException("DATABASE_URL must be a jdbc:postgresql: or postgres:// URL.")
            }
            val uri = try {
                java.net.URI(raw)
            } catch (_: java.net.URISyntaxException) {
                throw ConfigException("DATABASE_URL is not a valid URL.")
            }
            val userInfo = uri.rawUserInfo?.split(':', limit = 2)
            val decode = { v: String -> java.net.URLDecoder.decode(v, Charsets.UTF_8) }
            val port = if (uri.port > 0) ":${uri.port}" else ""
            val query = uri.rawQuery?.let { "?$it" }.orEmpty()
            return Triple(
                "jdbc:postgresql://${uri.host}$port${uri.rawPath}$query",
                userInfo?.getOrNull(0)?.let(decode),
                userInfo?.getOrNull(1)?.let(decode),
            )
        }
    }
}

data class ClerkConfig(
    val issuer: String?,
    val jwksUrl: String?,
    /** The web origins a session token's `azp` may name (`CLERK_AUTHORIZED_PARTIES`). */
    val authorizedParties: Set<String>,
    val webhookSecret: String?,
    /**
     * Whether a session token with no `azp` at all is accepted as the mobile app's (`CLERK_ACCEPT_NATIVE_SESSIONS`,
     * section 3.1). Clerk sets `azp` from the Origin of the request that minted the token; the native SDK sends none.
     * A token that has an `azp` is still checked against [authorizedParties].
     */
    val acceptNativeSessions: Boolean = false,
) {
    companion object {
        fun fromEnvironment(env: EnvReader): ClerkConfig {
            val issuer = env.str("CLERK_ISSUER")?.trimEnd('/')
            return ClerkConfig(
                issuer = issuer,
                jwksUrl = env.str("CLERK_JWKS_URL") ?: issuer?.let { "$it/.well-known/jwks.json" },
                authorizedParties = env.list("CLERK_AUTHORIZED_PARTIES") { it.trimEnd('/') }?.toSet().orEmpty(),
                webhookSecret = env.str("CLERK_WEBHOOK_SECRET"),
                acceptNativeSessions = env.bool("CLERK_ACCEPT_NATIVE_SESSIONS", false),
            )
        }
    }
}

data class StripeConfig(
    val secretKey: String?,
    val webhookSecret: String?,
    val connectWebhookSecret: String?,
    val pricePro: String?,
    val priceBusiness: String?,
) {
    companion object {
        fun fromEnvironment(env: EnvReader) = StripeConfig(
            secretKey = env.str("STRIPE_SECRET_KEY"),
            webhookSecret = env.str("STRIPE_WEBHOOK_SECRET"),
            connectWebhookSecret = env.str("STRIPE_CONNECT_WEBHOOK_SECRET"),
            pricePro = env.str("STRIPE_PRICE_PRO"),
            priceBusiness = env.str("STRIPE_PRICE_BUSINESS"),
        )
    }
}

/** Transactional email: through Resend with [resendApiKey], else logged (and recorded in `email_log`). */
data class EmailConfig(val resendApiKey: String? = null, val from: String = DEFAULT_FROM) {
    companion object {
        const val DEFAULT_FROM = "bookanything <bookings@bookanything.ie>"

        fun fromEnvironment(env: EnvReader) = EmailConfig(env.str("RESEND_API_KEY"), env.str("EMAIL_FROM") ?: DEFAULT_FROM)
    }
}

/** Where push notifications go (section 22): Expo's push service, the log (development), or nowhere. */
enum class PushMode { EXPO, LOG, OFF }

/**
 * Push notifications to the mobile app (`PUSH_NOTIFICATIONS`): [PushMode.LOG] by default in development (the flow runs up
 * to delivery and logs what it would send), [PushMode.OFF] otherwise, so nothing is sent unless configured.
 * [expoAccessToken] is Expo's "enhanced push security" access token, sent only when set.
 */
data class PushConfig(val mode: PushMode = PushMode.OFF, val expoAccessToken: String? = null) {
    companion object {
        fun fromEnvironment(env: EnvReader, dev: Boolean) = PushConfig(
            mode = env.choice(
                "PUSH_NOTIFICATIONS",
                mapOf(
                    null to if (dev) PushMode.LOG else PushMode.OFF,
                    "expo" to PushMode.EXPO, "log" to PushMode.LOG, "off" to PushMode.OFF,
                ),
                "PUSH_NOTIFICATIONS must be expo, log or off.",
            ),
            expoAccessToken = env.str("EXPO_ACCESS_TOKEN"),
        )
    }
}

/** SMS reminders through Twilio: all three settings are needed. */
data class SmsConfig(val twilioAccountSid: String? = null, val twilioAuthToken: String? = null, val twilioFrom: String? = null) {
    companion object {
        fun fromEnvironment(env: EnvReader) = SmsConfig(env.str("TWILIO_ACCOUNT_SID"), env.str("TWILIO_AUTH_TOKEN"), env.str("TWILIO_FROM"))
    }
}

/** S3-compatible object storage for uploaded images (section 15.7). */
data class S3Config(
    val bucket: String,
    val region: String,
    /** Custom endpoint (R2, MinIO, …); switches to path-style URLs. Null = AWS virtual-hosted style. */
    val endpoint: String?,
    val accessKeyId: String,
    val secretAccessKey: String,
    /** Public origin the stored objects are served from, e.g. a CDN or bucket domain. */
    val publicBaseUrl: String,
)

/** Where uploads go: S3 when configured, else a local directory, else nowhere (uploads off). */
data class StorageConfig(val s3: S3Config? = null, val localDir: String? = null) {
    companion object {
        const val DEV_LOCAL_DIR = ".data/uploads"
        val S3_KEYS = listOf("STORAGE_S3_BUCKET", "STORAGE_S3_ACCESS_KEY_ID", "STORAGE_S3_SECRET_ACCESS_KEY", "STORAGE_PUBLIC_BASE_URL")

        fun fromEnvironment(str: (String) -> String?, dev: Boolean): StorageConfig {
            val given = (S3_KEYS + listOf("STORAGE_S3_ENDPOINT", "STORAGE_S3_REGION")).filter { str(it) != null }
            val s3 = if (given.isEmpty()) {
                null
            } else {
                val missing = S3_KEYS.filter { str(it) == null }
                if (missing.isNotEmpty()) {
                    throw ConfigException(
                        "S3 storage is partially configured: set ${missing.joinToString(", ")} (or remove ${given.joinToString(", ")}).",
                    )
                }
                val endpoint = str("STORAGE_S3_ENDPOINT")?.trimEnd('/')?.also { requireHttpUrl("STORAGE_S3_ENDPOINT", it) }
                S3Config(
                    bucket = str("STORAGE_S3_BUCKET")!!,
                    region = str("STORAGE_S3_REGION") ?: "us-east-1",
                    endpoint = endpoint,
                    accessKeyId = str("STORAGE_S3_ACCESS_KEY_ID")!!,
                    secretAccessKey = str("STORAGE_S3_SECRET_ACCESS_KEY")!!,
                    publicBaseUrl = str("STORAGE_PUBLIC_BASE_URL")!!.trimEnd('/').also { requireHttpUrl("STORAGE_PUBLIC_BASE_URL", it) },
                )
            }
            return StorageConfig(s3 = s3, localDir = str("STORAGE_LOCAL_DIR") ?: if (dev) DEV_LOCAL_DIR else null)
        }

        private fun requireHttpUrl(key: String, value: String) {
            val ok = runCatching { java.net.URI(value) }.getOrNull()?.let {
                (it.scheme == "https" || it.scheme == "http") && !it.host.isNullOrEmpty()
            } ?: false
            if (!ok) throw ConfigException("$key must be an http(s) URL.")
        }
    }
}

/**
 * AI settings shared by every model feature (docs/architecture.md sections 16 and 17). Without [anthropicApiKey] there
 * is no model; [fakeScript] selects the scripted fake model (`demo` or a JSON file) and is refused in production.
 * What a credit is worth and each plan's monthly credits are deployment configuration: the defaults are placeholders
 * for development and tests, and production with a model refuses to start unless they are set.
 */
data class AiConfig(
    val anthropicApiKey: String? = null,
    /** Null = the default model. */
    val anthropicModel: String? = null,
    val fakeScript: String? = null,
    /** `AI_CREDIT_MICRO_CENTS`: model list-price cost per credit, in micro-cents. */
    val creditValue: CreditValue = CreditValue(DEV_CREDIT_MICRO_CENTS),
    val allowances: AiAllowances = AiAllowances(),
    /** Stripe Billing Meter event name for AI overage; null = the monthly allowance is a hard limit. */
    val overageMeterEvent: String? = null,
    /** Monthly cap on metered overage, in credits (so its cost scales with [creditValue]). */
    val overageMaxCredits: Long = 10_000,
    val pricesFile: String? = null,
    val assistantEffort: Effort = Effort.LOW,
) {
    init {
        // Limits are compared in micro-cents: the largest allowance plus the overage cap must fit in a Long.
        val largest = maxOf(allowances.free, allowances.pro, allowances.business)
        try {
            Math.addExact(creditValue.toMicroCents(largest), creditValue.toMicroCents(overageMaxCredits))
        } catch (_: ArithmeticException) {
            throw ConfigException("AI_CREDIT_MICRO_CENTS times the largest AI_CREDITS_* plus AI_OVERAGE_MAX_CREDITS is too large.")
        }
    }

    companion object {
        /** Placeholder credit value for development and tests; production sets `AI_CREDIT_MICRO_CENTS`. */
        const val DEV_CREDIT_MICRO_CENTS = 100_000L

        /** The credit settings production must set explicitly whenever a model is configured. */
        val CREDIT_SETTINGS = listOf("AI_CREDIT_MICRO_CENTS", "AI_CREDITS_FREE", "AI_CREDITS_PRO", "AI_CREDITS_BUSINESS")

        fun fromEnvironment(env: EnvReader, production: Boolean = false): AiConfig {
            val defaults = AiConfig()
            val apiKey = env.str("ANTHROPIC_API_KEY")
            if (production && apiKey != null) {
                val missing = CREDIT_SETTINGS.filter { env.str(it) == null }
                if (missing.isNotEmpty()) {
                    throw ConfigException(
                        "${missing.joinToString(", ")} must be set in production when ANTHROPIC_API_KEY is set " +
                            "(what an AI credit is worth and each plan's monthly credits).",
                    )
                }
            }
            val creditMicroCents = env.long("AI_CREDIT_MICRO_CENTS", defaults.creditValue.microCents)
            if (creditMicroCents <= 0) throw ConfigException("AI_CREDIT_MICRO_CENTS must be a whole number ≥ 1.")
            return AiConfig(
                anthropicApiKey = apiKey,
                anthropicModel = env.str("ANTHROPIC_MODEL"),
                fakeScript = env.str("AI_FAKE_SCRIPT"),
                creditValue = CreditValue(creditMicroCents),
                allowances = AiAllowances(
                    free = env.long("AI_CREDITS_FREE", defaults.allowances.free),
                    pro = env.long("AI_CREDITS_PRO", defaults.allowances.pro),
                    business = env.long("AI_CREDITS_BUSINESS", defaults.allowances.business),
                ),
                overageMeterEvent = env.str("AI_OVERAGE_METER_EVENT"),
                overageMaxCredits = env.long("AI_OVERAGE_MAX_CREDITS", defaults.overageMaxCredits),
                pricesFile = env.str("AI_PRICES_FILE"),
                assistantEffort = env.choice(
                    "ASSISTANT_EFFORT", mapOf(null to Effort.LOW, "low" to Effort.LOW, "medium" to Effort.MEDIUM, "high" to Effort.HIGH),
                    "ASSISTANT_EFFORT must be low, medium or high.",
                ),
            )
        }
    }
}
