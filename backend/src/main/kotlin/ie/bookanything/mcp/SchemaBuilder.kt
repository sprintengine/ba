package ie.bookanything.mcp

import ie.bookanything.ai.JsonSchema
import io.modelcontextprotocol.kotlin.sdk.types.ToolSchema
import kotlinx.serialization.json.JsonObject

/** Collects the properties of an MCP tool input schema (`type: object`); optional properties are left out of `required`. */
class SchemaBuilder {
    internal val properties = mutableListOf<Pair<String, JsonObject>>()

    private fun prop(name: String, schema: JsonObject) { properties += name to schema }

    fun string(name: String, description: String, enum: List<String>? = null, format: String? = null) =
        prop(name, JsonSchema.string(description, format, enum))
    fun integer(name: String, description: String, min: Int? = null, max: Int? = null) =
        prop(name, JsonSchema.integer(description, min, max))
    fun number(name: String, description: String, min: Double? = null, max: Double? = null) =
        prop(name, JsonSchema.number(description, min, max))
    fun boolean(name: String, description: String) = prop(name, JsonSchema.boolean(description))
    fun stringArray(name: String, description: String) = prop(name, JsonSchema.stringList(description))
    fun stringMap(name: String, description: String) = prop(name, JsonSchema.stringMap(description))
    fun obj(name: String, description: String, required: List<String>, block: SchemaBuilder.() -> Unit) =
        prop(name, JsonSchema.obj(SchemaBuilder().apply(block).properties, required, description))
}

/** An MCP tool input schema built with [SchemaBuilder]. */
fun toolSchema(required: List<String> = emptyList(), block: SchemaBuilder.() -> Unit = {}): ToolSchema =
    ToolSchema(properties = JsonSchema.properties(SchemaBuilder().apply(block).properties), required = required)
