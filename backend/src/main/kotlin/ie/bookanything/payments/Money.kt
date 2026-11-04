package ie.bookanything.payments

import java.text.NumberFormat
import java.util.Currency
import java.util.Locale

/** Amounts as text for people: every email, label and tool result that shows money formats it here. */
object Money {
    val EN_IE: Locale = Locale.forLanguageTag("en-IE")
    private val EUR: Currency = Currency.getInstance("EUR")

    /**
     * [amount] minor units of [currency] in [locale] ("€1,234.50"), with the currency's own decimals; whole amounts
     * drop them ("€40") when [dropWholeDecimals]. An unknown currency code formats as euro.
     */
    fun format(amount: Int, currency: String, locale: Locale = EN_IE, dropWholeDecimals: Boolean = true): String {
        val f = NumberFormat.getCurrencyInstance(locale)
        f.currency = runCatching { Currency.getInstance(currency) }.getOrDefault(EUR)
        val code = f.currency.currencyCode
        // Setting the currency does not change the locale's two decimals: use the currency's own.
        val digits = if (dropWholeDecimals && MinorUnits.isWhole(amount, code)) 0 else MinorUnits.digits(code)
        f.maximumFractionDigits = digits
        f.minimumFractionDigits = digits
        return f.format(MinorUnits.toMajor(amount, code))
    }

    /** A compact form for model prompts and tool results: "€1234.50", "€40", "JPY 1500" (no grouping, no locale). */
    fun compact(amount: Int, currency: String): String {
        val symbol = when (currency) { "EUR" -> "€"; "GBP" -> "£"; "USD" -> "$"; else -> "$currency " }
        val major = MinorUnits.toMajor(amount, currency)
        return symbol + (if (MinorUnits.isWhole(amount, currency)) major.setScale(0) else major).toPlainString()
    }
}
