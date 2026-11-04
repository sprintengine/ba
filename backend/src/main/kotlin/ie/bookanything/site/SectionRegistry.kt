package ie.bookanything.site

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.serializer

@Serializable
enum class SectionType(override val key: String, val label: String) : KeyedValue {
    @SerialName("hero") HERO("hero", "Hero"),
    @SerialName("services") SERVICES("services", "Services"),
    @SerialName("team") TEAM("team", "Team"),
    @SerialName("about") ABOUT("about", "About"),
    @SerialName("gallery") GALLERY("gallery", "Gallery"),
    @SerialName("testimonials") TESTIMONIALS("testimonials", "Testimonials"),
    @SerialName("faq") FAQ("faq", "FAQ"),
    @SerialName("hours") HOURS("hours", "Opening hours"),
    @SerialName("cta") CTA("cta", "Call to action"),
    @SerialName("contact") CONTACT("contact", "Contact"),
}

/** Everything the site builder knows about one section type. */
class SectionSpec<C : SectionContent>(
    val type: SectionType,
    private val serializer: KSerializer<C>,
    /** Strict, path-aware read of client JSON into normalized content; null when invalid (problems recorded on the node). */
    val read: (PlanNode) -> C?,
    /** Default content for a business (the default plan, and edits that add a missing section). */
    private val default: (SectionDefaults.Context) -> C,
    /** Testimonials only come from the owner, so their default section starts hidden. */
    private val enabledByDefault: Boolean = true,
) {
    @Suppress("UNCHECKED_CAST")
    fun encode(json: Json, content: SectionContent): JsonElement = json.encodeToJsonElement(serializer, content as C)

    fun decode(json: Json, element: JsonElement): C = json.decodeFromJsonElement(serializer, element)

    fun defaultSection(ctx: SectionDefaults.Context, id: String = type.key) = SiteSection(id, enabledByDefault, default(ctx))
}

/** The one place a section type is registered: serializer, strict reader and defaults. */
object SectionRegistry {
    private val specs: Map<SectionType, SectionSpec<*>> = listOf(
        SectionSpec(SectionType.HERO, serializer<HeroContent>(), SectionReaders::hero, SectionDefaults::hero),
        SectionSpec(SectionType.SERVICES, serializer<ServicesContent>(), SectionReaders::services, SectionDefaults::services),
        SectionSpec(SectionType.TEAM, serializer<TeamContent>(), SectionReaders::team, SectionDefaults::team),
        SectionSpec(SectionType.ABOUT, serializer<AboutContent>(), SectionReaders::about, SectionDefaults::about),
        SectionSpec(SectionType.GALLERY, serializer<GalleryContent>(), SectionReaders::gallery, SectionDefaults::gallery),
        SectionSpec(
            SectionType.TESTIMONIALS, serializer<TestimonialsContent>(), SectionReaders::testimonials, SectionDefaults::testimonials,
            enabledByDefault = false,
        ),
        SectionSpec(SectionType.FAQ, serializer<FaqContent>(), SectionReaders::faq, SectionDefaults::faq),
        SectionSpec(SectionType.HOURS, serializer<HoursContent>(), SectionReaders::hours, SectionDefaults::hours),
        SectionSpec(SectionType.CTA, serializer<CtaContent>(), SectionReaders::cta, SectionDefaults::cta),
        SectionSpec(SectionType.CONTACT, serializer<ContactContent>(), SectionReaders::contact, SectionDefaults::contact),
    ).associateBy { it.type }

    init {
        check(specs.keys == SectionType.entries.toSet()) { "Every section type needs a SectionSpec" }
    }

    fun spec(type: SectionType): SectionSpec<*> = specs.getValue(type)
}
