package ie.bookanything.support

import ie.bookanything.ai.AiFeature
import ie.bookanything.ai.usage.AiAllowances
import ie.bookanything.ai.usage.CreditValue
import ie.bookanything.ai.usage.ReservationEstimates
import ie.bookanything.config.AiConfig
import java.util.Locale

/**
 * The AI credit terms tests run with: the configuration's development placeholders. Tests derive amounts from these
 * rather than restating what a credit is worth or how many each plan gets.
 */
object TestCredits {
    private val config = AiConfig()
    val value: CreditValue = config.creditValue
    val allowances: AiAllowances = config.allowances

    /** [credits] in micro-cents. */
    fun micro(credits: Long): Long = value.toMicroCents(credits)

    /** [microCents] as the API shows credits, e.g. "201.8". */
    fun shown(microCents: Long): String = value.of(microCents).toString()

    /** [credits] as limit messages write them, e.g. "1,000". */
    fun grouped(credits: Long): String = "%,d".format(Locale.ROOT, credits)

    /** The reservation for one call of [feature] (micro-cents). */
    fun estimate(feature: AiFeature = AiFeature.ASSISTANT): Long = ReservationEstimates.of(feature)
}
