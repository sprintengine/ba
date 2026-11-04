package ie.bookanything.support

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.fail

/** Keywords strict tools and structured outputs don't support. */
private val UNSUPPORTED = listOf("minimum", "maximum", "minLength", "maxLength", "pattern", "minItems", "maxItems", "format")

/**
 * The rules for strict tool schemas and structured outputs: every object requires all its properties and forbids
 * others, every schema has a type, and no unsupported keyword is used anywhere.
 */
fun assertStrictSchema(node: JsonElement, path: String = "$") {
    when (node) {
        is JsonObject -> {
            val types = when (val type = node["type"]) {
                is JsonArray -> type.map { it.jsonPrimitive.content }
                is JsonPrimitive -> listOf(type.content)
                else -> emptyList()
            }
            if (types.isEmpty() && node.containsKey("properties")) fail("$path has properties but no type")
            if ("object" in types) {
                assertEquals(JsonPrimitive(false), node["additionalProperties"], "$path must forbid additional properties")
                assertEquals(
                    (node["properties"] as JsonObject).keys, (node["required"] as JsonArray).map { it.jsonPrimitive.content }.toSet(),
                    "$path must require every property",
                )
            }
            if (types.isNotEmpty()) UNSUPPORTED.forEach { assertNull(node[it], "$path uses unsupported $it") }
            node.forEach { (key, value) ->
                if (key == "properties" && value is JsonObject) {
                    value.forEach { (name, schema) -> assertStrictSchema(schema, "$path.$name") }
                } else {
                    assertStrictSchema(value, "$path.$key")
                }
            }
        }
        is JsonArray -> node.forEach { assertStrictSchema(it, path) }
        else -> Unit
    }
}
