package ie.bookanything.site

/**
 * Default content of each section type for one business: safe, generic copy built only from real
 * data (name, vocabulary, services, policies). Registered per type in [SectionRegistry].
 */
object SectionDefaults {
    class Context(val inputs: SiteInputs, val theme: SiteTheme) {
        val business get() = inputs.business
        val copy = SiteCopy(inputs.business)
    }

    fun hero(c: Context) = HeroContent(
        variant = SiteThemes.heroVariant(c.theme),
        eyebrow = c.copy.eyebrow(),
        headline = SiteText.truncate(c.business.name, 90),
        subheadline = "See what we offer and book your next ${c.copy.bookingWord} online, at a time that suits you.",
        ctaLabel = c.copy.ctaLabel(),
        image = SiteImage.generated(SiteThemes.pattern(c.theme)),
    )

    fun services(c: Context) = ServicesContent(
        heading = c.copy.servicesHeading(),
        intro = "Choose what you need, then pick a time that suits you.",
    )

    fun team(@Suppress("UNUSED_PARAMETER") c: Context) = TeamContent(heading = "Meet the team")

    fun about(c: Context) = AboutContent(
        heading = "About ${c.business.name}".takeIf { it.length <= 80 } ?: "About us",
        body = SiteText.truncate(SiteText.clean(c.business.description.orEmpty(), multiline = true).orEmpty(), 1500)
            .ifEmpty { SiteText.truncate("Welcome to ${c.business.name}.", 1500) },
        highlights = highlights(c),
        image = SiteImage.generated(SiteThemes.pattern(c.theme)),
    )

    fun gallery(@Suppress("UNUSED_PARAMETER") c: Context) = GalleryContent(heading = "Gallery")

    fun testimonials(c: Context) = TestimonialsContent(heading = "What our ${c.copy.customersWord} say".take(80))

    fun faq(c: Context) = FaqContent(heading = "Frequently asked questions", items = SiteFaq.items(c.inputs, c.copy))

    fun hours(c: Context) = HoursContent(heading = "Opening hours", showAddress = c.copy.hasAddress, showMapLink = c.copy.hasAddress)

    fun cta(c: Context) = CtaContent(
        headline = SiteText.truncate("Book your next ${c.copy.bookingWord} online", 90),
        body = "Pick a service and a time that suits you.",
        buttonLabel = c.copy.ctaLabel(),
    )

    fun contact(c: Context) = ContactContent(
        heading = "Get in touch",
        body = if (c.copy.hasPhone || c.copy.hasEmail) "Questions before you book? We're happy to help." else null,
        showPhone = c.copy.hasPhone, showEmail = c.copy.hasEmail, showAddress = c.copy.hasAddress,
    )

    /** True statements only: online booking always exists; the rest depends on the business's settings. */
    private fun highlights(c: Context): List<String> {
        val p = c.business.policies
        val manage = when {
            p.allowCustomerCancel && p.allowCustomerReschedule -> "Reschedule or cancel online"
            p.allowCustomerCancel -> "Cancel online"
            p.allowCustomerReschedule -> "Reschedule online"
            else -> null
        }
        val choose = "Choose your ${c.copy.resourceWord}".takeIf { it.length <= 60 }
            ?.takeIf { c.inputs.publicServices.any { s -> s.requirements.any { it.customerSelectable } } }
        return listOfNotNull("Book online, day or night", manage, choose)
    }
}
