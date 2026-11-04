package ie.bookanything.payments

import ie.bookanything.config.AppConfig

object PaymentProviders {
    /** STRIPE_SECRET_KEY → Stripe; else development → Dev; else none (docs/architecture.md section 7). */
    fun select(config: AppConfig, clock: java.time.Clock = java.time.Clock.systemUTC()): PaymentProvider = when {
        config.stripe.secretKey != null -> StripePaymentProvider(SdkStripeGateway(config.stripe.secretKey), config.stripe, clock)
        config.isDevelopment -> DevPaymentProvider(config.appBaseUrl)
        else -> NoPaymentProvider()
    }
}
