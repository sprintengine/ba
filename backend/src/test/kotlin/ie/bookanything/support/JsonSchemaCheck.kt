package ie.bookanything.support

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.longOrNull

/**
 * Validates JSON against the JSON Schema subset our MCP output schemas use (`type`, `properties`, `required`, `items`,
 * `enum`, `additionalProperties`), as an MCP client does with a tool's `structuredContent`. A keyword it doesn't know
 * fails the check, so a schema can't use something unchecked here.
 */
object JsonSchemaCheck {
    private val KNOWN = setOf("type", "properties", "required", "items", "enum", "additionalProperties", "description")

    /** The problems with [value] against [schema] (empty when it validates), each with its JSON path. */
    fun problems(schema: JsonObject, value: JsonElement, path: String = "$"): List<String> {
        val unknown = schema.keys - KNOWN
        if (unknown.isNotEmpty()) return listOf("$path: schema uses unchecked keywords $unknown")
        val types = when (val t = schema["type"]) {
            null -> null
            is JsonPrimitive -> listOf(t.content)
            is JsonArray -> t.map { (it as JsonPrimitive).content }
            else -> return listOf("$path: bad type $t")
        }
        if (types != null && types.none { matches(it, value) }) return listOf("$path: expected $types, got ${describe(value)}")
        val out = mutableListOf<String>()
        (schema["enum"] as? JsonArray)?.let { if (value !in it) out += "$path: $value is not one of $it" }
        if (value is JsonObject) out += objectProblems(schema, value, path)
        if (value is JsonArray) {
            (schema["items"] as? JsonObject)?.let { items -> value.forEachIndexed { i, v -> out += problems(items, v, "$path[$i]") } }
        }
        return out
    }

    private fun objectProblems(schema: JsonObject, value: JsonObject, path: String): List<String> {
        val out = mutableListOf<String>()
        val properties = schema["properties"] as? JsonObject ?: JsonObject(emptyMap())
        (schema["required"] as? JsonArray)?.forEach { r ->
            val name = (r as JsonPrimitive).content
            if (name !in value) out += "$path: missing required $name"
        }
        for ((k, v) in value) {
            val sub = properties[k] as? JsonObject
            when {
                sub != null -> out += problems(sub, v, "$path.$k")
                schema["additionalProperties"] is JsonObject -> out += problems(schema["additionalProperties"] as JsonObject, v, "$path.$k")
                (schema["additionalProperties"] as? JsonPrimitive)?.booleanOrNull == false -> out += "$path: unexpected property $k"
            }
        }
        return out
    }

    private fun matches(type: String, v: JsonElement): Boolean = when (type) {
        "null" -> v is JsonNull
        "object" -> v is JsonObject
        "array" -> v is JsonArray
        "string" -> v is JsonPrimitive && v !is JsonNull && v.isString
        "boolean" -> v is JsonPrimitive && !v.isString && v.booleanOrNull != null
        "integer" -> v is JsonPrimitive && !v.isString && v.longOrNull != null
        "number" -> v is JsonPrimitive && !v.isString && v.doubleOrNull != null
        else -> false
    }

    private fun describe(v: JsonElement) = when {
        v is JsonNull -> "null"
        v is JsonObject -> "an object"
        v is JsonArray -> "an array"
        (v as JsonPrimitive).isString -> "a string"
        else -> v.content
    }
}
