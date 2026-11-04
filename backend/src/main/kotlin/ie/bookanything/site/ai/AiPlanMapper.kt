package ie.bookanything.site.ai

import ie.bookanything.site.AboutContent
import ie.bookanything.site.ColorContrast
import ie.bookanything.site.ContactContent
import ie.bookanything.site.CopyGuard
import ie.bookanything.site.CtaContent
import ie.bookanything.site.FaqContent
import ie.bookanything.site.FaqItem
import ie.bookanything.site.GalleryContent
import ie.bookanything.site.GeneratedPattern
import ie.bookanything.site.HeroContent
import ie.bookanything.site.HeroVariant
import ie.bookanything.site.HoursContent
import ie.bookanything.site.ImageKind
import ie.bookanything.site.SectionContent
import ie.bookanything.site.SectionDefaults
import ie.bookanything.site.SectionType
import ie.bookanything.site.ServicesContent
import ie.bookanything.site.SiteImage
import ie.bookanything.site.SiteInputs
import ie.bookanything.site.SitePalette
import ie.bookanything.site.SitePlan
import ie.bookanything.site.SiteRefs
import ie.bookanything.site.SiteSection
import ie.bookanything.site.SiteSeo
import ie.bookanything.site.SiteText
import ie.bookanything.site.SiteTheme
import ie.bookanything.site.SiteThemes
import ie.bookanything.site.SiteValidator
import ie.bookanything.site.TeamContent
import ie.bookanything.site.TeamMember
import ie.bookanything.site.TestimonialsContent
import ie.bookanything.site.keyed

/**
 * Repairs model output into a typed plan (section 15.4): text cleaned, claims removed by
 * [CopyGuard], cut to the limits at word boundaries; unknown types, extra heroes and invented
 * service or team ids dropped; colours made compliant; no images and no testimonials (those come
 * from the owner and are carried over afterwards). [base] supplies what the model left out.
 */
class AiPlanMapper(private val inputs: SiteInputs, private val refs: SiteRefs, private val base: SitePlan) {

    fun toPlan(out: AiSiteOutput): SitePlan {
        val theme = keyed<SiteTheme>(out.theme.trim()) ?: base.theme
        val defaults = SectionDefaults.Context(inputs, theme)
        val known = out.sections.mapNotNull { s -> keyed<SectionType>(s.type.trim())?.let { it to s } }
        // One hero: the first, counted among the known sections (an unknown type before it must not shift the index).
        val hero = known.indexOfFirst { (type, _) -> type == SectionType.HERO }
        val kept = known.filterIndexed { i, (type, _) -> type != SectionType.HERO || i == hero }
        val ids = assignIds(kept)
        val sections = ArrayList<SiteSection>()
        kept.forEachIndexed { i, (type, s) ->
            if (sections.size >= SiteValidator.MAX_SECTIONS) return@forEachIndexed
            val previous = base.section(ids[i])?.content?.takeIf { it.type == type }
            content(type, s, theme, defaults, previous)?.let { sections += SiteSection(ids[i], s.enabled, it) }
        }
        return SitePlan(
            theme = theme,
            palette = SitePalette(
                primaryColor = ColorContrast.normalize(out.primaryColor.trim())?.let(
                    ColorContrast::compliantPrimary,
                ) ?: base.palette.primaryColor,
                accent = out.accentColor.trim().takeIf { it.isNotEmpty() }?.let(ColorContrast::normalize)?.let(
                    ColorContrast::compliantAccent,
                ),
            ),
            seo = SiteSeo(copy(out.seoTitle, 70), copy(out.seoDescription, 160)),
            sections = sections,
        )
    }

