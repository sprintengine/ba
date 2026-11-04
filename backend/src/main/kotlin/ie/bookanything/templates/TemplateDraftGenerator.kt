package ie.bookanything.templates

/**
 * Fallback generator: picks the template whose keywords best match the description.
 * [AnthropicDraftGenerator] implements the same interface and falls back to this one.
 */
class TemplateDraftGenerator : BusinessDraftGenerator {
    override fun generate(request: BusinessDraftRequest, userId: java.util.UUID?): BusinessSetup {
        val text = request.description.lowercase()
        val best = Templates.all.maxByOrNull { t -> t.keywords.sumOf { kw -> if (text.contains(kw)) kw.length else 0 } }
            ?.takeIf { t -> t.keywords.any { text.contains(it) } }
            ?: Templates.byKey("generic")!!
        val nameGuess = guessName(request.description)
        return best.setup.copy(
            source = "template",
            name = nameGuess ?: best.setup.name,
            slug = null,
            description = request.description.trim().take(500).ifEmpty { best.setup.description },
            branding = best.setup.branding,
        )
    }

    /** "We are Bright Smile Dental, a ..." → "Bright Smile Dental" (best effort, conservative). */
    private fun guessName(description: String): String? {
        val m = Regex(
            "(?:[Ww]e are|[Ww]e're|I run|I own|[Cc]alled|[Nn]amed)\\s+([A-Z][\\w'&-]*(?:\\s+[A-Z][\\w'&-]*){0,4})",
        ).find(description)
        return m?.groupValues?.get(1)?.trim()?.takeIf { it.length in 3..80 }
    }
}
