package ie.bookanything.site

import ie.bookanything.ai.AiCaller

/**
 * A request to (re)generate the draft. [current] is the sanitized draft (or the default plan); [caller] identifies
 * the business and user for metering.
 */
data class GenerateRequest(
    val inputs: SiteInputs, val refs: SiteRefs, val current: SitePlan, val prompt: String?, val websiteUrl: String?, val caller: AiCaller,
)

/** A conversational edit of [current] (sanitized draft). */
data class EditRequest(val inputs: SiteInputs, val refs: SiteRefs, val current: SitePlan, val instruction: String, val caller: AiCaller)

enum class GenerationSource(val key: String) { AI("ai"), TEMPLATE("template") }

/** A generated plan (validated), where it came from and an optional note for the owner. */
data class Generation(val plan: SitePlan, val source: GenerationSource, val message: String? = null)

/** Produces site plans for `POST /site/generate` and `POST /site/edit` (section 15.6). */
interface SiteGenerator {
    /** True when a language model is behind this generator (`SiteState.ai.model`). */
    val usesModel: Boolean

    fun generate(request: GenerateRequest): Generation

    fun edit(request: EditRequest): Generation
}

/** The deterministic generator: [DefaultSitePlan] for generation and [SiteRuleEditor] for edits. No network. */
class TemplateSiteGenerator : SiteGenerator {
    override val usesModel = false

    override fun generate(request: GenerateRequest): Generation {
        val plan = PlanCarryOver.apply(request.current, DefaultSitePlan.build(request.inputs, request.prompt))
        return Generation(plan, GenerationSource.TEMPLATE, BUILT_FROM_DATA)
    }

    override fun edit(request: EditRequest): Generation {
        val result = SiteRuleEditor.apply(request.current, request.instruction, request.inputs)
        val notes = result.notes.joinToString(" ")
        val message = if (result.plan == request.current) {
            listOf(notes, "I couldn't find a change to make.", SiteRuleEditor.HELP).filter { it.isNotEmpty() }.joinToString(" ")
        } else {
            listOf("Done: ${result.applied.joinToString(", ")}.", notes).filter { it.isNotEmpty() }.joinToString(" ")
        }
        return Generation(result.plan, GenerationSource.TEMPLATE, message)
    }

    companion object {
        const val BUILT_FROM_DATA = "Built from your services, team, opening hours and policies."
    }
}
