package ie.bookanything.ai

import ie.bookanything.ai.usage.AiMeter
import ie.bookanything.ai.usage.AiOverage
import ie.bookanything.ai.usage.AiOverageJob
import ie.bookanything.ai.usage.AiOverageReporter
import ie.bookanything.ai.usage.AiUsageService
import ie.bookanything.ai.usage.MeteredAiModel
import ie.bookanything.ai.usage.PriceTable
import ie.bookanything.config.AiConfig
import ie.bookanything.db.Db
import java.time.Clock

/**
 * The model seam as features see it (docs/architecture.md section 16): one credit [meter] and the metered [model]
 * every AI feature uses, never the raw [ModelClient]. [model] is null when no model is configured.
 */
class AiModule(
    db: Db,
    clock: Clock,
    config: AiConfig,
    prices: PriceTable,
    modelClient: ModelClient?,
    /** Where overage is reported (Stripe Billing Meters); null keeps the allowance a hard limit. */
    overageReporter: AiOverageReporter?,
) {
    private val overage = overageReporter?.takeIf { config.overageMeterEvent != null }
    val meter = AiMeter(
        db, clock, prices, config.creditValue, config.allowances, AiOverage(overage, config.overageMaxCredits, config.creditValue),
    )
    val model: AiModel? = modelClient?.let { MeteredAiModel(it, meter) }
    val usage = AiUsageService(db, clock, meter, model)
    val overageJob = AiOverageJob(db, clock, overage, config.creditValue)
}
