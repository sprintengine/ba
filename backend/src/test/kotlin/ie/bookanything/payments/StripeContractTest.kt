package ie.bookanything.payments

import com.stripe.StripeClient
import com.stripe.exception.StripeException
import com.stripe.net.RequestOptions
import com.stripe.param.AccountCreateParams
import com.stripe.param.CustomerCreateParams
import com.stripe.param.PaymentIntentCreateParams
import com.stripe.param.PriceCreateParams
import com.stripe.param.PriceUpdateParams
import com.stripe.param.ProductUpdateParams
import com.stripe.param.RefundCreateParams
import com.stripe.param.SubscriptionCreateParams
import com.stripe.param.billingportal.ConfigurationListParams
import ie.bookanything.business.Plan
import ie.bookanything.config.StripeConfig
import ie.bookanything.http.ApiException
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assumptions.abort
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.TestInstance
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * [SdkStripeGateway] against Stripe's test mode: every call we make, with the parameters we build, the way Stripe
 * answers today (the fakes elsewhere only check what we send). Not part of `test`: run with
 * `./gradlew :backend:stripeContractTest` and `STRIPE_TEST_SECRET_KEY` (a test-mode key; a live key is refused).
 * Nightly in CI (`.github/workflows/stripe-contract.yml`). Setup: backend/README.md, "Stripe contract tests".
 */
