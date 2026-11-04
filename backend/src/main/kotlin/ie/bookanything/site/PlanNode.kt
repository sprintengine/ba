package ie.bookanything.site

import ie.bookanything.http.Validator
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull

/**
 * A JSON object inside a site plan with typed readers that record every problem on [v] under its
 * field path (`sections[2].content.items[0].question`). Readers return null when a value is invalid.
 */
class PlanNode(private val obj: JsonObject, private val path: String, val v: Validator, val refs: SiteRefs) {
    fun p(key: String) = if (path.isEmpty()) key else "$path.$key"
    fun error(key: String, message: String) = v.error(p(key), message)
    fun has(key: String) = obj[key] != null && obj[key] !is JsonNull

    /** Unknown fields (e.g. `rating`, `price`) are errors, never silently dropped. */
    fun allow(vararg keys: String) {
        obj.keys.filter { it !in keys }.forEach { v.error(p(it), "Unknown field") }
    }

    /**
     * A text field. Missing → [default] (or "Required" when [required] and there is no default);
     * explicit null or blank → null (or "Required"). Control characters are rejected.
     */
    fun text(key: String, max: Int, required: Boolean = false, default: String? = null, multiline: Boolean = false): String? {
        val el = obj[key]
        return when {
            el == null && default != null -> default
            el == null || el is JsonNull -> null.also { if (required) error(key, "Required") }
            el !is JsonPrimitive || !el.isString -> null.also { error(key, "Must be a string") }
            else -> cleanText(key, el.content, max, required, multiline)
        }
    }

    fun cleanText(key: String, raw: String, max: Int, required: Boolean = true, multiline: Boolean = false): String? {
        val s = SiteText.clean(raw, multiline) ?: run { error(key, "Contains invalid characters"); return null }
        if (s.isEmpty()) {
            if (required) error(key, "Required")
            return null
        }
        if (s.length > max) { error(key, "Must be at most $max characters"); return null }
        return s
    }

    fun bool(key: String, default: Boolean): Boolean {
        val el = obj[key] ?: return default
        return (el as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull ?: run { error(key, "Must be true or false"); default }
    }

    /** One of [entries] by key; missing → [default] (or "Required" without one). */
    fun <E : KeyedValue> choice(key: String, entries: List<E>, default: E? = null): E? {
        val el = obj[key]
        if (el == null && default != null) return default
        if (el == null || el is JsonNull) { error(key, "Required"); return null }
        val raw = (el as? JsonPrimitive)?.takeIf { it.isString }?.content
        return entries.firstOrNull { it.key == raw } ?: run { error(key, "Must be one of: ${entries.joinToString(", ") { it.key }}"); null }
    }

    fun color(key: String, required: Boolean): String? {
        val raw = text(key, 7, required = required) ?: return null
        if (!Validator.COLOR.matches(raw)) { error(key, "Must be a hex colour like #4f46e5"); return null }
        return raw.lowercase()
    }

    /** A nested object; missing → null (or an empty node when [emptyWhenMissing]). */
    fun child(key: String, required: Boolean = false, emptyWhenMissing: Boolean = false): PlanNode? {
        val el = obj[key]
        if (el == null) {
            if (required) error(key, "Required")
            return if (emptyWhenMissing) PlanNode(JsonObject(emptyMap()), p(key), v, refs) else null
        }
        if (el is JsonNull) {
            if (required || emptyWhenMissing) error(key, "Must be an object")
            return null
        }
        return (el as? JsonObject)?.let { PlanNode(it, p(key), v, refs) } ?: run { error(key, "Must be an object"); null }
    }

    fun list(key: String, max: Int): List<JsonElement> {
        val el = obj[key] ?: return emptyList()
        val items = (el as? JsonArray)?.toList() ?: run { error(key, "Must be a list"); return emptyList() }
        if (items.size > max) error(key, "At most $max items")
        return items
    }

    fun children(key: String, max: Int): List<PlanNode> = list(key, max).mapIndexedNotNull { i, el ->
        (el as? JsonObject)?.let { PlanNode(it, p("$key[$i]"), v, refs) } ?: run { error("$key[$i]", "Must be an object"); null }
    }

    /** A list of strings; [check] sees each item with its path. */
    fun strings(key: String, max: Int, check: (path: String, value: String) -> String? = { _, s -> s }): List<String> =
        list(key, max).mapIndexedNotNull { i, el ->
            val s = (el as? JsonPrimitive)?.takeIf { it.isString }?.content
            if (s == null) { error("$key[$i]", "Must be a string"); null } else check("$key[$i]", s)
        }

    fun image(key: String): SiteImage? {
        val el = obj[key] ?: return null
        if (el is JsonNull) return null
        return PlanImageRules.read(this, key, el)
    }
}
