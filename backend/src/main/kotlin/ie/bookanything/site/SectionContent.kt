package ie.bookanything.site

import kotlinx.serialization.Serializable

/** Section content by type. Serialized without a discriminator: the section's `type` says which. */
sealed interface SectionContent {
    val type: SectionType
}

@Serializable
data class HeroContent(
    val variant: HeroVariant = HeroVariant.SPLIT,
    val eyebrow: String? = null,
    val headline: String,
    val subheadline: String? = null,
    val ctaLabel: String? = DEFAULT_CTA_LABEL,
    val image: SiteImage? = null,
) : SectionContent {
    override val type get() = SectionType.HERO
}

@Serializable
data class ServicesContent(
    val heading: String = "Services",
    val intro: String? = null,
    /** Real service ids in display order; empty = all public services. */
    val serviceIds: List<String> = emptyList(),
    val showPrices: Boolean = true,
    val showDurations: Boolean = true,
) : SectionContent {
    override val type get() = SectionType.SERVICES
}

@Serializable
data class TeamMember(val resourceId: String, val bio: String? = null, val photo: SiteImage? = null)

@Serializable
data class TeamContent(
    val heading: String = "Meet the team",
    val intro: String? = null,
    /** Empty = all active people. */
    val members: List<TeamMember> = emptyList(),
) : SectionContent {
    override val type get() = SectionType.TEAM
}

@Serializable
data class AboutContent(
    val heading: String = "About us",
    val body: String,
    val highlights: List<String> = emptyList(),
    val image: SiteImage? = null,
) : SectionContent {
    override val type get() = SectionType.ABOUT
}

@Serializable
data class GalleryContent(
    val heading: String? = null,
    val images: List<SiteImage> = emptyList(),
) : SectionContent {
    override val type get() = SectionType.GALLERY
}

@Serializable
data class Testimonial(val quote: String, val author: String, val detail: String? = null)

@Serializable
data class TestimonialsContent(
    val heading: String = "What our customers say",
    val items: List<Testimonial> = emptyList(),
) : SectionContent {
    override val type get() = SectionType.TESTIMONIALS
}

@Serializable
data class FaqItem(val question: String, val answer: String)

@Serializable
data class FaqContent(
    val heading: String = "Frequently asked questions",
    val items: List<FaqItem> = emptyList(),
) : SectionContent {
    override val type get() = SectionType.FAQ
}

@Serializable
data class HoursContent(
    val heading: String = "Opening hours",
    val note: String? = null,
    val showAddress: Boolean = true,
    val showMapLink: Boolean = true,
) : SectionContent {
    override val type get() = SectionType.HOURS
}

@Serializable
data class CtaContent(
    val headline: String,
    val body: String? = null,
    val buttonLabel: String = DEFAULT_CTA_LABEL,
) : SectionContent {
    override val type get() = SectionType.CTA
}

@Serializable
data class ContactContent(
    val heading: String = "Get in touch",
    val body: String? = null,
    val showPhone: Boolean = true,
    val showEmail: Boolean = true,
    val showAddress: Boolean = true,
) : SectionContent {
    override val type get() = SectionType.CONTACT
}

const val DEFAULT_CTA_LABEL = "Book now"
