package ie.bookanything.templates

import ie.bookanything.business.Branding
import ie.bookanything.business.Policies
import ie.bookanything.business.Vocabulary
import ie.bookanything.services.ServiceAddonInput
import ie.bookanything.services.ServiceOptionInput
import kotlinx.serialization.Serializable

@Serializable
data class TemplateSummary(val key: String, val name: String, val description: String, val icon: String)

@Serializable
data class SetupGroup(val key: String, val name: String, val description: String? = null, val restricted: Boolean = false)

@Serializable
data class SetupWeeklyHours(
    val dayOfWeek: Int, val startTime: String, val endTime: String, val audienceGroupKeys: List<String> = emptyList(),
)

@Serializable
data class SetupResource(
    val key: String,
    val kind: String,
    val name: String,
    val description: String? = null,
    val capacity: Int = 1,
    val weeklyHours: List<SetupWeeklyHours> = emptyList(),
)

@Serializable
data class SetupRequirement(
    val label: String, val quantity: Int = 1, val customerSelectable: Boolean = false, val resourceKeys: List<String>,
)

@Serializable
data class SetupService(
    val name: String,
    val description: String? = null,
    val category: String? = null,
    val color: String = "#4f46e5",
    val durationMinutes: Int,
    val bufferBeforeMinutes: Int = 0,
    val bufferAfterMinutes: Int = 0,
    val slotIntervalMinutes: Int? = null,
    val minNoticeMinutes: Int? = null,
    val maxAdvanceDays: Int? = null,
    val capacity: Int = 1,
    val priceCents: Int = 0,
    val paymentMode: String = "full",
    val depositCents: Int? = null,
    val requiresApproval: Boolean = false,
    val locationType: String = "business",
    val isPublic: Boolean = true,
    val options: List<ServiceOptionInput> = emptyList(),
    val addons: List<ServiceAddonInput> = emptyList(),
    val requirements: List<SetupRequirement> = emptyList(),
    val allowedGroupKeys: List<String> = emptyList(),
)

@Serializable
data class SetupQuestion(
    val label: String,
    val helpText: String? = null,
    val kind: String = "text",
    val options: List<String> = emptyList(),
    val required: Boolean = false,
    val sensitive: Boolean = false,
    val serviceName: String? = null,
)

/** A complete description of a business to create (templates, AI drafts, onboarding). */
@Serializable
data class BusinessSetup(
    val source: String? = null,
    val name: String,
    val slug: String? = null,
    val industry: String = "generic",
    val description: String? = null,
    val timezone: String = "Europe/Dublin",
    val currency: String = "EUR",
    val locale: String = "en-IE",
    val country: String = "IE",
    val vocabulary: Vocabulary = Vocabulary(),
    val branding: Branding = Branding(),
    val policies: Policies = Policies(),
    val customerGroups: List<SetupGroup> = emptyList(),
    val resources: List<SetupResource> = emptyList(),
    val services: List<SetupService> = emptyList(),
    val questions: List<SetupQuestion> = emptyList(),
)

@Serializable
data class BusinessDraftRequest(val description: String, val websiteUrl: String? = null)

/** Produces a reviewable BusinessSetup from a free-text description. */
interface BusinessDraftGenerator {
    /** [userId] is the signed-in user the draft is for (metered model calls are recorded against them). */
    fun generate(request: BusinessDraftRequest, userId: java.util.UUID? = null): BusinessSetup
}