@Tag("stripe-contract")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class StripeContractTest {
    private val key: String? = System.getenv("STRIPE_TEST_SECRET_KEY")?.takeIf { it.isNotBlank() }
    private lateinit var gateway: SdkStripeGateway
    private lateinit var stripe: StripeClient
    private val created = mutableListOf<String>()
    private val customers = mutableListOf<String>()

    @BeforeAll
    fun setUp() {
        assumeTrue(key != null, "STRIPE_TEST_SECRET_KEY is not set: the Stripe contract tests are skipped")
        check(key!!.startsWith("sk_test_") || key.startsWith("rk_test_")) { "STRIPE_TEST_SECRET_KEY must be a test-mode key" }
        gateway = SdkStripeGateway(key)
        stripe = StripeClient(key)
    }

    @AfterAll
    fun cleanUp() {
        if (key == null) return
        created.forEach { id -> cleanUp("account $id") { stripe.v1().accounts().delete(id) } }
        customers.forEach { id -> cleanUp("customer $id") { stripe.v1().customers().delete(id) } }
    }

    /** Cleaning up is best effort, but a failure is said (it leaves test data behind). */
    private fun cleanUp(what: String, action: () -> Unit) {
        runCatching(action).onFailure { System.err.println("Stripe contract test: couldn't clean up $what: ${it.message}") }
    }

    private fun business(country: String = "IE", currency: String = "EUR") = sampleBusiness().copy(
        id = UUID.randomUUID(), country = country, currency = currency, contactEmail = "contract@example.com",
    )

    @Test
    fun `a connected account is created with Standard-like controller settings and onboarded by an Account Link`() {
        val provider = StripePaymentProvider(gateway, StripeConfig(key, null, null, null, null))
        val business = business()
        val link = provider.createConnectLink(business, "https://example.com/dashboard/x/settings/payments")
        val account = assertNotNull(link.accountId).also(created::add)
        assertTrue(link.url.startsWith("https://connect.stripe.com/"), link.url)

        // The same idempotency key gives the same account (two first clicks at once).
        assertEquals(account, provider.createConnectLink(business, "https://example.com/r").accountId)

        val state = gateway.retrieveAccount(account)
        assertEquals("IE", state.country)
        assertEquals("eur", state.defaultCurrency)
        assertFalse(state.chargesEnabled, "not onboarded yet")
        val controller = stripe.v1().accounts().retrieve(account).controller
        assertEquals("account", controller.fees.payer)
        assertEquals("stripe", controller.requirementCollection)
        assertEquals("full", controller.stripeDashboard.type)
    }

    @Test
    fun `OAuth errors are told apart`() {
        val refused = runCatching { gateway.exchangeOAuthCode("ac_not_a_real_code") }.exceptionOrNull()
        assertEquals("invalid_grant", (refused as? StripeOAuthError)?.code, refused.toString())
        // Deauthorizing what isn't connected is "not connected", not an error.
        // (An unset secret reaches the workflow's environment as an empty string.)
        val clientId = System.getenv("STRIPE_TEST_CONNECT_CLIENT_ID")?.takeIf { it.isNotBlank() } ?: "ca_unknown"
        assertFalse(gateway.deauthorizeAccount(clientId, "acct_1Nope"))
    }

    @Test
    fun `plan billing makes a customer, a subscription checkout and the portal`() {
        val price = testPrice()
        try {
            val provider = StripePaymentProvider(gateway, StripeConfig(key, null, null, price, price))
            val business = business()
            val session = provider.createBillingCheckout(business, Plan.PRO, "https://example.com/dashboard/x/settings/billing", null)
            val customer = assertNotNull(session.customerId).also(customers::add)
            assertTrue(session.url.startsWith("https://checkout.stripe.com/"), session.url)
            val configured = stripe.v1().billingPortal().configurations()
                .list(ConfigurationListParams.builder().setIsDefault(true).build()).data.isNotEmpty()
            if (!configured) abort<Unit>("The customer portal isn't configured in this test account")
            val portal = provider.createBillingPortal(business.copy(stripeCustomerId = customer), "https://example.com/b")
            assertTrue(portal.startsWith("https://billing.stripe.com/"), portal)
        } finally {
            archive(price)
        }
    }

    @Test
    fun `on an account that can take payments a checkout is created and expired, and a payment is refunded`() {
        val account = paymentsAccount()
        val business = business(country = "US", currency = "USD").copy(stripeAccountId = account, stripeChargesEnabled = true)
        val provider = StripePaymentProvider(gateway, StripeConfig(key, null, null, null, null), Clock.systemUTC())
        val request = CheckoutRequest(
            UUID.randomUUID(), UUID.randomUUID(), business, 1500, "USD", "Contract test · Sample", "guest@example.com",
            Instant.now().plus(Duration.ofMinutes(31)), "https://example.com/manage/t?payment=succeeded",
            "https://example.com/manage/t?payment=cancelled",
        )
        val session = provider.createCheckout(request)
        assertTrue(session.url.startsWith("https://checkout.stripe.com/"), session.url)
        val options = RequestOptions.builder().setStripeAccount(account).build()
        assertEquals("open", gateway.retrieveCheckoutSession(session.providerRef, options).status)
        assertFalse(provider.expireCheckout(business, session.providerRef, account), "not paid")
        assertEquals("expired", gateway.retrieveCheckoutSession(session.providerRef, options).status)

        // A card payment confirmed server-side (no browser), then refunded through the gateway as our refunds are.
        val intent = stripe.v1().paymentIntents().create(
            PaymentIntentCreateParams.builder().setAmount(2000L).setCurrency("usd").setPaymentMethod("pm_card_visa")
                .addPaymentMethodType("card").setConfirm(true).build(),
            options,
        )
        assertEquals("succeeded", intent.status)
        val refundId = UUID.randomUUID()
        val result = provider.refund(RefundRequest(refundId, business, intent.id, 500, "USD", account))
        assertEquals(RefundOutcome.SUCCEEDED, result.outcome)
        // Sent again (a retry after a timeout): the same refund, not a second one.
        assertEquals(result.providerRef, provider.refund(RefundRequest(refundId, business, intent.id, 500, "USD", account)).providerRef)
        val refunded = stripe.v1().paymentIntents().retrieve(intent.id, options)
        assertEquals(500L, stripe.v1().charges().retrieve(refunded.latestCharge, options).amountRefunded)

        // A refund for more than is left is refused for good, not retried.
        val tooMuch = runCatching {
            gateway.createRefund(RefundCreateParams.builder().setPaymentIntent(intent.id).setAmount(5000L).build(), options)
        }.exceptionOrNull()
        assertTrue(tooMuch is StripeRefusedException, tooMuch.toString())
    }

    @Test
    fun `platform subscriptions are read as they are, and a duplicate is cancelled and refunded`() {
        assertEquals(null, gateway.retrieveSubscription("sub_does_not_exist"), "Stripe has none by that id")
        val price = testPrice()
        try {
            val customer = stripe.v1().customers().create(
                CustomerCreateParams.builder().setPaymentMethod("pm_card_visa")
                    .setInvoiceSettings(CustomerCreateParams.InvoiceSettings.builder().setDefaultPaymentMethod("pm_card_visa").build())
                    .build(),
            ).id.also(customers::add)
            val created = stripe.v1().subscriptions().create(
                SubscriptionCreateParams.builder().setCustomer(customer)
                    .addItem(SubscriptionCreateParams.Item.builder().setPrice(price).build())
                    .putMetadata("plan", "pro")
                    .build(),
            )
            val sub = assertNotNull(gateway.retrieveSubscription(created.id))
            assertEquals(
                listOf("active", customer, listOf(price), "pro"), listOf(sub.status, sub.customer, sub.priceIds, sub.metadata["plan"]),
            )
            val paid = gateway.invoicePayments(assertNotNull(sub.latestInvoice))
            assertEquals(listOf(100L), paid.map { it.amountPaid })

            val provider = StripePaymentProvider(gateway, StripeConfig(key, null, null, price, price))
            assertTrue(provider.cancelDuplicateSubscription(created.id))
            assertEquals("canceled", gateway.retrieveSubscription(created.id)!!.status)
            val refunded = provider.refundDuplicateSubscription(created.id, sub.latestInvoice, lastAttempt = false)
            assertEquals(DuplicateCancel(cancelled = true, refunded = mapOf("EUR" to 100L)), refunded)
            // Again (a retried job): nothing is refunded twice (idempotency keys, or refused as refunded already).
            assertEquals(refunded, provider.refundDuplicateSubscription(created.id, sub.latestInvoice, lastAttempt = false))
            val charge = stripe.v1().paymentIntents().retrieve(paid.single().paymentIntent).latestCharge
            assertEquals(100L, stripe.v1().charges().retrieve(charge).amountRefunded)
        } finally {
            archive(price)
        }
    }

    @Test
    fun `a simulation account in Ireland is enabled from Stripe's test values, takes a payment and a refund, and is deleted`() {
        val accounts = SimulationStripeAccounts(gateway)
        val business = business().copy(slug = "sim-contract", name = "Sim Business contract")
        val account = try {
            accounts.create(business).also(created::add)
        } catch (e: ApiException) {
            // The platform can't create platform-controlled accounts here (its Connect profile, or its country).
            abort("Can't create a simulation account here: ${e.message}")
        }
        // Idempotent: the same request again is the same account.
        assertEquals(account, accounts.create(business))
        var state = accounts.state(account)
        repeat(ENABLE_POLLS) {
            if (state.chargesEnabled) return@repeat
            Thread.sleep(ENABLE_POLL_MS)
            state = accounts.state(account)
        }
        assertTrue(state.chargesEnabled, "Stripe didn't enable charges; still due: ${state.requirementsDue} (${state.disabledReason})")
        assertTrue(SimulationStripeAccounts.isOurs(state, business.id), state.metadata.toString())
        assertEquals("IE" to "eur", state.country to state.defaultCurrency)

        val options = RequestOptions.builder().setStripeAccount(account).build()
        val intent = stripe.v1().paymentIntents().create(
            PaymentIntentCreateParams.builder().setAmount(2000L).setCurrency("eur").setPaymentMethod("pm_card_visa")
                .addPaymentMethodType("card").setConfirm(true).build(),
            options,
        )
        assertEquals("succeeded", intent.status)
        val provider = StripePaymentProvider(gateway, StripeConfig(key, null, null, null, null), Clock.systemUTC())
        val connected = business.copy(stripeAccountId = account, stripeChargesEnabled = true)
        val refund = provider.refund(RefundRequest(UUID.randomUUID(), connected, intent.id, 2000, "EUR", account))
        assertTrue(refund.succeeded, refund.toString())

        // Not deleted for another business; deleted for its own.
        assertEquals(SimulationStripeAccounts.Deleted.NOT_OURS, accounts.deleteIfOurs(account, UUID.randomUUID()))
        assertEquals(SimulationStripeAccounts.Deleted.DELETED, accounts.deleteIfOurs(account, business.id))
        created.remove(account)
    }

    private fun testPrice(): String = stripe.v1().prices().create(
        PriceCreateParams.builder().setCurrency("eur").setUnitAmount(100L)
            .setRecurring(PriceCreateParams.Recurring.builder().setInterval(PriceCreateParams.Recurring.Interval.MONTH).build())
            .setProductData(PriceCreateParams.ProductData.builder().setName("bookanything contract test plan").build())
            .build(),
    ).id

    /** Archives [price] and the product made with it. */
    private fun archive(price: String) {
        cleanUp("price $price") {
            val product = stripe.v1().prices().update(price, PriceUpdateParams.builder().setActive(false).build()).product
            stripe.v1().products().update(product, ProductUpdateParams.builder().setActive(false).build())
        }
    }

    /**
     * A test account that can take card payments: `STRIPE_TEST_CONNECTED_ACCOUNT` when set (onboarded once with
     * Stripe's test data), else one made here with Stripe's verification test values; skipped when Stripe doesn't
     * enable it within a minute.
     */
    private fun paymentsAccount(): String {
        System.getenv("STRIPE_TEST_CONNECTED_ACCOUNT")?.takeIf { it.isNotBlank() }?.let { return it }
        val now = Instant.now().epochSecond
        val account = try {
            createPaymentsAccount(now)
        } catch (e: StripeException) {
            // The platform's Connect profile isn't complete (its responsibilities for losses), or its country can't
            // create this one.
            abort("Can't create a test connected account here (${e.code}); set STRIPE_TEST_CONNECTED_ACCOUNT")
        }
        repeat(ENABLE_POLLS) {
            if (gateway.retrieveAccount(account).chargesEnabled) return account
            Thread.sleep(ENABLE_POLL_MS)
        }
        return abort("Stripe didn't enable charges on the test account in time; set STRIPE_TEST_CONNECTED_ACCOUNT")
    }

    private fun createPaymentsAccount(now: Long): String = stripe.v1().accounts().create(
        AccountCreateParams.builder()
            .setCountry("US").setEmail("contract@example.com")
            .setController(platformController())
            .setCapabilities(
                AccountCreateParams.Capabilities.builder()
                    .setCardPayments(AccountCreateParams.Capabilities.CardPayments.builder().setRequested(true).build())
                    .setTransfers(AccountCreateParams.Capabilities.Transfers.builder().setRequested(true).build())
                    .build(),
            )
            .setBusinessType(AccountCreateParams.BusinessType.INDIVIDUAL)
            .setBusinessProfile(AccountCreateParams.BusinessProfile.builder().setMcc("7299").setUrl("https://example.com").build())
            .setIndividual(
                AccountCreateParams.Individual.builder()
                    .setFirstName("Contract").setLastName("Test").setEmail("contract@example.com").setPhone("+15555550100")
                    .setIdNumber("000000000").setSsnLast4("0000")
                    .setDob(AccountCreateParams.Individual.Dob.builder().setDay(1L).setMonth(1L).setYear(1901L).build())
                    .setAddress(
                        AccountCreateParams.Individual.Address.builder().setLine1("address_full_match").setCity("San Francisco")
                            .setState("CA").setPostalCode("94103").setCountry("US").build(),
                    )
                    .build(),
            )
            .setExternalAccount("btok_us_verified")
            .setTosAcceptance(AccountCreateParams.TosAcceptance.builder().setDate(now).setIp("203.0.113.10").build())
            .build(),
    ).id.also(created::add)

    /** An account the platform onboards itself (so its test requirements can be filled in by API). */
    private fun platformController(): AccountCreateParams.Controller {
        val c = AccountCreateParams.Controller.builder()
        val fees = AccountCreateParams.Controller.Fees.Payer.APPLICATION
        c.setFees(AccountCreateParams.Controller.Fees.builder().setPayer(fees).build())
        c.setLosses(
            AccountCreateParams.Controller.Losses.builder().setPayments(AccountCreateParams.Controller.Losses.Payments.APPLICATION).build(),
        )
        c.setRequirementCollection(AccountCreateParams.Controller.RequirementCollection.APPLICATION)
        val dashboard = AccountCreateParams.Controller.StripeDashboard.Type.NONE
        c.setStripeDashboard(AccountCreateParams.Controller.StripeDashboard.builder().setType(dashboard).build())
        return c.build()
    }

    private companion object {
        const val ENABLE_POLLS = 30
        const val ENABLE_POLL_MS = 2_000L
    }
}
