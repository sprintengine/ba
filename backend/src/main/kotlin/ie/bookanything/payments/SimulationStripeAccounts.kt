package ie.bookanything.payments

import com.stripe.net.RequestOptions
import com.stripe.param.AccountCreateParams
import ie.bookanything.business.BusinessRow
import ie.bookanything.http.ApiException
import ie.bookanything.http.Errors
import kotlinx.serialization.Serializable
import org.slf4j.LoggerFactory
import java.util.UUID

/** A simulation business's test account: ready once [chargesEnabled]; until then, what Stripe still needs. */
@Serializable
data class SimulationAccountDto(
    val accountId: String,
    val chargesEnabled: Boolean,
    val detailsSubmitted: Boolean,
    val requirementsDue: List<String> = emptyList(),
    val disabledReason: String? = null,
)

/**
 * Stripe test-mode accounts for the reliability simulation's businesses on staging (docs/simulation.md, "Payments on
 * staging"), so they can take test payments end to end. Built only on a test key ([isTestKey]); used only through
 * `POST /businesses/{id}/payments/simulation-account` (staging, a simulation sign-in, a simulation business:
 * [simulationPaymentRoutes]) and the purge.
 *
 * Unlike the accounts owners get ([StripePaymentProvider.accountParams]), these are **platform-controlled**: the
 * platform collects their requirements (no Stripe-hosted onboarding, no dashboard), so they are filled in here with
 * Stripe's verification test values and Stripe enables charges within about a minute. Each is marked in its metadata
 * ([MARKER] and the business id), and nothing deletes an account that isn't marked so for that business.
 */
class SimulationStripeAccounts(private val gateway: StripeGateway) {
    private val log = LoggerFactory.getLogger(SimulationStripeAccounts::class.java)

    /**
     * Creates the business's test account. Idempotent per business and account generation (two calls at once, or a
     * retry after a timeout, get the same account): the parameters are the same each time. Stripe refusing it (the
     * platform's Connect profile isn't complete, say) is answered as payments not configured, with Stripe's code.
     */
    fun create(business: BusinessRow): String {
        val params = params(business)
        return try {
            gateway.createAccount(params, RequestOptions.builder().setIdempotencyKey(idempotencyKey(business)).build())
        } catch (@Suppress("SwallowedException") e: StripeRefusedException) {
            // The gateway logged Stripe's answer; its code goes in the message.
            throw Errors.paymentsNotConfigured(
                "Stripe refused to create a simulation account (${e.stripeCode ?: "no code"}): check the platform's Connect " +
                    "settings in test mode (docs/simulation.md, \"Payments on staging\").",
            )
        }
    }

    fun state(accountId: String): StripeAccountState = gateway.retrieveAccount(accountId)

    /** How deleting a business's account went. */
    enum class Deleted { DELETED, GONE, NOT_OURS, FAILED }

    /**
     * Deletes [accountId] at Stripe if it is the simulation's account for [businessId] (its metadata says so); best
     * effort: a failure is logged and reported, never thrown.
     */
    fun deleteIfOurs(accountId: String, businessId: UUID): Deleted = try {
        val state = gateway.retrieveAccount(accountId)
        if (!isOurs(state, businessId)) {
            log.warn("simulation purge: Stripe account {} of business {} isn't a simulation account; left as it is", accountId, businessId)
            Deleted.NOT_OURS
        } else if (gateway.deleteAccount(accountId)) {
            Deleted.DELETED
        } else {
            Deleted.GONE
        }
    } catch (e: StripeRefusedException) {
        if (e.stripeCode == "resource_missing") {
            Deleted.GONE
        } else {
            log.warn("simulation purge: Stripe refused to delete account {} ({})", accountId, e.stripeCode)
            Deleted.FAILED
        }
    } catch (e: ApiException) {
        log.warn("simulation purge: couldn't delete Stripe account {}: {}", accountId, e.message)
        Deleted.FAILED
    }

