package ie.bookanything

import ie.bookanything.config.AppConfig
import ie.bookanything.config.PushConfig
import ie.bookanything.config.PushMode
import ie.bookanything.config.StripeConfig
import ie.bookanything.support.TestConfig
import kotlin.test.Test
import kotlin.test.assertEquals

class ConfigWarningsTest {
    @Test
    fun `half-configured Stripe and Clerk are warned about`() {
        assertEquals(emptyList(), configWarnings(TestConfig.config(), "dev"))
        val stripe = TestConfig.config(stripe = StripeConfig("sk_test", null, null, "price_pro", null))
        assertEquals(
            listOf(
                "STRIPE_SECRET_KEY is set but no STRIPE_WEBHOOK_SECRET / STRIPE_CONNECT_WEBHOOK_SECRET: payments will never be confirmed",
                "STRIPE_PRICE_PRO / STRIPE_PRICE_BUSINESS not set: plan checkout is unavailable",
                "STRIPE_CONNECT_CLIENT_ID not set: owners can only create a new Stripe account, not connect one they have",
            ),
            configWarnings(stripe, "stripe"),
        )
        val badClientId = TestConfig.config(
            stripe = StripeConfig("sk_test", "whsec", null, "price_pro", "price_business", connectClientId = "sk_test_oops"),
        )
        assertEquals(
            listOf("STRIPE_CONNECT_CLIENT_ID is not a Connect client id (ca_...): owners can't connect an existing Stripe account"),
            configWarnings(badClientId, "stripe"),
        )
        val production = AppConfig.fromEnvironment(
            mapOf(
                "DATABASE_URL" to "jdbc:postgresql://localhost/x", "TOKEN_SECRET" to "a-very-long-production-secret",
                "CLERK_ISSUER" to "https://x.clerk.accounts.dev", "CLERK_AUTHORIZED_PARTIES" to "https://bookanything.ie",
            ),
        )
        assertEquals(listOf("CLERK_WEBHOOK_SECRET not set: deleted Clerk users are not anonymised"), configWarnings(production, "dev"))
        val pushOff = TestConfig.config().copy(push = PushConfig(PushMode.OFF, expoAccessToken = "expo-token"))
        assertEquals(
            listOf("EXPO_ACCESS_TOKEN is set but PUSH_NOTIFICATIONS is not expo: push notifications are not sent"),
            configWarnings(pushOff, "dev"),
        )
        assertEquals(emptyList(), configWarnings(pushOff.copy(push = PushConfig(PushMode.EXPO, "expo-token")), "dev"))
    }

    @Test
    fun `Bo switched on without a model is warned about`() {
        assertEquals(
            listOf("ASSISTANT_ENABLED is on but no AI model is configured (ANTHROPIC_API_KEY): Bo stays hidden"),
            configWarnings(TestConfig.config(assistant = true), "dev", aiModel = false),
        )
        assertEquals(emptyList(), configWarnings(TestConfig.config(assistant = true), "dev", aiModel = true))
        assertEquals(emptyList(), configWarnings(TestConfig.config(assistant = false), "dev", aiModel = false))
    }
}
