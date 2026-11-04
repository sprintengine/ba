package ie.bookanything.payments

import java.math.BigDecimal
import java.util.Currency

/**
 * Amounts are integer minor units of their own currency (docs/architecture.md section 2, as Stripe takes them): cents
 * for EUR, whole yen for JPY, fils for KWD. Formatting must divide by the currency's own unit, never by 100.
 */
object MinorUnits {
    /** The currency's number of decimals (2 for an unknown code). */
    fun digits(currency: String): Int =
        runCatching { Currency.getInstance(currency).defaultFractionDigits }.getOrNull()?.takeIf { it >= 0 } ?: 2

    /** [amount] minor units of [currency] in major units, e.g. 1550 EUR → 15.50, 1500 JPY → 1500. */
    fun toMajor(amount: Int, currency: String): BigDecimal = BigDecimal.valueOf(amount.toLong(), digits(currency))

    /** Whether [amount] is a whole number of major units (formatters then drop the decimals). */
    fun isWhole(amount: Int, currency: String): Boolean = toMajor(amount, currency).remainder(BigDecimal.ONE).signum() == 0
}
