package ie.bookanything.site

import ie.bookanything.ai.usage.AiCreditsDto
import ie.bookanything.audit.ActorType
import ie.bookanything.site.stock.StockPhoto
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

@Serializable
enum class SiteVersionSource(override val key: String) : KeyedValue {
    @SerialName("owner") OWNER("owner"),
    @SerialName("ai_generate") AI_GENERATE("ai_generate"),
    @SerialName("ai_edit") AI_EDIT("ai_edit"),
    @SerialName("restore") RESTORE("restore"),
    @SerialName("template") TEMPLATE("template"),
    @SerialName("seed") SEED("seed"),
}

/** The site builder's AI status: whether a model is connected, and the business's AI credits this month. */
@Serializable
data class SiteAiStatusDto(val model: Boolean, val credits: AiCreditsDto)

@Serializable data class StockStatusDto(val enabled: Boolean)
@Serializable data class UploadStatusDto(val enabled: Boolean, val maxBytes: Int)

@Serializable
data class SiteState(
    val draft: SitePlan,
    val draftVersion: Int?,
    val published: SitePlan?,
    val publishedVersion: Int?,
    val publishedAt: String?,
    val updatedAt: String?,
    val hasUnpublishedChanges: Boolean,
    val context: SiteContext,
    val ai: SiteAiStatusDto,
    val stock: StockStatusDto,
    val uploads: UploadStatusDto,
)

@Serializable
data class SiteVersionDto(
    val version: Int,
    val source: SiteVersionSource,
    val instruction: String?,
    val changes: List<String>,
    val actorType: ActorType,
    val actorName: String?,
    val createdAt: String,
    val isPublished: Boolean,
    val isDraft: Boolean,
)

/** `SiteVersion & {plan}`. */
@Serializable
data class SiteVersionDetailDto(
    val version: Int,
    val source: SiteVersionSource,
    val instruction: String?,
    val changes: List<String>,
    val actorType: ActorType,
    val actorName: String?,
    val createdAt: String,
    val isPublished: Boolean,
    val isDraft: Boolean,
    val plan: SitePlan,
)

@Serializable data class SiteVersionList(val items: List<SiteVersionDto>)

@Serializable
data class SiteAiResult(
    val state: SiteState,
    val source: String,
    val changes: List<String>,
    val previousVersion: Int?,
    val message: String?,
)

/** The site on `GET /v1/public/businesses/{slug}`: the published plan, or the default one. */
@Serializable
data class PublicSite(val plan: SitePlan, val isDefault: Boolean, val context: SiteContext)

@Serializable data class SaveSiteInput(val plan: JsonElement? = null, val baseVersion: Int? = null)
@Serializable data class GenerateSiteInput(val prompt: String? = null, val websiteUrl: String? = null)
@Serializable data class EditSiteInput(val instruction: String? = null, val baseVersion: Int? = null)
@Serializable data class StockSearchResult(val enabled: Boolean, val results: List<StockPhoto>)
@Serializable data class StockDownloadInput(val downloadLocation: String? = null)
