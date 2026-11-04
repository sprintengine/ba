package ie.bookanything.site

import ie.bookanything.support.SiteFixtures.inputs
import kotlin.test.Test
import kotlin.test.assertEquals

class SiteDiffTest {
    private val base = DefaultSitePlan.build(inputs())

    private fun SitePlan.move(id: String, to: Int): SitePlan {
        val list = sections.toMutableList()
        val s = list.removeAt(list.indexOfFirst { it.id == id })
        list.add(to, s)
        return copy(sections = list)
    }

    private fun SitePlan.edit(id: String, f: (SiteSection) -> SiteSection) = copy(
        sections = sections.map { if (it.id == id) f(it) else it },
    )

    @Test
    fun `no change gives an empty list`() {
        assertEquals(emptyList(), SiteDiff.changes(base, base))
    }

    @Test
    fun `theme, palette and SEO changes`() {
        assertEquals(listOf("Theme: Calm → Bold"), SiteDiff.changes(base, base.copy(theme = SiteTheme.BOLD)))
        assertEquals(
            listOf("Palette: primary colour changed", "Palette: accent colour removed"),
            SiteDiff.changes(base, base.copy(palette = SitePalette("#111111", null))),
        )
        assertEquals(listOf("Palette: accent colour added"), SiteDiff.changes(base.copy(palette = base.palette.copy(accent = null)), base))
        assertEquals(
            listOf("Palette: accent colour changed"), SiteDiff.changes(base, base.copy(palette = base.palette.copy(accent = "#c2410c"))),
        )
        assertEquals(listOf("SEO updated"), SiteDiff.changes(base, base.copy(seo = SiteSeo("New", null))))
    }

    @Test
    fun `added, removed, hidden, shown and edited sections`() {
        val gallery = SiteSection("gallery", true, GalleryContent("Gallery"))
        assertEquals(listOf("Added section: Gallery"), SiteDiff.changes(base, base.copy(sections = base.sections + gallery)))
        assertEquals(listOf("Removed section: FAQ"), SiteDiff.changes(base, base.copy(sections = base.sections.filter { it.id != "faq" })))
        assertEquals(listOf("Hid section: Team"), SiteDiff.changes(base, base.edit("team") { it.copy(enabled = false) }))
        assertEquals(listOf("Showed section: Testimonials"), SiteDiff.changes(base, base.edit("testimonials") { it.copy(enabled = true) }))
        assertEquals(
            listOf("Edited Hero"),
            SiteDiff.changes(base, base.edit("hero") { it.copy(content = (it.content as HeroContent).copy(headline = "Hi")) }),
        )
        assertEquals(
            listOf("Hid section: Opening hours", "Edited Opening hours"),
            SiteDiff.changes(base, base.edit("hours") { it.copy(enabled = false, content = HoursContent("When we're open")) }),
        )
        assertEquals(
            listOf("Replaced Call to action with Gallery"),
            SiteDiff.changes(base, base.edit("cta") { SiteSection("cta", true, GalleryContent()) }),
        )
    }

    @Test
    fun `only the moved section is reported`() {
        val order = base.sections.map { it.id }
        assertEquals(listOf("hero", "services", "team", "about", "hours", "faq", "testimonials", "cta", "contact"), order)
        assertEquals(listOf("Moved Testimonials up"), SiteDiff.changes(base, base.move("testimonials", 5)))
        assertEquals(listOf("Moved Testimonials up"), SiteDiff.changes(base, base.move("testimonials", 1)))
        assertEquals(listOf("Moved Services down"), SiteDiff.changes(base, base.move("services", 8)))
        assertEquals(listOf("Moved Team down"), SiteDiff.changes(base, base.move("team", 5)))
        // An adjacent swap is the same either way round; the section that went up is reported.
        assertEquals(listOf("Moved Testimonials up"), SiteDiff.changes(base, base.move("faq", 6)))
        val twoMoves = base.move("contact", 1).move("hero", 8)
        assertEquals(setOf("Moved Contact up", "Moved Hero down"), SiteDiff.changes(base, twoMoves).toSet())
    }

    @Test
    fun `the sections that stayed are a longest run in the old order, preferring the least moved`() {
        assertEquals(emptySet(), SiteDiff.stayed(emptyList()))
        assertEquals(setOf(0, 1, 2), SiteDiff.stayed(listOf(0, 1, 2)))
        // B moved to the front: A and C stayed (not B and C).
        assertEquals(setOf(1, 2), SiteDiff.stayed(listOf(1, 0, 2)))
        // The last section moved to the front: everything it passed stayed.
        assertEquals(setOf(1, 2, 3), SiteDiff.stayed(listOf(3, 0, 1, 2)))
        // Two adjacent sections swapped: the one moved up is reported.
        assertEquals(setOf(0, 2, 3), SiteDiff.stayed(listOf(0, 2, 1, 3)))
    }
}
