package ie.bookanything.ai

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * The one JSON Schema builder: Bo's tools, the structured-output schemas (business draft, site builder) and the MCP
 * tool schemas are all built from these primitives.
 *
 * - Strict schemas (Bo's tools, structured outputs): [obj] with `vararg` properties requires every property and forbids
 *   additional ones; optional values are [nullable] (`["string", "null"]`) rather than omitted. No min/max/format.
 * - MCP tool schemas: optional properties are omitted from `required` ([obj] with an explicit list), and may carry
 *   `format`, `enum`, `minimum` and `maximum`.
 *
 * Keys are written in a fixed order, so the serialized schemas are deterministic: Bo's tool list sits in the cached prompt
 * prefix and MCP clients see the tool schemas (both pinned by `SchemaSnapshotTest`). Note the two string-enum shapes:
 * [enum] writes `type, enum, description`; [string] with `enum` writes `type, description, format, enum`.
 */
object JsonSchema {
    /** A strict object: every property is required and no others are allowed. */
    fun obj(vararg props: Pair<String, JsonObject>): JsonObject = obj(props.toList(), required = props.map { it.first })

    /** An object with [properties] of which [required] must be present (the rest are optional); no others are allowed. */
    fun obj(properties: List<Pair<String, JsonObject>>, required: List<String>, description: String? = null): JsonObject =
        JsonObject(
            linkedMapOf<String, JsonElement>("type" to JsonPrimitive("object")).apply {
                description?.let { put("description", JsonPrimitive(it)) }
                put("properties", properties(properties))
                put("required", strings(required))
                put("additionalProperties", JsonPrimitive(false))
            },
        )

    /** A property map in the given order. */
    fun properties(properties: List<Pair<String, JsonObject>>): JsonObject = JsonObject(linkedMapOf(*properties.toTypedArray()))

    fun string(description: String, format: String? = null, enum: List<String>? = null) =
        typed("string", description).with("format" to format?.let(::JsonPrimitive), "enum" to enum?.let(::strings))

    fun integer(description: String, min: Int? = null, max: Int? = null) =
        typed("integer", description).with("minimum" to min?.let(::JsonPrimitive), "maximum" to max?.let(::JsonPrimitive))

    fun number(description: String, min: Double? = null, max: Double? = null) =
        typed("number", description).with("minimum" to min?.let(::JsonPrimitive), "maximum" to max?.let(::JsonPrimitive))

    fun boolean(description: String) = typed("boolean", description)

    fun enum(values: Collection<String>, description: String) = JsonObject(
        mapOf("type" to JsonPrimitive("string"), "enum" to strings(values), "description" to JsonPrimitive(description)),
    )

    fun array(items: JsonObject, description: String) = JsonObject(
        mapOf("type" to JsonPrimitive("array"), "items" to items, "description" to JsonPrimitive(description)),
    )

    /** A list of plain strings (`type, description, items`). */
    fun stringList(description: String) = typed("array", description).with("items" to type("string"))

    /** An object mapping any key to a string. */
    fun stringMap(description: String) = typed("object", description).with("additionalProperties" to type("string"))

    /** The same schema, also accepting null. */
    fun nullable(schema: JsonObject): JsonObject {
        val enum = schema["enum"] as? JsonArray
        val type = schema["type"]
        return JsonObject(
            schema + buildMap {
                put("type", JsonArray(listOf(type!!, JsonPrimitive("null"))))
                if (enum != null) put("enum", JsonArray(enum + JsonPrimitive(null as String?)))
            },
        )
    }

    private fun type(type: String) = JsonObject(mapOf("type" to JsonPrimitive(type)))

    private fun typed(type: String, description: String) =
        JsonObject(mapOf("type" to JsonPrimitive(type), "description" to JsonPrimitive(description)))

    private fun strings(values: Collection<String>) = JsonArray(values.map(::JsonPrimitive))

    /** [this] with [keywords] appended in order; null values are left out. */
    private fun JsonObject.with(vararg keywords: Pair<String, JsonElement?>): JsonObject {
        val extra = keywords.mapNotNull { (k, v) -> v?.let { k to it } }
        return if (extra.isEmpty()) this else JsonObject(this + extra)
    }
}
