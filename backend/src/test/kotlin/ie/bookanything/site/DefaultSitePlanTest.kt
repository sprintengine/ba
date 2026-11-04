package ie.bookanything.site

import ie.bookanything.business.Policies
import ie.bookanything.business.Vocabulary
import ie.bookanything.http.ApiJson
import ie.bookanything.services.ServiceOptionDto
import ie.bookanything.support.SiteFixtures
import ie.bookanything.support.SiteFixtures.business
import ie.bookanything.support.SiteFixtures.inputs
import ie.bookanything.support.SiteFixtures.service
import kotlinx.serialization.serializer
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class DefaultSitePlanTest {
    private val validator = SiteValidator(SiteFixtures.refs)

    private fun SitePlan.faq() = (sections.first { it.type == SectionType.FAQ }.content as FaqContent).items
    private fun SitePlan.answer(question: String) = faq().first { it.question.startsWith(question) }.answer

    @Test
    fun `the same data always gives the same plan`() {
        val a = DefaultSitePlan.build(inputs(), "calm and warm")
        val b = DefaultSitePlan.build(inputs(), "calm and warm")
        assertEquals(a, b)
        assertEquals(ApiJson.encodeToString(serializer<SitePlan>(), a), ApiJson.encodeToString(serializer<SitePlan>(), b))
        assertEquals(
            listOf("hero", "services", "team", "about", "hours", "faq", "testimonials", "cta", "contact"), a.sections.map { it.id },
        )
    }

    @Test
    fun `industries map to themes, hero variants and patterns`() {
        val expected = mapOf(
            "physio" to SiteTheme.CALM, "gp_practice" to SiteTheme.CLINICAL, "car_wash" to SiteTheme.BOLD,
            "music_lessons" to SiteTheme.PLAYFUL,
            "salon" to SiteTheme.EDITORIAL, "fitness_class" to SiteTheme.BOLD, "generic" to SiteTheme.MINIMAL,
            "dental" to SiteTheme.CLINICAL, "medical_clinic" to SiteTheme.CLINICAL, "day_spa" to SiteTheme.CALM, "yoga" to SiteTheme.CALM,
            "massage_therapy" to SiteTheme.CALM, "auto_detailing" to SiteTheme.BOLD, "garage" to SiteTheme.BOLD, "gym" to SiteTheme.BOLD,
            "kids_art_class" to SiteTheme.PLAYFUL, "dance" to SiteTheme.PLAYFUL, "tutor" to SiteTheme.PLAYFUL,
            "barber" to SiteTheme.EDITORIAL,
            "photo_studio" to SiteTheme.EDITORIAL, "beauty" to SiteTheme.EDITORIAL, "accountant" to SiteTheme.MINIMAL,
            "careers_advice" to SiteTheme.MINIMAL,
        )
        for ((industry, theme) in expected) {
            val plan = DefaultSitePlan.build(inputs(business(industry = industry, name = "Northwind", description = null)))
            assertEquals(theme, plan.theme, industry)
            val hero = plan.sections[0].content as HeroContent
            assertEquals(SiteThemes.heroVariant(theme), hero.variant)
            assertEquals(SiteImage.generated(SiteThemes.pattern(theme)), hero.image)
            assertEquals(SiteThemes.accent(theme), plan.palette.accent)
        }
        assertEquals(HeroVariant.COVER, SiteThemes.heroVariant(SiteTheme.BOLD))
        assertEquals(HeroVariant.MINIMAL, SiteThemes.heroVariant(SiteTheme.MINIMAL))
        // Keywords in the name and description help unknown industries.
        assertEquals(
            SiteTheme.CLINICAL,
            DefaultSitePlan.build(inputs(business(industry = "other", name = "Bright Smile Dental", description = null))).theme,
        )
    }

    @Test
    fun `style words in the prompt override the industry`() {
        fun theme(prompt: String?) = DefaultSitePlan.build(inputs(business(industry = "physio")), prompt).theme
        assertEquals(SiteTheme.CALM, theme(null))
        assertEquals(SiteTheme.BOLD, theme("Make it bold please"))
        assertEquals(SiteTheme.EDITORIAL, theme("something elegant"))
        assertEquals(SiteTheme.CALM, theme("warm and welcoming"))
        assertEquals(SiteTheme.CLINICAL, theme("very professional"))
        assertEquals(SiteTheme.PLAYFUL, theme("playful!"))
        assertEquals(SiteTheme.MINIMAL, theme("not too playful, minimal"))
        assertEquals(SiteTheme.CALM, theme("a clinic for runners"), "business keywords in a prompt don't beat the industry")
    }

    @Test
    fun `plans always pass validation`() {
        val variations = listOf(
            inputs(),
            inputs(team = emptyList()),
            inputs(business(description = null, city = null, phone = null, email = null)),
            inputs(business(name = "N".repeat(100), industry = "a_very_long_industry_name_that_goes_on", city = "C".repeat(80))),
            inputs(
                business(
                    vocabulary = Vocabulary(
                        "Stylist", "Stylists", "Guest", "Guests", "Extraordinarily long appointment word",
                        "X",
                    ),
                ),
            ),
            inputs(business(primaryColor = "#fde047")),
            inputs(business(primaryColor = "#ffffff", industry = "salon")),
            inputs(business(description = "D".repeat(3000))),
            inputs(services = emptyList()),
        ) + SiteThemes.BY_INDUSTRY.keys.map { inputs(business(industry = it)) }
        for (i in variations) {
            val plan = DefaultSitePlan.build(i, "bold")
            assertTrue(validator.problems(plan).isEmpty(), "${i.business.industry}: ${validator.problems(plan)}")
            assertEquals(plan, validator.check(plan), "already normalized")
            assertTrue(DefaultSitePlan.build(i).sections.flatMap(::texts).none(CopyGuard::flags), "no claims in default copy")
        }
    }

    @Test
    fun `sections follow the real data`() {
        val full = DefaultSitePlan.build(inputs())
        val testimonials = full.sections.first { it.type == SectionType.TESTIMONIALS }
        assertFalse(testimonials.enabled)
        assertEquals(emptyList(), (testimonials.content as TestimonialsContent).items)
        assertEquals("What our clients say", (testimonials.content as TestimonialsContent).heading)
        assertEquals(
            emptyList(), (full.sections.first { it.type == SectionType.SERVICES }.content as ServicesContent).serviceIds,
            "all public services",
        )
        assertEquals("Treatments", (full.sections.first { it.type == SectionType.SERVICES }.content as ServicesContent).heading)
        val hero = full.sections[0].content as HeroContent
        assertEquals("Harbour Physio", hero.headline)
        assertEquals("Physiotherapy in Dublin", hero.eyebrow)
        assertEquals("Book an appointment", hero.ctaLabel)
        assertEquals(
            "Book your next appointment online", (full.sections.first { it.type == SectionType.CTA }.content as CtaContent).headline,
        )
        val about = full.sections.first { it.type == SectionType.ABOUT }.content as AboutContent
        assertEquals("Friendly physiotherapy by the sea.", about.body)
        assertEquals(listOf("Book online, day or night", "Reschedule or cancel online", "Choose your therapist"), about.highlights)
        assertEquals(
            SiteSeo(
                "Harbour Physio | Physiotherapy in Dublin",
                "Physiotherapy in Dublin. Book online with Harbour Physio: see services and available times and choose what suits you.",
            ),
            full.seo,
        )

        val noTeam = DefaultSitePlan.build(
            inputs(team = emptyList(), business = business(description = null, phone = null, email = null, city = null)),
        )
        assertTrue(noTeam.sections.none { it.type == SectionType.TEAM || it.type == SectionType.ABOUT })
        val contact = noTeam.sections.first { it.type == SectionType.CONTACT }.content as ContactContent
        assertEquals(ContactContent("Get in touch", null, showPhone = false, showEmail = false, showAddress = true), contact)
        val bookings = DefaultSitePlan.build(inputs(business(vocabulary = Vocabulary())))
        assertEquals("Book now", (bookings.sections[0].content as HeroContent).ctaLabel)
        assertEquals("Book your next visit online", (bookings.sections.first { it.type == SectionType.CTA }.content as CtaContent).headline)
        // The business colour is kept when it's readable and darkened when it isn't.
        assertEquals("#0f766e", full.palette.primaryColor)
        val light = DefaultSitePlan.build(inputs(business(primaryColor = "#fde047"))).palette.primaryColor
        assertNull(ColorContrast.primaryProblem(light))
    }

    @Test
    fun `the FAQ is derived from the real policies`() {
        val default = DefaultSitePlan.build(inputs())
        assertEquals(
            listOf(
                "How do I book?", "Can I change or cancel my appointment?", "How does payment work?", "How far ahead can I book?",
            ),
            default.faq().map { it.question },
        )
        assertEquals(
            "Yes. Use the link in your confirmation email to reschedule or cancel. Changes can be made up to 24 hours before your " +
                "appointment. " +
                "If you paid online and cancel at least 24 hours before, you get a full refund; later cancellations are not refunded.",
            default.answer("Can I change"),
        )
        assertEquals("You pay online when you book.", default.answer("How does payment"))
        assertEquals("You can book up to 60 days ahead. Please book at least 1 hour in advance.", default.answer("How far ahead"))

        fun plan(p: Policies = Policies(), vararg services: ie.bookanything.services.ServiceDto) =
            DefaultSitePlan.build(inputs(business(policies = p), services = services.toList().ifEmpty { listOf(service()) }))
        assertTrue(
            plan(Policies(lateCancellationRefundPercent = 50)).answer("Can I change").endsWith("later cancellations get a 50% refund."),
        )
        assertTrue(plan(Policies(lateCancellationRefundPercent = 100)).answer("Can I change").endsWith("refunded in full too."))
        assertTrue(
            plan(Policies(cancellationNoticeHours = 0)).answer("Can I change").contains(
                "cancel before your appointment starts, you get a full refund",
            ),
        )
        assertEquals(
            "Please get in touch with us if you need to change or cancel your appointment.",
            plan(Policies(allowCustomerCancel = false, allowCustomerReschedule = false)).answer("Can I change"),
        )
        assertTrue(plan(Policies(allowCustomerReschedule = false)).answer("Can I change").startsWith("You can cancel using the link"))
        assertTrue(plan(Policies(allowCustomerCancel = false)).answer("Can I change").startsWith("You can reschedule using the link"))
        assertFalse(
            plan(Policies(), service(paymentMode = "at_venue")).answer("Can I change").contains("refund"),
            "nothing to refund when paying at the venue",
        )
        assertEquals(
            "You pay at your appointment. Nothing is charged when you book online.",
            plan(Policies(), service(paymentMode = "at_venue")).answer("How does payment"),
        )
        assertEquals(
            "A deposit is taken online when you book, and the rest is paid at your appointment.",
            plan(Policies(), service(paymentMode = "deposit")).answer("How does payment"),
        )
        assertTrue(
            plan(
                Policies(), service(paymentMode = "full"),
                service(SiteFixtures.SERVICE_B, paymentMode = "at_venue"),
            ).answer("How does payment").startsWith("It depends on the service"),
        )
        val free = plan(Policies(), service(paymentMode = "free", priceCents = 0))
        assertEquals("No. There's no payment to make when you book online.", free.answer("Do I need to pay"))
        val pricedOption = plan(
            Policies(), service(paymentMode = "full", priceCents = 0, options = listOf(ServiceOptionDto("o", "Long", null, 60, 4000, 0))),
        )
        assertEquals("You pay online when you book.", pricedOption.answer("How does payment"), "priced options count")
        assertTrue(plan(Policies(), service(requiresApproval = true)).answer("How do I book").contains("confirmed by us first"))
        assertTrue(
            plan(Policies(), service(maxAdvanceDays = 14)).faq().none { it.question == "How far ahead can I book?" },
            "per-service limits aren't generalised",
        )
        assertEquals(
            "You can book up to 1 day ahead. Please book at least 2 days in advance.",
            plan(Policies(maxAdvanceDays = 1, minNoticeMinutes = 2880)).answer("How far ahead"),
        )
        assertEquals("You can book up to 30 days ahead.", plan(Policies(maxAdvanceDays = 30, minNoticeMinutes = 0)).answer("How far ahead"))
        val none = DefaultSitePlan.build(inputs(services = emptyList()))
        assertEquals(listOf("How do I book?", "Can I change or cancel my appointment?"), none.faq().map { it.question })
    }

    private fun texts(s: SiteSection): List<String> = when (val c = s.content) {
        is HeroContent -> listOfNotNull(c.eyebrow, c.headline, c.subheadline, c.ctaLabel)
        is ServicesContent -> listOfNotNull(c.heading, c.intro)
        is TeamContent -> listOfNotNull(c.heading, c.intro)
        is AboutContent -> listOf(c.heading) + c.highlights
        is GalleryContent -> listOfNotNull(c.heading)
        is TestimonialsContent -> listOf(c.heading)
        is FaqContent -> c.items.flatMap { listOf(it.question, it.answer) }
        is HoursContent -> listOfNotNull(c.heading, c.note)
        is CtaContent -> listOfNotNull(c.headline, c.body, c.buttonLabel)
        is ContactContent -> listOfNotNull(c.heading, c.body)
    }
}
