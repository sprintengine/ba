package ie.bookanything.payments

import ie.bookanything.assistant.tools.ToolViews
import ie.bookanything.notifications.NotificationHandler
import ie.bookanything.offers.OfferText
import kotlin.test.Test
import kotlin.test.assertEquals

/** Each place that writes an amount for people keeps its own style, from one formatter. */
class MoneyUnitTest {
    private fun cases(f: (Int, String) -> String): List<String> =
        listOf(4000 to "EUR", 1550 to "EUR", 123450 to "EUR", 4000 to "GBP", 4000 to "USD", 1500 to "JPY", 1500 to "KWD")
            .map { (cents, currency) -> f(cents, currency) }

    @Test
    fun `emails use the business's locale and always show the currency's decimals`() {
        assertEquals(
            listOf("€40.00", "€15.50", "€1,234.50", "£40.00", "US$40.00", "JP¥1,500", "KWD1.500"),
            cases { c, cur -> NotificationHandler.money(c, cur, "en-IE") },
        )
        assertEquals("40,00 €", NotificationHandler.money(4000, "EUR", "de-DE"))
    }

    @Test
    fun `offer labels are en-IE and drop whole decimals`() {
        assertEquals(
            listOf("€40", "€15.50", "€1,234.50", "£40", "US$40", "JP¥1,500", "KWD1.500"),
            cases(OfferText::money),
        )
        assertEquals("€40", OfferText.money(4000, "ZZZ"), "an unknown code formats as euro")
    }

    @Test
    fun `Bo's tool results are compact, without grouping`() {
        assertEquals(
            listOf("€40", "€15.50", "€1234.50", "£40", "$40", "JPY 1500", "KWD 1.500"),
            cases(ToolViews::money),
        )
    }
}
