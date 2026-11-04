package ie.bookanything.site

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class CopyGuardTest {
    @Test
    fun `claims, prices and credentials are flagged`() {
        listOf(
            "Sessions from €40.", "Only $30 today", "£25 per class", "It costs 40 EUR", "Just 35 euro", "40 per session", "60/hour",
            "Prices start at 30", "Get 20% off", "Ask about our discounts", "Half-price Mondays",
            "Results guaranteed", "Our guarantee to you", "We cure back pain", "Massage heals the body", "Healing hands", "Risk-free trial",
            "Dublin's #1 physio", "The number one clinic", "No. 1 in Cork", "The best in Galway", "Award-winning team",
            "Winner of three awards",
            "Rated 5 stars", "4.9 stars on Google", "A five-star experience", "★★★★★", "Scored 9/10", "Top-rated studio", "Highly rated",
            "Fully certified therapists", "Accredited clinic", "Licensed and insured", "Qualified staff", "Over 20 years of experience",
            "15+ years in practice and lots of experience",
        ).forEach { assertTrue(CopyGuard.flags(it), it) }
    }

    @Test
    fun `ordinary copy is kept`() {
        listOf(
            "Book a 30 minute session online.", "Open 7 days a week.", "Free parking behind the building.", "Meet the team.",
            "Choose your therapist.", "We explain everything in plain language.", "Lessons for ages 5 and up.",
            "Call us on the number below.",
            "Our experienced team listens first.", "Bring your car in for a wash.", "Unit 4, Lantern Quay",
        ).forEach { assertFalse(CopyGuard.flags(it), it) }
    }

    @Test
    fun `only the offending sentences are removed`() {
        assertEquals("We listen. Book online.", CopyGuard.clean("We listen. We have 20 years of experience! Book online."))
        assertEquals(
            "First paragraph.\n\nSecond paragraph.", CopyGuard.clean("First paragraph. Guaranteed results.\n\nSecond paragraph. Only €30."),
        )
        assertEquals("", CopyGuard.clean("Award-winning. 5-star rated."))
        assertEquals("", CopyGuard.clean("The best in town."))
        assertEquals("Welcome.", CopyGuard.clean("Welcome."))
    }
}
