package ie.bookanything.http

import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.intOrNull

/**
 * Reads a JSON PATCH-style body where an absent key means "keep current value" and an
 * explicit null means "clear". All type mismatches become 400 INVALID_REQUEST.
 */
class Patch(val obj: JsonObject) {
    val keys: Set<String> get() = obj.keys

    fun has(key: String) = obj.containsKey(key)

    fun string(key: String, current: String?): String? {
        if (!has(key)) return current
        return when (val v = obj[key]) {
            null, JsonNull -> null
            is JsonPrimitive -> if (v.isString) v.content else throw Errors.field(key, "Must be a string")
            else -> throw Errors.field(key, "Must be a string")
        }
    }

    fun requiredString(key: String, current: String): String =
        string(key, current) ?: throw Errors.field(key, "Must not be null")

    fun int(key: String, current: Int): Int {
        if (!has(key)) return current
        val v = obj[key] as? JsonPrimitive ?: throw Errors.field(key, "Must be an integer")
        if (v.isString) throw Errors.field(key, "Must be an integer")
        return v.intOrNull ?: throw Errors.field(key, "Must be an integer")
    }

    fun intOrNull(key: String, current: Int?): Int? {
        if (!has(key)) return current
        if (obj[key] is JsonNull) return null
        return int(key, 0)
    }

    fun bool(key: String, current: Boolean): Boolean {
        if (!has(key)) return current
        val v = obj[key] as? JsonPrimitive ?: throw Errors.field(key, "Must be true or false")
        if (v.isString) throw Errors.field(key, "Must be true or false")
        return v.booleanOrNull ?: throw Errors.field(key, "Must be true or false")
    }

    fun stringList(key: String, current: List<String>): List<String> {
        if (!has(key)) return current
        val arr = obj[key] as? JsonArray ?: throw Errors.field(key, "Must be an array")
        return arr.map {
            (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.content ?: throw Errors.field(key, "Must be an array of strings")
        }
    }

    /**
     * Like [decode] for nested objects, but merges the given sub-fields into the current value
     * so `{"policies":{"holdMinutes":20}}` changes only holdMinutes.
     */
    fun <T> merge(key: String, current: T, serializer: kotlinx.serialization.KSerializer<T>): T {
        if (!has(key)) return current
        val given = obj[key] as? JsonObject ?: throw Errors.field(key, "Must be an object")
        val base = ApiJson.encodeToJsonElement(serializer, current) as JsonObject
        return try {
            ApiJson.decodeFromJsonElement(serializer, JsonObject(base + given))
        } catch (_: IllegalArgumentException) { // SerializationException and failed `require`s in model init blocks.
            throw Errors.field(key, "Invalid value")
        }
    }

    fun <T> decode(key: String, current: T, deserializer: DeserializationStrategy<T>): T {
        if (!has(key)) return current
        return try {
            ApiJson.decodeFromJsonElement(deserializer, obj[key] ?: JsonNull)
        } catch (_: IllegalArgumentException) {
            throw Errors.field(key, "Invalid value")
        }
    }
}
