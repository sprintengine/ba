package ie.bookanything.site

import ie.bookanything.business.Branding

/**
 * The deterministic plan (section 15.6): the default of every business without a published plan
 * and the fallback of AI generation. No network, no randomness: the same data gives the same plan.
 */
object DefaultSitePlan {
    fun build(inputs: SiteInputs, prompt: String? = null): SitePlan {
        val b = inputs.business
        val theme = SiteThemes.choose(b.industry, b.name, b.description, prompt)
        val ctx = SectionDefaults.Context(inputs, theme)
        val copy = ctx.copy
        val types = listOfNotNull(
            SectionType.HERO,
            SectionType.SERVICES,
            SectionType.TEAM.takeIf { inputs.team.isNotEmpty() },
            SectionType.ABOUT.takeIf { !b.description.isNullOrBlank() },
            SectionType.HOURS,
            SectionType.FAQ,
            SectionType.TESTIMONIALS,
            SectionType.CTA,
            SectionType.CONTACT,
        )
        return SitePlan(
            theme = theme,
            palette = palette(b.branding.primaryColor, theme),
            seo = SiteSeo(copy.seoTitle(), copy.seoDescription()),
            sections = types.map { SectionRegistry.spec(it).defaultSection(ctx) },
        )
    }

    /** The business colour made compliant, plus the theme's accent. */
    fun palette(primary: String, theme: SiteTheme) = SitePalette(
        primaryColor = ColorContrast.compliantPrimary(ColorContrast.normalize(primary) ?: Branding.DEFAULT_PRIMARY_COLOR),
        accent = SiteThemes.accent(theme)?.let(ColorContrast::compliantAccent),
    )
}
