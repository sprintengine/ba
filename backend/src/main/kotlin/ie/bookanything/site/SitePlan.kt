package ie.bookanything.site

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.buildClassSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.jsonObject

/*
 * The site plan (docs/architecture.md section 15.3): a typed description of a business's public
 * site. The AI and the owner fill it; the frontend design system renders it. Stored and returned
 * in normalized form: every field present, explicit nulls.
 */

/** Enums whose JSON value is [key]. */
interface KeyedValue {
    val key: String
}

inline fun <reified E> keyed(raw: String?): E? where E : Enum<E>, E : KeyedValue = enumValues<E>().firstOrNull { it.key == raw }

@Serializable
enum class SiteTheme(override val key: String) : KeyedValue {
    @SerialName("clinical") CLINICAL("clinical"),
    @SerialName("calm") CALM("calm"),
    @SerialName("bold") BOLD("bold"),
    @SerialName("playful") PLAYFUL("playful"),
    @SerialName("editorial") EDITORIAL("editorial"),
    @SerialName("minimal") MINIMAL("minimal"),
    ;

    val label: String get() = key.replaceFirstChar { it.uppercase() }
}

@Serializable
enum class GeneratedPattern(override val key: String) : KeyedValue {
    @SerialName("aurora") AURORA("aurora"),
    @SerialName("mesh") MESH("mesh"),
    @SerialName("waves") WAVES("waves"),
    @SerialName("grid") GRID("grid"),
    @SerialName("dots") DOTS("dots"),
    @SerialName("rays") RAYS("rays"),
}

@Serializable
enum class HeroVariant(override val key: String) : KeyedValue {
    @SerialName("split") SPLIT("split"),
    @SerialName("cover") COVER("cover"),
    @SerialName("minimal") MINIMAL("minimal"),
}

@Serializable
enum class ImageKind(override val key: String) : KeyedValue {
    @SerialName("upload") UPLOAD("upload"),
    @SerialName("stock") STOCK("stock"),
    @SerialName("generated") GENERATED("generated"),
}

@Serializable
data class SiteAttribution(val name: String, val url: String)

@Serializable
data class SiteImage(
    val kind: ImageKind,
    val url: String? = null,
    val alt: String = "",
    val pattern: GeneratedPattern? = null,
    val attribution: SiteAttribution? = null,
) {
    companion object {
        fun generated(pattern: GeneratedPattern, alt: String = "") = SiteImage(ImageKind.GENERATED, null, alt, pattern, null)
    }
}

@Serializable
data class SitePalette(val primaryColor: String, val accent: String? = null)

@Serializable
data class SiteSeo(val title: String? = null, val description: String? = null)

@Serializable
data class SitePlan(
    val theme: SiteTheme,
    val palette: SitePalette,
    val seo: SiteSeo = SiteSeo(),
    val sections: List<SiteSection> = emptyList(),
) {
    fun section(id: String): SiteSection? = sections.firstOrNull { it.id == id }
}

@Serializable(with = SiteSectionSerializer::class)
data class SiteSection(val id: String, val enabled: Boolean, val content: SectionContent) {
    val type: SectionType get() = content.type
}

/** `{id, type, enabled, content}` with `content` encoded by the serializer registered for its type. */
object SiteSectionSerializer : KSerializer<SiteSection> {
    override val descriptor: SerialDescriptor = buildClassSerialDescriptor("SiteSection") {
        element("id", String.serializer().descriptor)
        element("type", String.serializer().descriptor)
        element("enabled", Boolean.serializer().descriptor)
        element("content", JsonElement.serializer().descriptor)
    }

    override fun serialize(encoder: Encoder, value: SiteSection) {
        val json = (encoder as? JsonEncoder ?: throw SerializationException("SiteSection is JSON only")).json
        encoder.encodeJsonElement(
            JsonObject(
                linkedMapOf(
                    "id" to JsonPrimitive(value.id),
                    "type" to JsonPrimitive(value.type.key),
                    "enabled" to JsonPrimitive(value.enabled),
                    "content" to SectionRegistry.spec(value.type).encode(json, value.content),
                ),
            ),
        )
    }

    /** Trusted input only (stored plans). Client input goes through [SiteValidator]. */
    override fun deserialize(decoder: Decoder): SiteSection {
        val jd = decoder as? JsonDecoder ?: throw SerializationException("SiteSection is JSON only")
        val obj = jd.decodeJsonElement().jsonObject
        val id = (obj["id"] as? JsonPrimitive)?.content ?: throw SerializationException("section id missing")
        val type = keyed<SectionType>((obj["type"] as? JsonPrimitive)?.content) ?: throw SerializationException("unknown section type")
        val enabled = (obj["enabled"] as? JsonPrimitive)?.booleanOrNull ?: true
        val content = SectionRegistry.spec(type).decode(jd.json, obj["content"] ?: JsonObject(emptyMap()))
        return SiteSection(id, enabled, content)
    }
}