    /** Valid ids the model kept stay (first use wins); new or clashing sections get fresh ids from their type. */
    private fun assignIds(kept: List<Pair<SectionType, AiSection>>): List<String> {
        val claimed = HashSet<String>()
        val given = kept.map { (_, s) -> s.id.trim().takeIf { SiteValidator.SECTION_ID.matches(it) && claimed.add(it) } }
        val taken = claimed.toMutableSet()
        return kept.mapIndexed { i, (type, _) ->
            given[i] ?: generateSequence(1) { it + 1 }.map { n ->
                if (n == 1) type.key else "${type.key}-$n"
            }.first { it !in taken }.also { taken += it }
        }
    }

    private fun content(
        type: SectionType, s: AiSection, theme: SiteTheme, d: SectionDefaults.Context, previous: SectionContent?,
    ): SectionContent? = when (type) {
        SectionType.HERO -> hero(s, theme, d)
        SectionType.SERVICES -> services(s, d, previous as? ServicesContent)
        SectionType.TEAM -> team(s, d)
        SectionType.ABOUT -> about(s, theme)
        SectionType.GALLERY -> GalleryContent(copy(s.heading, 80), emptyList())
        SectionType.TESTIMONIALS -> TestimonialsContent(copy(s.heading, 80) ?: SectionDefaults.testimonials(d).heading, emptyList())
        SectionType.FAQ -> faq(s, d)
        SectionType.HOURS -> hours(s, previous as? HoursContent ?: SectionDefaults.hours(d))
        SectionType.CTA -> cta(s, d)
        SectionType.CONTACT -> contact(s, previous as? ContactContent ?: SectionDefaults.contact(d))
    }

    private fun hero(s: AiSection, theme: SiteTheme, d: SectionDefaults.Context) = HeroContent(
        variant = keyed<HeroVariant>(s.variant.trim()) ?: SiteThemes.heroVariant(theme),
        eyebrow = copy(s.eyebrow, 60),
        headline = copy(s.headline, 90) ?: SectionDefaults.hero(d).headline,
        subheadline = copy(s.subheadline, 240, multiline = true),
        ctaLabel = copy(s.ctaLabel, 30) ?: d.copy.ctaLabel(),
        image = pattern(s.pattern, theme),
    )

    /** Only services of this business; whether durations show is the owner's setting, kept from [previous]. */
    private fun services(s: AiSection, d: SectionDefaults.Context, previous: ServicesContent?) = ServicesContent(
        heading = copy(s.heading, 80) ?: d.copy.servicesHeading(),
        intro = copy(s.intro, 300, multiline = true),
        serviceIds = s.serviceIds.map { it.trim() }.filter { it in refs.serviceIds }.distinct().take(100),
        showPrices = s.showPrices,
        showDurations = previous?.showDurations ?: true,
    )

    /** Only people of this business (no section without a team); bios are model copy, photos come from the owner. */
    private fun team(s: AiSection, d: SectionDefaults.Context): TeamContent? = if (inputs.team.isEmpty()) {
        null
    } else {
        TeamContent(
            heading = copy(s.heading, 80) ?: SectionDefaults.team(d).heading,
            intro = copy(s.intro, 300, multiline = true),
            members = s.team.map { it.copy(resourceId = it.resourceId.trim()) }.filter { it.resourceId in refs.personIds }
                .distinctBy { it.resourceId }.take(24).map { TeamMember(it.resourceId, copy(it.bio, 400, multiline = true), null) },
        )
    }

    /** No about section without text. */
    private fun about(s: AiSection, theme: SiteTheme): AboutContent? = copy(s.body, 1500, multiline = true)?.let { body ->
        AboutContent(copy(s.heading, 80) ?: "About us", body, s.highlights.mapNotNull { copy(it, 60) }.take(4), pattern(s.pattern, theme))
    }

    /** Complete questions and answers only; no FAQ section without one. */
    private fun faq(s: AiSection, d: SectionDefaults.Context): FaqContent? = s.faq.mapNotNull { f ->
        val q = copy(f.question, 140)
        val a = copy(f.answer, 600, multiline = true)
        if (q != null && a != null) FaqItem(q, a) else null
    }.take(12).takeIf { it.isNotEmpty() }?.let { FaqContent(copy(s.heading, 80) ?: SectionDefaults.faq(d).heading, it) }

