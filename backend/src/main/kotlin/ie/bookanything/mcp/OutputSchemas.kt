package ie.bookanything.mcp

import io.modelcontextprotocol.kotlin.sdk.types.ToolSchema
import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.PolymorphicKind
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.SerialKind
import kotlinx.serialization.descriptors.StructureKind
import kotlinx.serialization.descriptors.elementDescriptors
import kotlinx.serialization.descriptors.elementNames
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Tool `outputSchema`s, generated from the result DTOs' serial descriptors so they can't drift from what the tools return.
 * Clients validate `structuredContent` against them (the TypeScript SDK rejects a result that doesn't match), and the
 * tests check every tool result they get against its tool's schema (`McpOutputCheck`).
 *
 * They describe [ie.bookanything.http.ApiJson]'s output: defaults and nulls are always written, so every property is
 * required and a nullable one is `["type", "null"]`. Additional properties are allowed (adding a field doesn't break a
 * client), and nothing format-like is claimed.
 */
object OutputSchemas {
    /**
     * The output schema of a tool returning [serializer]'s values, with [extra] properties added to them. Only for a
     * non-null class: `structuredContent` is that object as it is ([McpResults.run]), and a tool returning anything else
     * would need a schema of what McpResults makes of it.
     */
    fun of(serializer: KSerializer<*>, extra: List<Pair<String, JsonObject>> = emptyList()): ToolSchema {
        val d = serializer.descriptor
        require((d.kind == StructureKind.CLASS || d.kind == StructureKind.OBJECT) && !d.isNullable && !d.isInline) {
            "A tool's result must be a non-null class to have an output schema: ${d.serialName}"
        }
        return objectOf(properties(d) + extra)
    }

    /** An output schema with these properties, all required (for results built as a JSON object of parts). */
    fun objectOf(properties: List<Pair<String, JsonObject>>): ToolSchema =
        ToolSchema(properties = JsonObject(linkedMapOf(*properties.toTypedArray())), required = properties.map { it.first })

    /** The schema of one value of [serializer]. */
    fun schema(serializer: KSerializer<*>): JsonObject = schema(serializer.descriptor)

    /** Any JSON value: data whose shape varies by tool (the business read tools' `data`). */
    val ANY: JsonObject = JsonObject(emptyMap())

    fun string(): JsonObject = type("string")

    private fun schema(d: SerialDescriptor): JsonObject {
        val base = when {
            d.isInline -> schema(d.getElementDescriptor(0))
            d.serialName.startsWith("kotlinx.serialization.json.") -> ANY
            else -> nonNull(d)
        }
        return if (d.isNullable && base != ANY) nullable(base) else base
    }

    private fun nonNull(d: SerialDescriptor): JsonObject = when (d.kind) {
        PrimitiveKind.STRING, PrimitiveKind.CHAR -> type("string")
        PrimitiveKind.BOOLEAN -> type("boolean")
        PrimitiveKind.BYTE, PrimitiveKind.SHORT, PrimitiveKind.INT, PrimitiveKind.LONG -> type("integer")
        PrimitiveKind.FLOAT, PrimitiveKind.DOUBLE -> type("number")
        SerialKind.ENUM -> JsonObject(mapOf("type" to JsonPrimitive("string"), "enum" to JsonArray(d.elementNames.map(::JsonPrimitive))))
        StructureKind.LIST -> JsonObject(mapOf("type" to JsonPrimitive("array"), "items" to schema(d.getElementDescriptor(0))))
        StructureKind.MAP ->
            JsonObject(mapOf("type" to JsonPrimitive("object"), "additionalProperties" to schema(d.getElementDescriptor(1))))
        StructureKind.CLASS, StructureKind.OBJECT -> {
            val props = properties(d)
            JsonObject(
                linkedMapOf(
                    "type" to JsonPrimitive("object"),
                    "properties" to JsonObject(linkedMapOf(*props.toTypedArray())),
                    "required" to JsonArray(props.map { JsonPrimitive(it.first) }),
                ),
            )
        }
        is PolymorphicKind, SerialKind.CONTEXTUAL -> ANY
    }

    private fun properties(d: SerialDescriptor): List<Pair<String, JsonObject>> =
        d.elementNames.zip(d.elementDescriptors.map(::schema))

    private fun type(name: String) = JsonObject(mapOf("type" to JsonPrimitive(name)))

    /** The same schema, also accepting null (`type` becomes a list; an `enum` gains null). */
    private fun nullable(schema: JsonObject): JsonObject {
        val type = schema.getValue("type")
        val enum = schema["enum"] as? JsonArray
        return JsonObject(
            schema + buildMap<String, JsonElement> {
                put("type", JsonArray(listOf(type, JsonPrimitive("null"))))
                if (enum != null) put("enum", JsonArray(enum + JsonNull))
            },
        )
    }
}
