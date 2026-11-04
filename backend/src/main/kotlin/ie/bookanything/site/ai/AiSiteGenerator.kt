package ie.bookanything.site.ai

import ie.bookanything.ai.AiCaller
import ie.bookanything.ai.AiModel
import ie.bookanything.ai.StructuredOutcome
import ie.bookanything.ai.StructuredRequest
import ie.bookanything.ai.completeStructured
import ie.bookanything.site.EditRequest
import ie.bookanything.site.GenerateRequest
import ie.bookanything.site.Generation
import ie.bookanything.site.GenerationSource
import ie.bookanything.site.PlanCarryOver
import ie.bookanything.site.SiteGenerator
import ie.bookanything.site.SiteInputs
import ie.bookanything.site.SitePlan
import ie.bookanything.site.SiteRefs
import ie.bookanything.site.SiteValidator
import ie.bookanything.templates.WebsiteFetcher
import kotlinx.serialization.serializer
import org.slf4j.LoggerFactory

/**
 * AI site generation and conversational edits (section 15.6) through the shared [AiModel]. The
 * model's plan is repaired ([AiPlanMapper]), owner content carried over ([PlanCarryOver]) and then
 * validated exactly like owner input. Refusals, truncation, errors and invalid output fall back to
 * [fallback] (the template generator or rule-based editor) with the reason logged.
 */
class AiSiteGenerator(
    private val model: AiModel,
    private val fetcher: WebsiteFetcher,
    private val fallback: SiteGenerator,
) : SiteGenerator {
    private val log = LoggerFactory.getLogger(AiSiteGenerator::class.java)

    override val usesModel = true

    override fun generate(request: GenerateRequest): Generation {
        val website = request.websiteUrl?.let(fetcher::fetchText)
        val output = call(request.caller, SiteAiPrompt.generate(request.inputs, request.prompt, request.websiteUrl, website), "generate")
        val plan = output?.let { finish(it, request.inputs, request.refs, request.current, "generate") }
            ?: return fallback.generate(request).copy(message = GENERATE_FALLBACK)
        return Generation(plan, GenerationSource.AI)
    }

    override fun edit(request: EditRequest): Generation {
        val output = call(request.caller, SiteAiPrompt.edit(request.inputs, request.current, request.instruction), "edit")
        val plan = output?.let { finish(it, request.inputs, request.refs, request.current, "edit") }
        if (plan == null) {
            val g = fallback.edit(request)
            return g.copy(message = listOfNotNull(EDIT_FALLBACK, g.message).joinToString(" "))
        }
        return Generation(plan, GenerationSource.AI, if (plan == request.current) "No changes were needed for that request." else null)
    }

    private fun call(caller: AiCaller, user: String, what: String): AiSiteOutput? = when (
        val outcome = model.completeStructured(
            caller, StructuredRequest(SiteAiPrompt.SYSTEM, user, SiteAiSchema.schema), serializer<AiSiteOutput>(),
        )
    ) {
        is StructuredOutcome.Output -> outcome.value
        is StructuredOutcome.Unusable -> failed(what, outcome.reason)
    }

    private fun finish(output: AiSiteOutput, inputs: SiteInputs, refs: SiteRefs, current: SitePlan, what: String): SitePlan? {
        val plan = PlanCarryOver.apply(current, AiPlanMapper(inputs, refs, current).toPlan(output))
        if (plan.sections.isEmpty()) return failed(what, "output had no usable sections")
        val validator = SiteValidator(refs)
        val problems = validator.problems(plan)
        if (problems.isNotEmpty()) {
            return failed(
                what, "output failed validation: ${problems.entries.take(5).joinToString { "${it.key} ${it.value}" }}",
            )
        }
        return validator.check(plan)
    }

    private fun <T> failed(what: String, reason: String): T? {
        log.warn("AI site {} fell back to the built-in generator: {}", what, reason)
        return null
    }

    companion object {
        const val GENERATE_FALLBACK = "The AI assistant couldn't build your site this time, so it was built from your services, team, " +
            "opening hours and policies instead."
        const val EDIT_FALLBACK = "The AI assistant couldn't make this change, so the built-in editor handled it."
    }
}