    /**
     * A platform-controlled test account for [business], filled in with Stripe's verification test values: an
     * individual (date of birth 1901-01-01, address `address_full_match`), a test bank account, terms accepted when the
     * business was created (a fixed time, so a retry sends exactly the same request). Public so tests can assert it.
     */
    fun params(business: BusinessRow): AccountCreateParams {
        val country = business.country.uppercase()
        val test = TEST_DATA[country] ?: throw Errors.conflict(
            "Simulation Stripe accounts are only made for businesses in ${TEST_DATA.keys.sorted().joinToString(" or ")}.",
        )
        return AccountCreateParams.builder()
            .setCountry(country)
            .setDefaultCurrency(test.currency)
            .setEmail(EMAIL)
            .setController(
                AccountCreateParams.Controller.builder()
                    .setFees(
                        AccountCreateParams.Controller.Fees.builder()
                            .setPayer(AccountCreateParams.Controller.Fees.Payer.APPLICATION).build(),
                    )
                    .setLosses(
                        AccountCreateParams.Controller.Losses.builder()
                            .setPayments(AccountCreateParams.Controller.Losses.Payments.APPLICATION).build(),
                    )
                    .setRequirementCollection(AccountCreateParams.Controller.RequirementCollection.APPLICATION)
                    .setStripeDashboard(
                        AccountCreateParams.Controller.StripeDashboard.builder()
                            .setType(AccountCreateParams.Controller.StripeDashboard.Type.NONE).build(),
                    )
                    .build(),
            )
            .setCapabilities(
                AccountCreateParams.Capabilities.builder()
                    .setCardPayments(AccountCreateParams.Capabilities.CardPayments.builder().setRequested(true).build())
                    .setTransfers(AccountCreateParams.Capabilities.Transfers.builder().setRequested(true).build())
                    .build(),
            )
            .setBusinessType(AccountCreateParams.BusinessType.INDIVIDUAL)
            .setBusinessProfile(
                AccountCreateParams.BusinessProfile.builder().setName(business.name.take(NAME_MAX)).setMcc(MCC).setUrl(TEST_URL).build(),
            )
            .setIndividual(
                AccountCreateParams.Individual.builder()
                    .setFirstName("Simulation").setLastName("Owner").setEmail(EMAIL).setPhone(test.phone)
                    .apply { test.idNumber?.let { setIdNumber(it) } }
                    .apply { test.ssnLast4?.let { setSsnLast4(it) } }
                    .setDob(AccountCreateParams.Individual.Dob.builder().setDay(1L).setMonth(1L).setYear(VERIFIED_YEAR).build())
                    .setAddress(
                        AccountCreateParams.Individual.Address.builder().setLine1(VERIFIED_ADDRESS).setCity(test.city)
                            .apply { test.state?.let { setState(it) } }
                            .setPostalCode(test.postalCode).setCountry(country).build(),
                    )
                    .build(),
            )
            .apply {
                when (val bank = test.bank) {
                    is TestBank.Token -> setExternalAccount(bank.token)
                    // No test token for IBANs: the bank account itself, Stripe's test IBAN for the country.
                    is TestBank.Iban -> putExtraParam(
                        "external_account",
                        mapOf(
                            "object" to "bank_account", "country" to country, "currency" to test.currency,
                            "account_number" to bank.iban, "account_holder_name" to "Simulation Owner",
                            "account_holder_type" to "individual",
                        ),
                    )
                }
            }
            .setTosAcceptance(
                AccountCreateParams.TosAcceptance.builder().setDate(business.createdAt.epochSecond).setIp(TOS_IP).build(),
            )
            .putMetadata(MARKER, "true")
            .putMetadata("businessId", business.id.toString())
            .putMetadata("slug", business.slug)
            .build()
    }

    private sealed interface TestBank {
        data class Token(val token: String) : TestBank
        data class Iban(val iban: String) : TestBank
    }

    private data class TestData(
        val currency: String,
        val phone: String,
        val city: String,
        val postalCode: String,
        val bank: TestBank,
        val state: String? = null,
        val idNumber: String? = null,
        val ssnLast4: String? = null,
    )

    companion object {
        /** The metadata key that marks an account as the simulation's (with `businessId`, the business it is for). */
        const val MARKER = "bookanythingSimulation"

        /** Stripe test keys only: a live key never makes (or deletes) a simulation account. */
        fun isTestKey(key: String?): Boolean = key != null && (key.startsWith("sk_test_") || key.startsWith("rk_test_"))

        /** For the purge command, which has no app: Stripe on [key] when it is a test key, else null. */
        fun forKey(key: String?): SimulationStripeAccounts? =
            if (key != null && isTestKey(key)) SimulationStripeAccounts(SdkStripeGateway(key)) else null

        fun isOurs(state: StripeAccountState, businessId: UUID): Boolean =
            state.metadata[MARKER] == "true" && state.metadata["businessId"] == businessId.toString()

        fun idempotencyKey(business: BusinessRow) = "bookanything-sim-account-${business.id}-${business.stripeAccountGeneration}"

        // Stripe's verification test values (docs.stripe.com/connect/testing): they verify at once in test mode.
        private const val VERIFIED_YEAR = 1901L
        private const val VERIFIED_ADDRESS = "address_full_match"
        private const val TEST_URL = "https://accessible.stripe.com"
        private const val EMAIL = "simulation@example.com"

        /** Passes phone validation in test mode. */
        private const val TEST_PHONE = "0000000000"

        /** Miscellaneous personal services. */
        private const val MCC = "7299"

        /** A documentation address (RFC 5737): where the terms were "accepted". */
        private const val TOS_IP = "203.0.113.10"
        private const val NAME_MAX = 100

        private val TEST_DATA = mapOf(
            "IE" to TestData(
                currency = "eur", phone = TEST_PHONE, city = "Dublin", postalCode = "D02 X285",
                bank = TestBank.Iban("IE29AIBK93115212345678"),
            ),
            "US" to TestData(
                currency = "usd", phone = "+15555550100", city = "San Francisco", postalCode = "94103", state = "CA",
                bank = TestBank.Token("btok_us_verified"), idNumber = "000000000", ssnLast4 = "0000",
            ),
        )
    }
}
