package ie.bookanything.templates

import ie.bookanything.ai.AiCaller
import ie.bookanything.ai.AiFeature
import ie.bookanything.ai.AiModel
import ie.bookanything.ai.StructuredOutcome
import ie.bookanything.ai.StructuredRequest
import ie.bookanything.ai.completeStructured
import ie.bookanything.business.SetupInstaller
import kotlinx.serialization.serializer
import org.slf4j.LoggerFactory
import java.util.UUID

/**
 * AI business draft (docs/architecture.md section 9). Asks the model for a complete, bookable
 * [BusinessSetup], repairs obviously wrong values and validates the result exactly like user
 * input. Any refusal, truncation, error or invalid output falls back to [fallback] (the template
 * generator) with the reason logged.
 */
class AnthropicDraftGenerator(
    private val model: AiModel,
    private val fetcher: WebsiteFetcher = SafeWebsiteFetcher(),
    private val fallback: BusinessDraftGenerator = TemplateDraftGenerator(),
) : BusinessDraftGenerator {
    private val log = LoggerFactory.getLogger(AnthropicDraftGenerator::class.java)

    override fun generate(request: BusinessDraftRequest, userId: UUID?): BusinessSetup {
        val website = request.websiteUrl?.takeIf { it.isNotBlank() }?.let { fetcher.fetchText(it) }
        // Before a business exists the draft is metered against the user only (no allowance applies).
        val outcome = model.completeStructured(
            AiCaller(AiFeature.BUSINESS_DRAFT, businessId = null, userId = userId),
            StructuredRequest(DraftPrompt.SYSTEM, DraftPrompt.user(request.description, request.websiteUrl, website), DraftSchema.schema),
            serializer<AiSetup>(),
        )
        val reason = when (outcome) {
            is StructuredOutcome.Unusable -> outcome.reason
            is StructuredOutcome.Output -> {
                val setup = DraftRepair.toSetup(outcome.value, request)
                when {
                    setup == null -> "output had no usable resources or services"
                    !SetupInstaller.validate(setup).isValid -> "output failed validation"
                    else -> return setup
                }
            }
        }
        return fallback(request, reason)
    }

    private fun fallback(request: BusinessDraftRequest, reason: String): BusinessSetup {
        log.warn("AI business draft fell back to templates: {}", reason)
        return fallback.generate(request)
    }
}
