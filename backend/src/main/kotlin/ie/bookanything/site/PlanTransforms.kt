package ie.bookanything.site

/** Drops references that are no longer valid (restores, and the base plan of edits). */
object PlanSanitizer {
    /** Unknown services, team members that are no longer active people, and uploads of other businesses are removed. */
    fun sanitize(plan: SitePlan, refs: SiteRefs): SitePlan =
        plan.copy(sections = plan.sections.map { it.copy(content = content(it.content, refs)) })

    private fun content(c: SectionContent, refs: SiteRefs): SectionContent = when (c) {
        is HeroContent -> c.copy(image = image(c.image, refs))
        is ServicesContent -> c.copy(serviceIds = c.serviceIds.filter { it in refs.serviceIds })
        is TeamContent -> c.copy(
            members = c.members.filter { it.resourceId in refs.personIds }.map { it.copy(photo = image(it.photo, refs)) },
        )
        is AboutContent -> c.copy(image = image(c.image, refs))
        is GalleryContent -> c.copy(images = c.images.mapNotNull { image(it, refs) })
        is TestimonialsContent, is FaqContent, is HoursContent, is CtaContent, is ContactContent -> c
    }

    private fun image(image: SiteImage?, refs: SiteRefs): SiteImage? =
        image?.takeIf { it.kind != ImageKind.UPLOAD || (it.url != null && PlanImageRules.isOwnUpload(it.url, refs)) }
}

/**
 * Keeps what only the owner provides when a generator rewrites a plan: uploaded and stock images
 * (by section id, else the first section of the same type), team photos (by person), gallery
 * images, and testimonials with their visibility. Testimonials never come from a generator, so a
 * testimonials section without the owner's items is emptied and hidden.
 */
object PlanCarryOver {
    fun apply(current: SitePlan, next: SitePlan): SitePlan = next.copy(sections = next.sections.map { carry(it, match(current, it)) })

    private fun match(current: SitePlan, s: SiteSection): SiteSection? =
        current.section(s.id)?.takeIf { it.type == s.type } ?: current.sections.firstOrNull { it.type == s.type }

    private fun carry(s: SiteSection, old: SiteSection?): SiteSection = when (val c = s.content) {
        is HeroContent -> s.copy(content = c.copy(image = ownerImage((old?.content as? HeroContent)?.image) ?: c.image))
        is AboutContent -> s.copy(content = c.copy(image = ownerImage((old?.content as? AboutContent)?.image) ?: c.image))
        is GalleryContent -> s.copy(content = c.copy(images = c.images.ifEmpty { (old?.content as? GalleryContent)?.images.orEmpty() }))
        is TeamContent -> {
            val photos = (old?.content as? TeamContent)?.members.orEmpty().associate { it.resourceId to ownerImage(it.photo) }
            s.copy(content = c.copy(members = c.members.map { m -> m.copy(photo = photos[m.resourceId] ?: m.photo) }))
        }
        is TestimonialsContent -> {
            val items = (old?.content as? TestimonialsContent)?.items.orEmpty()
            if (items.isEmpty()) {
                s.copy(enabled = false, content = c.copy(items = emptyList()))
            } else {
                s.copy(enabled = old!!.enabled, content = c.copy(items = items))
            }
        }
        is ServicesContent, is FaqContent, is HoursContent, is CtaContent, is ContactContent -> s
    }

    /** Uploaded and stock images are the owner's choice; generated patterns may follow the new design. */
    private fun ownerImage(image: SiteImage?): SiteImage? = image?.takeIf { it.kind != ImageKind.GENERATED }
}

/** Section ids and positions shared by editors. */
object PlanSections {
    fun uniqueId(sections: List<SiteSection>, base: String): String {
        val used = sections.map { it.id }.toSet()
        if (base !in used) return base
        return generateSequence(2) { it + 1 }.map { "${base.take(36)}-$it" }.first { it !in used }
    }

    /** Where a new section goes: a hero first, anything else before the closing call to action and contact. */
    fun insertIndex(sections: List<SiteSection>, type: SectionType): Int {
        if (type == SectionType.HERO) return 0
        val closing = sections.indexOfFirst { it.type == SectionType.CTA || it.type == SectionType.CONTACT }
        return if (closing >= 0) closing else sections.size
    }
}
