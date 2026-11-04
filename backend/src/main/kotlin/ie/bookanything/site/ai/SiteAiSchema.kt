package ie.bookanything.site.ai

import ie.bookanything.ai.JsonSchema.array
import ie.bookanything.ai.JsonSchema.boolean
import ie.bookanything.ai.JsonSchema.enum
import ie.bookanything.ai.JsonSchema.obj
import ie.bookanything.ai.JsonSchema.string
import ie.bookanything.site.GeneratedPattern
import ie.bookanything.site.HeroVariant
import ie.bookanything.site.SectionType
import ie.bookanything.site.SiteTheme
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/**
 * Structured-output schema for site plans: one flat section shape for every type (fields a type
 * doesn't use are "" or []), every property required, no min/max/pattern keywords, so it stays
 * within structured-output limits. [AiPlanMapper] maps it back to a typed plan.
 */
object SiteAiSchema {
    private val section = obj(
        "id" to string("Existing section id to keep it, or \"\" for a new section"),
        "type" to enum(SectionType.entries.map { it.key }, "Section type"),
        "enabled" to boolean("Shown on the page"),
        "variant" to enum(listOf("") + HeroVariant.entries.map { it.key }, "hero: layout; other types: \"\""),
        "eyebrow" to string("hero: short line above the headline (≤ 60), else \"\""),
        "headline" to string("hero (≤ 90) and cta (≤ 90): headline, else \"\""),
        "subheadline" to string("hero: one or two sentences (≤ 240), else \"\""),
        "heading" to string("services, team, about, gallery, testimonials, faq, hours, contact: section heading (≤ 80), else \"\""),
        "intro" to string("services and team: short intro (≤ 300), else \"\""),
        "body" to string(
            "about: text (≤ 1500, paragraphs separated by a blank line); cta (≤ 240) and contact (≤ 300): short text; hours: short note " +
                "(≤ 200); else \"\"",
        ),
        "ctaLabel" to string("hero: button label; cta: button label (≤ 30), else \"\""),
        "highlights" to array(string("≤ 60 characters"), "about: up to 4 short true highlights, else []"),
        "faq" to array(
            obj("question" to string("≤ 140"), "answer" to string("≤ 600")),
            "faq: questions and answers based only on the facts given, else []",
        ),
        "serviceIds" to array(
            string("a service id from the list given"), "services: ids to show in order ([] = all public services), else []",
        ),
        "team" to array(
            obj("resourceId" to string("a team member id from the list given"), "bio" to string("≤ 400, \"\" for none")),
            "team: people to show with short bios ([] = everyone), else []",
        ),
        "pattern" to enum(listOf("") + GeneratedPattern.entries.map { it.key }, "hero and about: generated background pattern, else \"\""),
        "showPrices" to boolean("services: show prices from the booking system"),
    )

    val schema: JsonObject = obj(
        "theme" to enum(SiteTheme.entries.map { it.key }, "Visual theme"),
        "primaryColor" to string("Brand colour, hex like #0f766e, dark enough for white button text"),
        "accentColor" to string("Optional accent colour, hex, or \"\" for none"),
        "seoTitle" to string("Page title for search engines (≤ 70)"),
        "seoDescription" to string("Search result description (≤ 160)"),
        "sections" to array(section, "The page, top to bottom: at most 16 sections and at most one hero"),
    )
}

// ---- The model's output, parsed leniently (unknown keys such as "testimonials" or "rating" are ignored) ----

@Serializable data class AiFaqItem(val question: String = "", val answer: String = "")
@Serializable data class AiTeamMember(val resourceId: String = "", val bio: String = "")

@Serializable
data class AiSection(
    val id: String = "", val type: String = "", val enabled: Boolean = true, val variant: String = "", val eyebrow: String = "",
    val headline: String = "", val subheadline: String = "", val heading: String = "", val intro: String = "", val body: String = "",
    val ctaLabel: String = "", val highlights: List<String> = emptyList(), val faq: List<AiFaqItem> = emptyList(),
    val serviceIds: List<String> = emptyList(), val team: List<AiTeamMember> = emptyList(), val pattern: String = "",
    val showPrices: Boolean = true,
)

@Serializable
data class AiSiteOutput(
    val theme: String = "", val primaryColor: String = "", val accentColor: String = "", val seoTitle: String = "",
    val seoDescription: String = "", val sections: List<AiSection> = emptyList(),
)
