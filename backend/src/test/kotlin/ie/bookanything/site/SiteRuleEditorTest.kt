package ie.bookanything.site

import ie.bookanything.support.SiteFixtures
import ie.bookanything.support.SiteFixtures.business
import ie.bookanything.support.SiteFixtures.inputs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class SiteRuleEditorTest {
    private val inputs = inputs()
    private val base = DefaultSitePlan.build(inputs)
    private val generator = TemplateSiteGenerator()

    private fun edit(instruction: String, plan: SitePlan = base) = SiteRuleEditor.apply(plan, instruction, inputs)
    private fun changes(instruction: String, plan: SitePlan = base) = SiteDiff.changes(plan, edit(instruction, plan).plan)
    private fun SitePlan.ids() = sections.map { it.id }

    @Test
    fun `moves sections by owner words`() {
        assertEquals(listOf("Moved Testimonials up"), changes("move reviews higher"))
        assertEquals(
            listOf(
                "hero", "faq", "services", "team", "about", "hours", "testimonials", "cta", "contact",
            ),
            edit("Move the FAQ to the top").plan.ids(),
            "the top is right after the hero",
        )
        assertEquals("services", edit("put the services section at the bottom").plan.ids().last())
        val down = edit("move the team down")
        assertEquals(listOf("hero", "services", "about", "team", "hours", "faq", "testimonials", "cta", "contact"), down.plan.ids())
        assertEquals(listOf("moved Team down"), down.applied)
        assertEquals(
            listOf("hero", "services", "team", "about", "hours", "testimonials", "faq", "cta", "contact"),
            edit("move reviews above the FAQ").plan.ids(),
        )
        assertEquals(
            listOf("hero", "services", "about", "team", "hours", "faq", "testimonials", "cta", "contact"),
            edit("move the team below about").plan.ids(),
        )
        assertEquals(listOf("Moved Opening hours up"), changes("opening hours higher"))
        assertEquals(emptyList(), changes("move services higher"), "never above the hero")
        assertEquals(listOf("Moved Team up"), changes("move the therapists up"), "the business's own word for its people")
        assertTrue(edit("move the gallery up").notes.single().contains("no Gallery section"))
    }

    @Test
    fun `switches themes by name or mood`() {
        val bold = edit("Use the bold theme").plan
        assertEquals(SiteTheme.BOLD, bold.theme)
        assertEquals(SiteThemes.accent(SiteTheme.BOLD), bold.palette.accent, "the theme's default accent follows")
        val hero = bold.sections[0].content as HeroContent
        assertEquals(HeroVariant.COVER, hero.variant)
        assertEquals(GeneratedPattern.RAYS, hero.image!!.pattern)
        val custom = base.copy(palette = base.palette.copy(accent = "#1d4ed8"))
        assertEquals("#1d4ed8", edit("make it bolder", custom).plan.palette.accent, "an owner's own accent stays")
        assertEquals(SiteTheme.PLAYFUL, edit("less clinical, more fun and friendly").plan.theme)
        assertEquals(SiteTheme.EDITORIAL, edit("make it feel more elegant").plan.theme)
        assertEquals(SiteTheme.MINIMAL, edit("simpler please").plan.theme)
        assertEquals(SiteTheme.CLINICAL, edit("more professional and trustworthy").plan.theme)
        assertEquals(SiteTheme.CALM, edit("warmer", base.copy(theme = SiteTheme.BOLD)).plan.theme)
        val same = edit("make it calmer")
        assertEquals(base, same.plan)
        assertTrue(same.notes.single().contains("already uses the Calm theme"))
    }

    @Test
    fun `hides, shows and adds sections`() {
        assertEquals(listOf("Hid section: Team"), changes("hide the team"))
        assertEquals(listOf("Hid section: Opening hours"), changes("Please remove the opening hours section"))
        assertEquals(emptyList(), changes("remove the gallery"), "nothing to hide")
        val hidden = edit("hide the faq").plan
        assertEquals(listOf("Showed section: FAQ"), changes("show the FAQ again", hidden))
        val gallery = edit("add a gallery").plan
        assertEquals(listOf("Added section: Gallery"), SiteDiff.changes(base, gallery))
        assertEquals(
            gallery.ids().indexOf("gallery") + 1, gallery.ids().indexOf("cta"), "new sections go before the closing call to action",
        )
        val reviews = edit("show reviews")
        assertEquals(base, reviews.plan, "testimonials stay hidden until the owner adds some")
        assertTrue(reviews.notes.single().contains("added some"))
        val withItems = base.copy(
            sections = base.sections.map {
                if (it.type == SectionType.TESTIMONIALS) {
                    it.copy(
                        content = TestimonialsContent("Reviews", listOf(Testimonial("Great", "A"))),
                    )
                } else {
                    it
                }
            },
        )
        assertEquals(listOf("Showed section: Testimonials"), changes("show the testimonials", withItems))
        assertTrue(SiteValidator(SiteFixtures.refs).problems(gallery).isEmpty())
    }

    @Test
    fun `adds a neutral FAQ about a topic`() {
        val result = edit("add a FAQ about parking")
        val faq = result.plan.sections.first { it.type == SectionType.FAQ }.content as FaqContent
        assertEquals(FaqItem("Can you tell me about parking?", "Get in touch and we'll be happy to help with parking."), faq.items.last())
        assertEquals(listOf("Edited FAQ"), SiteDiff.changes(base, result.plan))
        val noFaq = base.copy(sections = base.sections.filter { it.type != SectionType.FAQ })
        val created = edit("Add a question about wheelchair access and move reviews higher", noFaq).plan
        val newFaq = created.sections.first { it.type == SectionType.FAQ }
        assertEquals("Can you tell me about wheelchair access?", (newFaq.content as FaqContent).items.last().question)
        assertTrue(SiteDiff.changes(noFaq, created).containsAll(listOf("Added section: FAQ", "Moved Testimonials up")))
        assertEquals(base, edit("add a faq about our 5-star reviews").plan, "claims are never added")
        assertTrue(SiteValidator(SiteFixtures.refs).problems(created).isEmpty())
    }

    @Test
    fun `sets the hero headline from quoted text`() {
        val plan = edit("Change the headline to \"Welcome to Harbour Physio\" and hide the team").plan
        assertEquals("Welcome to Harbour Physio", (plan.sections[0].content as HeroContent).headline)
        assertFalse(plan.sections.first { it.type == SectionType.TEAM }.enabled)
        assertEquals("Feel at home", (edit("headline: “Feel at home”").plan.sections[0].content as HeroContent).headline)
        assertEquals(
            "Bold ideas",
            (edit("set the headline to 'Bold ideas'").plan.sections[0].content as HeroContent).headline,
            "quoted words don't switch the theme",
        )
        assertEquals(SiteTheme.CALM, edit("set the headline to 'Bold ideas'").plan.theme)
        val noHero = base.copy(sections = base.sections.drop(1))
        assertEquals("Hello", (edit("headline to \"Hello\"", noHero).plan.sections[0].content as HeroContent).headline)
    }

    @Test
    fun `the template generator explains what it understood`() {
        val refs = SiteFixtures.refs
        val done = generator.edit(EditRequest(inputs, refs, base, "move reviews higher", AiSiteGeneratorTest.CALLER))
        assertEquals(GenerationSource.TEMPLATE, done.source)
        assertEquals("Done: moved Testimonials up.", done.message)
        val nothing = generator.edit(EditRequest(inputs, refs, base, "sprinkle some magic on it", AiSiteGeneratorTest.CALLER))
        assertEquals(base, nothing.plan)
        val explanation = assertNotNull(nothing.message)
        assertTrue(explanation.contains("I couldn't find a change") && explanation.contains(SiteRuleEditor.HELP))
        val generated = generator.generate(
            GenerateRequest(inputs(business(industry = "car_wash")), refs, base, "elegant", null, AiSiteGeneratorTest.CALLER),
        )
        assertEquals(SiteTheme.EDITORIAL, generated.plan.theme)
        assertEquals(TemplateSiteGenerator.BUILT_FROM_DATA, generated.message)
    }
}
