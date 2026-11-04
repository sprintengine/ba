package ie.bookanything.ai.usage

import ie.bookanything.ai.TokenUsage
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.serializer
import java.io.File
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant

/** List prices of one model in US dollars per million tokens (the provider's published unit). */
@Serializable
data class ModelPrice(val input: String, val cacheWrite: String, val cacheRead: String, val output: String) {
    internal val rates: List<BigDecimal> get() = listOf(input, cacheWrite, cacheRead, output).map(::BigDecimal)
}

/** One published price list. Versions are append-only: usage rows record the version they were costed with. */
@Serializable
data class PriceVersion(
    val version: String,
    val effectiveFrom: String,
    /** Model whose prices apply to models missing from [models] (the most expensive one, so nothing is undercharged). */
    val fallbackModel: String,
    val models: Map<String, ModelPrice>,
) {
    val from: Instant get() = Instant.parse(effectiveFrom)

    fun priceOf(model: String): ModelPrice = models[model] ?: models.getValue(fallbackModel)
}

/** The price and version used to cost one call, and the result in micro-cents (1e-6 US cent). */
data class Costed(val version: String, val microCents: Long)

/**
 * Versioned model prices (config: `resources/ai/prices.json`, or `AI_PRICES_FILE`). Pure: costing is exact
 * decimal arithmetic, rounded half-up to whole micro-cents.
 */
class PriceTable(versions: List<PriceVersion>) {
    val versions: List<PriceVersion> = versions.sortedBy { it.from }

    init {
        require(this.versions.isNotEmpty()) { "The AI price table needs at least one version." }
        this.versions.forEach { v ->
            require(v.fallbackModel in v.models) { "Price version ${v.version}: fallback model ${v.fallbackModel} has no price." }
        }
    }

    /** The version in force at [at] (the earliest one for instants before every version). */
    fun versionAt(at: Instant): PriceVersion = versions.lastOrNull { !it.from.isAfter(at) } ?: versions.first()

    fun cost(model: String, usage: TokenUsage, at: Instant): Costed {
        val version = versionAt(at)
        return Costed(version.version, Cost.microCents(usage, version.priceOf(model)))
    }

    companion object {
        private val json = Json { ignoreUnknownKeys = true }

        @Serializable
        private data class PriceFile(val versions: List<PriceVersion>)

        fun parse(text: String): PriceTable = PriceTable(json.decodeFromString(serializer<PriceFile>(), text).versions)

        /** The bundled table, or [file] when given (`AI_PRICES_FILE`). */
        fun load(file: String? = null): PriceTable = parse(
            file?.let { File(it).readText() }
                ?: PriceTable::class.java.getResource("/ai/prices.json")!!.readText(),
        )
    }
}

object Cost {
    /** Dollars per million tokens × 100 = micro-cents per token. */
    private val DOLLARS_PER_MTOK_TO_MICRO_CENTS_PER_TOKEN = BigDecimal(100)

    fun microCents(usage: TokenUsage, price: ModelPrice): Long {
        val tokens = listOf(usage.input, usage.cacheWrite, usage.cacheRead, usage.output)
        val total = tokens.zip(price.rates).fold(BigDecimal.ZERO) { sum, (n, rate) -> sum + BigDecimal(n) * rate }
        return (total * DOLLARS_PER_MTOK_TO_MICRO_CENTS_PER_TOKEN).setScale(0, RoundingMode.HALF_UP).longValueExact()
    }
}
