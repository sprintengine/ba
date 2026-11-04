package ie.bookanything.ai.fake

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.io.File

/**
 * A script for [ScriptedModelClient]: rules matched against the latest user message, each a sequence of steps (one
 * model reply per step). Development and tests only; see `resources/ai/fake-scripts/demo.json`.
 *
 * Step strings may use placeholders: `${today}` / `${tomorrow}` (from the context block's "Today:" line) and
 * `${tool_name.path}` (the latest result of that tool, e.g. `${list_services.services[0].id}`; `[*]` joins a list
 * with ", "). A string that is exactly one placeholder takes the referenced JSON value (number, object, null).
 */
@Serializable
data class FakeScript(val rules: List<FakeRule>) {
    /** The first rule with a keyword contained in [userText] (case-insensitive), else the first `*` rule. */
    fun ruleFor(userText: String): FakeRule? {
        val text = userText.lowercase()
        return rules.firstOrNull { r -> r.match.any { it != "*" && text.contains(it.lowercase()) } }
            ?: rules.firstOrNull { "*" in it.match }
    }

    companion object {
        private val json = Json { ignoreUnknownKeys = false }

        fun parse(text: String): FakeScript = json.decodeFromString<FakeScript>(text)

        /** `demo` (bundled) or a path to a JSON file. */
        fun load(ref: String): FakeScript = parse(
            if (ref == "demo") FakeScript::class.java.getResource("/ai/fake-scripts/demo.json")!!.readText() else File(ref).readText(),
        )
    }
}

@Serializable
data class FakeRule(val match: List<String>, val steps: List<FakeStep>)

@Serializable
data class FakeStep(
    val text: String? = null,
    val tools: List<FakeToolCall> = emptyList(),
    /** `end_turn` (default, or `tool_use` when [tools] is non-empty), `refusal` or `max_tokens`. */
    val stopReason: String? = null,
    val usage: FakeUsage? = null,
    /** Waits this long before answering, streaming the text in pieces meanwhile (to see thinking and streaming in the UI). */
    val delayMs: Long = 0,
)

@Serializable
data class FakeToolCall(val name: String, val input: JsonObject)

@Serializable
data class FakeUsage(val input: Long = 0, val cacheWrite: Long = 0, val cacheRead: Long = 0, val output: Long = 0)

/** Placeholder resolution for [FakeStep] values. Pure. */
object FakeTemplates {
    private val PLACEHOLDER = Regex("""\$\{([^}]+)}""")
    private val SEGMENT = Regex("""([^.\[\]]+)|\[(\d+|\*)]""")

    fun resolve(value: JsonElement, lookup: (String) -> JsonElement?): JsonElement = when (value) {
        is JsonObject -> JsonObject(value.mapValues { resolve(it.value, lookup) })
        is JsonArray -> JsonArray(value.map { resolve(it, lookup) })
        is JsonPrimitive -> if (value.isString) resolveString(value.content, lookup) else value
        JsonNull -> JsonNull
    }

    fun resolveString(text: String, lookup: (String) -> JsonElement?): JsonElement {
        val whole = PLACEHOLDER.matchEntire(text)
        if (whole != null) return lookup(whole.groupValues[1]) ?: JsonNull
        return JsonPrimitive(PLACEHOLDER.replace(text) { m -> lookup(m.groupValues[1])?.let(::plain).orEmpty() })
    }

    /** Follows `a.b[0].c` / `items[*].name` into [root]. */
    fun path(root: JsonElement, path: String): JsonElement? {
        var current: List<JsonElement> = listOf(root)
        var spread = false
        for (m in SEGMENT.findAll(path)) {
            val key = m.groupValues[1]
            val index = m.groupValues[2]
            current = current.flatMap { el ->
                when {
                    key.isNotEmpty() -> listOfNotNull((el as? JsonObject)?.get(key))
                    index == "*" -> { spread = true; (el as? JsonArray)?.toList().orEmpty() }
                    else -> listOfNotNull((el as? JsonArray)?.getOrNull(index.toInt()))
                }
            }
        }
        return when {
            spread -> JsonPrimitive(current.map(::plain).distinct().joinToString(", "))
            else -> current.firstOrNull()
        }
    }

    private fun plain(e: JsonElement): String = if (e is JsonPrimitive) e.content else e.toString()
}
