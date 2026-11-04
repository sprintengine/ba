package ie.bookanything.site

import ie.bookanything.http.ApiJson
import ie.bookanything.http.Validator
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.serializer

/**
 * What a plan may reference for one business: its services, its active `person` resources and
 * the URL prefix of its uploaded images (null when uploads are off).
 */
data class SiteRefs(val serviceIds: Set<String>, val personIds: Set<String>, val uploadPrefix: String?)

/**
 * Strict decoding and validation of a site plan (docs/architecture.md section 15.4), identical for
 * owner input, AI output, restores and seeds. Unknown fields, themes, section types, variants and
 * patterns are errors with the field path (`sections[2].content.rating`); missing optional fields
 * get their defaults; text is trimmed and normalized. The result is the normalized plan.
 */
class SiteValidator(private val refs: SiteRefs) {

    /** Parses [element] or throws 400 INVALID_REQUEST with every problem by field path. */
    fun parse(element: JsonElement?): SitePlan {
        val v = Validator()
        val plan = read(element, v)
        v.throwIfInvalid("The site plan is invalid.")
        return plan!!
    }

    /** Validates a typed plan exactly like client input and returns it normalized. */
    fun check(plan: SitePlan): SitePlan = parse(encode(plan))

    /** Field problems of [plan]; empty when it is valid. */
    fun problems(plan: SitePlan): Map<String, String> = Validator().also { read(encode(plan), it) }.errors()

    private fun encode(plan: SitePlan) = ApiJson.encodeToJsonElement(serializer<SitePlan>(), plan)

    private fun read(element: JsonElement?, v: Validator): SitePlan? {
        val root = PlanNode(element as? JsonObject ?: run { v.error("plan", "Must be an object"); return null }, "", v, refs)
        root.allow("theme", "palette", "seo", "sections")
        val theme = root.choice("theme", SiteTheme.entries)
        val palette = root.child("palette", required = true)?.let(::palette)
        val seo = root.child("seo")?.let(::seo) ?: SiteSeo()
        val sections = sections(root, v)
        if (theme == null || palette == null || sections == null) return null
        return SitePlan(theme, palette, seo, sections)
    }

    private fun palette(p: PlanNode): SitePalette? {
        p.allow("primaryColor", "accent")
        val primary = p.color("primaryColor", required = true)
        primary?.let(ColorContrast::primaryProblem)?.let { p.error("primaryColor", it) }
        val accent = p.color("accent", required = false)
        accent?.let(ColorContrast::accentProblem)?.let { p.error("accent", it) }
        return primary?.let { SitePalette(it, accent) }
    }

    private fun seo(s: PlanNode): SiteSeo {
        s.allow("title", "description")
        return SiteSeo(s.text("title", 70), s.text("description", 160))
    }

    private fun sections(root: PlanNode, v: Validator): List<SiteSection>? {
        val nodes = root.children("sections", max = MAX_SECTIONS)
        val ids = HashSet<String>()
        var heroes = 0
        val sections = nodes.mapNotNull { s ->
            s.allow("id", "type", "enabled", "content")
            val id = s.text("id", 40, required = true)
            when {
                id == null -> Unit
                !SECTION_ID.matches(id) -> s.error("id", "Use 1 to 40 lowercase letters, digits or hyphens")
                !ids.add(id) -> s.error("id", "Another section already uses this id")
            }
            val type = s.choice("type", SectionType.entries)
            if (type == SectionType.HERO && ++heroes > 1) s.error("type", "Only one hero section is allowed")
            val enabled = s.bool("enabled", true)
            val content = s.child("content", emptyWhenMissing = true)
            val parsed = if (type != null && content != null) SectionRegistry.spec(type).read(content) else null
            if (id != null && parsed != null) SiteSection(id, enabled, parsed) else null
        }
        return sections.takeIf { v.isValid }
    }

    companion object {
        const val MAX_SECTIONS = 16
        val SECTION_ID = Regex("^[a-z0-9-]{1,40}$")
    }
}
