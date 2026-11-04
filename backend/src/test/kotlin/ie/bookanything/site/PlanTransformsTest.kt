package ie.bookanything.site

import ie.bookanything.support.SiteFixtures
import ie.bookanything.support.SiteFixtures.inputs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class PlanTransformsTest {
    private val upload = SiteImage(ImageKind.UPLOAD, SiteFixtures.UPLOAD_PREFIX + SiteFixtures.UPLOAD_FILE, "Photo")
    private val otherUpload = SiteImage(ImageKind.UPLOAD, SiteFixtures.OTHER_UPLOAD_PREFIX + SiteFixtures.UPLOAD_FILE, "Theirs")
    private val stock = SiteImage(
        ImageKind.STOCK, "https://images.unsplash.com/photo-1", "Room", null, SiteAttribution("A", "https://unsplash.com/@a"),
    )
    private val reviews = listOf(Testimonial("Lovely", "Pat", null))

    private fun plan(vararg sections: SiteSection) = SitePlan(SiteTheme.CALM, SitePalette("#0f766e"), SiteSeo(), sections.toList())

    @Test
    fun `sanitize drops stale references`() {
        val stale = plan(
            SiteSection("hero", true, HeroContent(headline = "Hi", image = otherUpload)),
            SiteSection("services", true, ServicesContent(serviceIds = listOf(SiteFixtures.SERVICE_A, "gone"))),
            SiteSection(
                "team", true,
                TeamContent(members = listOf(TeamMember(SiteFixtures.PERSON_A, "Bio", otherUpload), TeamMember("gone"))),
            ),
            SiteSection("about", true, AboutContent(body = "x", image = upload)),
            SiteSection("gallery", true, GalleryContent(images = listOf(upload, otherUpload, stock))),
        )
        val clean = PlanSanitizer.sanitize(stale, SiteFixtures.refs)
        assertNull((clean.sections[0].content as HeroContent).image)
        assertEquals(listOf(SiteFixtures.SERVICE_A), (clean.sections[1].content as ServicesContent).serviceIds)
        assertEquals(listOf(TeamMember(SiteFixtures.PERSON_A, "Bio", null)), (clean.sections[2].content as TeamContent).members)
        assertEquals(upload, (clean.sections[3].content as AboutContent).image)
        assertEquals(listOf(upload, stock), (clean.sections[4].content as GalleryContent).images)
        assertTrue(SiteValidator(SiteFixtures.refs).problems(clean).isEmpty())
    }

    @Test
    fun `carry-over keeps the owner's images and testimonials`() {
        val current = plan(
            SiteSection("hero", true, HeroContent(headline = "Old", image = upload)),
            SiteSection("my-about", true, AboutContent(body = "Old", image = stock)),
            SiteSection("team", true, TeamContent(members = listOf(TeamMember(SiteFixtures.PERSON_A, null, upload)))),
            SiteSection("gallery", true, GalleryContent(images = listOf(upload))),
            SiteSection("reviews", false, TestimonialsContent(items = reviews)),
        )
        val generated = DefaultSitePlan.build(inputs()).let { p ->
            p.copy(
                sections = p.sections + SiteSection("gallery", true, GalleryContent("New gallery")) +
                    SiteSection("team-2", true, TeamContent(members = listOf(TeamMember(SiteFixtures.PERSON_A, "New bio")))),
            )
        }
        val next = PlanCarryOver.apply(current, generated)
        assertEquals(upload, (next.section("hero")!!.content as HeroContent).image, "by id")
        assertEquals(stock, (next.section("about")!!.content as AboutContent).image, "by type when the id is new")
        assertEquals(listOf(upload), (next.section("gallery")!!.content as GalleryContent).images)
        assertEquals(
            TeamMember(SiteFixtures.PERSON_A, "New bio", upload), (next.section("team-2")!!.content as TeamContent).members.single(),
        )
        val testimonials = next.sections.first { it.type == SectionType.TESTIMONIALS }
        assertEquals(reviews, (testimonials.content as TestimonialsContent).items)
        assertFalse(testimonials.enabled, "the owner's visibility is kept")

        val generatedOnly = PlanCarryOver.apply(
            plan(SiteSection("hero", true, HeroContent(headline = "Old", image = SiteImage.generated(GeneratedPattern.DOTS)))), generated,
        )
        assertEquals(
            SiteImage.generated(GeneratedPattern.WAVES), (generatedOnly.section("hero")!!.content as HeroContent).image,
            "generated patterns follow the new design",
        )
    }

    @Test
    fun `testimonials without owner items are emptied and hidden`() {
        val invented = plan(SiteSection("t", true, TestimonialsContent(items = listOf(Testimonial("Invented", "Nobody")))))
        val next = PlanCarryOver.apply(plan(), invented)
        assertEquals(SiteSection("t", false, TestimonialsContent(items = emptyList())), next.sections.single())
    }

    @Test
    fun `new section ids and positions`() {
        val p = DefaultSitePlan.build(inputs()).sections
        assertEquals("faq-2", PlanSections.uniqueId(p, "faq"))
        assertEquals("gallery", PlanSections.uniqueId(p, "gallery"))
        assertEquals(p.indexOfFirst { it.type == SectionType.CTA }, PlanSections.insertIndex(p, SectionType.GALLERY))
        assertEquals(0, PlanSections.insertIndex(p, SectionType.HERO))
        assertEquals(0, PlanSections.insertIndex(emptyList(), SectionType.FAQ))
    }
}
