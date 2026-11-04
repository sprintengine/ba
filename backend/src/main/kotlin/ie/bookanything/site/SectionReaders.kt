package ie.bookanything.site

import kotlinx.serialization.json.JsonNull

/** Strict readers for each section's content (limits from section 15.3). Defaults come from the content classes. */
object SectionReaders {
    fun hero(c: PlanNode): HeroContent? {
        c.allow("variant", "eyebrow", "headline", "subheadline", "ctaLabel", "image")
        val variant = c.choice("variant", HeroVariant.entries, default = HeroVariant.SPLIT)
        val headline = c.text("headline", 90, required = true)
        val eyebrow = c.text("eyebrow", 60)
        val subheadline = c.text("subheadline", 240, multiline = true)
        val ctaLabel = c.text("ctaLabel", 30, default = DEFAULT_CTA_LABEL)
        val image = c.image("image")
        if (variant == null || headline == null) return null
        return HeroContent(variant, eyebrow, headline, subheadline, ctaLabel, image)
    }

    fun services(c: PlanNode): ServicesContent {
        c.allow("heading", "intro", "serviceIds", "showPrices", "showDurations")
        val d = ServicesContent()
        val ids = c.strings("serviceIds", max = 100) { path, id ->
            if (id !in c.refs.serviceIds) { c.error(path, "Unknown service"); null } else id
        }.distinct()
        return ServicesContent(
            heading = c.text("heading", 80, required = true, default = d.heading) ?: d.heading,
            intro = c.text("intro", 300, multiline = true),
            serviceIds = ids,
            showPrices = c.bool("showPrices", d.showPrices),
            showDurations = c.bool("showDurations", d.showDurations),
        )
    }

    fun team(c: PlanNode): TeamContent {
        c.allow("heading", "intro", "members")
        val d = TeamContent()
        val seen = HashSet<String>()
        val members = c.children("members", max = 24).mapNotNull { m ->
            m.allow("resourceId", "bio", "photo")
            val id = m.text("resourceId", 36, required = true)
            when {
                id == null -> Unit
                id !in c.refs.personIds -> m.error("resourceId", "Must be an active team member (a person resource)")
                !seen.add(id) -> m.error("resourceId", "Already listed")
            }
            val bio = m.text("bio", 400, multiline = true)
            val photo = m.image("photo")
            id?.let { TeamMember(it, bio, photo) }
        }
        return TeamContent(
            heading = c.text("heading", 80, required = true, default = d.heading) ?: d.heading,
            intro = c.text("intro", 300, multiline = true),
            members = members,
        )
    }

    fun about(c: PlanNode): AboutContent? {
        c.allow("heading", "body", "highlights", "image")
        val heading = c.text("heading", 80, required = true, default = "About us") ?: "About us"
        val body = c.text("body", 1500, required = true, multiline = true)
        val highlights = c.strings("highlights", max = 4) { path, h -> c.cleanText(path, h, 60) }
        val image = c.image("image")
        return body?.let { AboutContent(heading, it, highlights, image) }
    }

    fun gallery(c: PlanNode): GalleryContent {
        c.allow("heading", "images")
        val heading = c.text("heading", 80)
        val images = c.list("images", max = 12).mapIndexedNotNull { i, el ->
            if (el is JsonNull) { c.error("images[$i]", "Required"); null } else PlanImageRules.read(c, "images[$i]", el)
        }
        return GalleryContent(heading, images)
    }

    fun testimonials(c: PlanNode): TestimonialsContent {
        c.allow("heading", "items")
        val d = TestimonialsContent()
        val items = c.children("items", max = 8).mapNotNull { t ->
            t.allow("quote", "author", "detail")
            val quote = t.text("quote", 400, required = true, multiline = true)
            val author = t.text("author", 60, required = true)
            val detail = t.text("detail", 60)
            if (quote != null && author != null) Testimonial(quote, author, detail) else null
        }
        return TestimonialsContent(c.text("heading", 80, required = true, default = d.heading) ?: d.heading, items)
    }

    fun faq(c: PlanNode): FaqContent {
        c.allow("heading", "items")
        val d = FaqContent()
        val items = c.children("items", max = 12).mapNotNull { f ->
            f.allow("question", "answer")
            val q = f.text("question", 140, required = true)
            val a = f.text("answer", 600, required = true, multiline = true)
            if (q != null && a != null) FaqItem(q, a) else null
        }
        return FaqContent(c.text("heading", 80, required = true, default = d.heading) ?: d.heading, items)
    }

    fun hours(c: PlanNode): HoursContent {
        c.allow("heading", "note", "showAddress", "showMapLink")
        val d = HoursContent()
        return HoursContent(
            heading = c.text("heading", 80, required = true, default = d.heading) ?: d.heading,
            note = c.text("note", 200, multiline = true),
            showAddress = c.bool("showAddress", d.showAddress),
            showMapLink = c.bool("showMapLink", d.showMapLink),
        )
    }

    fun cta(c: PlanNode): CtaContent? {
        c.allow("headline", "body", "buttonLabel")
        val headline = c.text("headline", 90, required = true)
        val body = c.text("body", 240, multiline = true)
        val button = c.text("buttonLabel", 30, required = true, default = DEFAULT_CTA_LABEL) ?: DEFAULT_CTA_LABEL
        return headline?.let { CtaContent(it, body, button) }
    }

    fun contact(c: PlanNode): ContactContent {
        c.allow("heading", "body", "showPhone", "showEmail", "showAddress")
        val d = ContactContent()
        return ContactContent(
            heading = c.text("heading", 80, required = true, default = d.heading) ?: d.heading,
            body = c.text("body", 300, multiline = true),
            showPhone = c.bool("showPhone", d.showPhone),
            showEmail = c.bool("showEmail", d.showEmail),
            showAddress = c.bool("showAddress", d.showAddress),
        )
    }
}
