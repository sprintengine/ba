package ie.bookanything.site

import ie.bookanything.support.SiteFixtures
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** A complete, valid plan using every section type, and a path-based JSON editor for tests. */
object PlanJson {
    val UPLOAD_URL = SiteFixtures.UPLOAD_PREFIX + SiteFixtures.UPLOAD_FILE
    const val STOCK_URL = "https://images.unsplash.com/photo-1519823551278-64ac92734fb1?ixid=abc&w=1080"
    const val STOCK_PROFILE = "https://unsplash.com/@someone?utm_source=bookanything&utm_medium=referral"

    /** Section index by type in [valid]. */
    val INDEX = listOf(
        "hero", "services", "team", "about", "gallery", "testimonials", "faq", "hours", "cta", "contact",
    ).withIndex().associate { it.value to it.index }

    fun valid(): JsonObject = Json.parseToJsonElement(
        """
    {
      "theme": "calm",
      "palette": {"primaryColor": "#0f766e", "accent": "#9a6b3f"},
      "seo": {"title": "Harbour Physio", "description": "Physiotherapy in Dublin."},
      "sections": [
        {"id": "hero", "type": "hero", "enabled": true, "content": {"variant": "split", "eyebrow": "Physio in Dublin", "headline": "Move better",
          "subheadline": "Book online.", "ctaLabel": "Book now", "image": {"kind": "generated", "url": null, "alt": "", "pattern": "waves", "attribution": null}}},
        {"id": "services", "type": "services", "enabled": true, "content": {"heading": "Treatments", "intro": null,
          "serviceIds": ["${SiteFixtures.SERVICE_A}"], "showPrices": true, "showDurations": false}},
        {"id": "team", "type": "team", "enabled": true, "content": {"heading": "Team", "intro": null,
          "members": [{"resourceId": "${SiteFixtures.PERSON_A}", "bio": "Sam loves runners.", "photo": {"kind": "upload", "url": "$UPLOAD_URL", "alt": "Sam", "pattern": null, "attribution": null}}]}},
        {"id": "about", "type": "about", "enabled": true, "content": {"heading": "About", "body": "We are a clinic.\n\nWe listen.", "highlights": ["One-to-one"],
          "image": {"kind": "stock", "url": "$STOCK_URL", "alt": "A room", "pattern": null, "attribution": {"name": "Some One", "url": "$STOCK_PROFILE"}}}},
        {"id": "gallery", "type": "gallery", "enabled": false, "content": {"heading": null, "images": [{"kind": "generated", "url": null, "alt": "", "pattern": "dots", "attribution": null}]}},
        {"id": "testimonials", "type": "testimonials", "enabled": true, "content": {"heading": "Reviews", "items": [{"quote": "Lovely.", "author": "A client", "detail": null}]}},
        {"id": "faq", "type": "faq", "enabled": true, "content": {"heading": "FAQ", "items": [{"question": "How do I book?", "answer": "Online."}]}},
        {"id": "hours", "type": "hours", "enabled": true, "content": {"heading": "Hours", "note": null, "showAddress": true, "showMapLink": false}},
        {"id": "cta", "type": "cta", "enabled": true, "content": {"headline": "Ready?", "body": null, "buttonLabel": "Book"}},
        {"id": "contact", "type": "contact", "enabled": true, "content": {"heading": "Contact", "body": null, "showPhone": true, "showEmail": false, "showAddress": true}}
      ]
    }
        """.trimIndent(),
    ) as JsonObject

    /** Sets (or with null, removes) the value at a path like `sections[2].content.rating`. */
    fun JsonElement.with(path: String, value: JsonElement?): JsonElement = set(this, tokens(path), value)
    fun JsonElement.with(path: String, value: String): JsonElement = set(this, tokens(path), JsonPrimitive(value))
    fun JsonElement.without(path: String): JsonElement = set(this, tokens(path), null)

    fun JsonObject.with(path: String, value: JsonElement?): JsonObject = set(this, tokens(path), value) as JsonObject
    fun JsonObject.with(path: String, value: String): JsonObject = set(this, tokens(path), JsonPrimitive(value)) as JsonObject
    fun JsonObject.without(path: String): JsonObject = set(this, tokens(path), null) as JsonObject

    private fun tokens(path: String): List<Any> = path.split('.').flatMap { part ->
        val name = part.substringBefore('[')
        val indexes = Regex("\\[(\\d+)]").findAll(part).map { it.groupValues[1].toInt() }.toList()
        listOfNotNull(name.takeIf { it.isNotEmpty() }) + indexes
    }

    private fun set(node: JsonElement, path: List<Any>, value: JsonElement?): JsonElement {
        val head = path.first()
        val rest = path.drop(1)
        return when (head) {
            is String -> {
                val obj = node as JsonObject
                val map = LinkedHashMap(obj)
                if (rest.isEmpty()) {
                    if (value == null) map.remove(head) else map[head] = value
                } else {
                    map[head] = set(obj[head] ?: JsonObject(emptyMap()), rest, value)
                }
                JsonObject(map)
            }
            else -> {
                val arr = (node as JsonArray).toMutableList()
                val i = head as Int
                if (rest.isEmpty()) {
                    if (value == null) {
                        arr.removeAt(i)
                    } else if (i == arr.size) {
                        arr.add(value)
                    } else {
                        arr[i] = value
                    }
                } else {
                    arr[i] = set(arr[i], rest, value)
                }
                JsonArray(arr)
            }
        }
    }
}