    /** The model writes the heading and note; what is shown is the owner's setting, kept from [old]. */
    private fun hours(s: AiSection, old: HoursContent) =
        HoursContent(copy(s.heading, 80) ?: old.heading, copy(s.body, 200, multiline = true), old.showAddress, old.showMapLink)

    private fun cta(s: AiSection, d: SectionDefaults.Context) = CtaContent(
        headline = copy(s.headline, 90) ?: SectionDefaults.cta(d).headline,
        body = copy(s.body, 240, multiline = true),
        buttonLabel = copy(s.ctaLabel, 30) ?: d.copy.ctaLabel(),
    )

    /** The model writes the heading and text; which contact details show is the owner's setting, kept from [old]. */
    private fun contact(s: AiSection, old: ContactContent) = ContactContent(
        copy(s.heading, 80) ?: old.heading, copy(s.body, 300, multiline = true), old.showPhone, old.showEmail, old.showAddress,
    )

    private fun pattern(raw: String, theme: SiteTheme) = SiteImage.generated(
        keyed<GeneratedPattern>(raw.trim()) ?: SiteThemes.pattern(theme),
    )

    companion object {
        /** Model text made safe: normalized, claims removed, cut to [max] at a word boundary; null when nothing is left. */
        fun copy(raw: String, max: Int, multiline: Boolean = false): String? {
            val clean = SiteText.clean(raw, multiline) ?: return null
            return SiteText.truncate(CopyGuard.clean(clean), max).takeIf { it.isNotEmpty() }
        }

        /** A plan in the model's flat shape, for edit prompts. Images and testimonial items are never sent. */
        fun toOutput(plan: SitePlan) = AiSiteOutput(
            theme = plan.theme.key,
            primaryColor = plan.palette.primaryColor,
            accentColor = plan.palette.accent.orEmpty(),
            seoTitle = plan.seo.title.orEmpty(),
            seoDescription = plan.seo.description.orEmpty(),
            sections = plan.sections.map(::toOutput),
        )

        private fun toOutput(s: SiteSection): AiSection {
            val base = AiSection(id = s.id, type = s.type.key, enabled = s.enabled)
            return when (val c = s.content) {
                is HeroContent -> base.copy(
                    variant = c.variant.key, eyebrow = c.eyebrow.orEmpty(), headline = c.headline,
                    subheadline = c.subheadline.orEmpty(), ctaLabel = c.ctaLabel.orEmpty(), pattern = patternKey(c.image),
                )
                is ServicesContent -> base.copy(
                    heading = c.heading, intro = c.intro.orEmpty(), serviceIds = c.serviceIds, showPrices = c.showPrices,
                )
                is TeamContent -> base.copy(
                    heading = c.heading, intro = c.intro.orEmpty(), team = c.members.map { AiTeamMember(it.resourceId, it.bio.orEmpty()) },
                )
                is AboutContent -> base.copy(heading = c.heading, body = c.body, highlights = c.highlights, pattern = patternKey(c.image))
                is GalleryContent -> base.copy(heading = c.heading.orEmpty())
                is TestimonialsContent -> base.copy(heading = c.heading)
                is FaqContent -> base.copy(heading = c.heading, faq = c.items.map { AiFaqItem(it.question, it.answer) })
                is HoursContent -> base.copy(heading = c.heading, body = c.note.orEmpty())
                is CtaContent -> base.copy(headline = c.headline, body = c.body.orEmpty(), ctaLabel = c.buttonLabel)
                is ContactContent -> base.copy(heading = c.heading, body = c.body.orEmpty())
            }
        }

        private fun patternKey(image: SiteImage?) = image?.takeIf { it.kind == ImageKind.GENERATED }?.pattern?.key.orEmpty()
    }
}
