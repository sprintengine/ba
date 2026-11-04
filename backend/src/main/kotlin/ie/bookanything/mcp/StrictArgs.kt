@file:OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)

package ie.bookanything.mcp

import ie.bookanything.ai.AiJson
import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.MissingFieldException
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.JsonObject

/** Tool arguments are decoded strictly: unknown arguments, wrong types and missing required ones are rejected. */
object StrictArgs {
    private val UNKNOWN_KEY = Regex("unknown key '([^']+)'", RegexOption.IGNORE_CASE)

    fun <T> decode(deserializer: DeserializationStrategy<T>, args: JsonObject): T = try {
        AiJson.toolArguments.decodeFromJsonElement(deserializer, args)
    } catch (e: MissingFieldException) {
        throw ie.bookanything.http.Errors.invalid("Missing required arguments.", e.missingFields.associateWith { "Required" })
    } catch (e: SerializationException) {
        val unknown = UNKNOWN_KEY.find(e.message.orEmpty())?.groupValues?.get(1)
        if (unknown != null) throw ie.bookanything.http.Errors.field(unknown, "Unknown argument")
        throw ie.bookanything.http.Errors.invalid("Invalid arguments: ${e.message?.lineSequence()?.firstOrNull()?.take(200).orEmpty()}")
    }
}
