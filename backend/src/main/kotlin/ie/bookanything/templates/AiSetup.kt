package ie.bookanything.templates

import kotlinx.serialization.Serializable

// The model's business draft (DraftSchema), decoded leniently and repaired into a BusinessSetup by DraftRepair.

@Serializable data class AiVocabulary(
    val resource: String = "", val resources: String = "", val customer: String = "", val customers: String = "", val booking: String = "",
    val bookings: String = "",
)
@Serializable data class AiPolicies(
    val minNoticeMinutes: Int? = null, val maxAdvanceDays: Int? = null, val cancellationNoticeHours: Int? = null,
    val lateCancellationRefundPercent: Int? = null, val allowCustomerCancel: Boolean? = null, val allowCustomerReschedule: Boolean? = null,
    val holdMinutes: Int? = null, val requireCustomerPhone: Boolean? = null,
)
@Serializable data class AiGroup(val key: String = "", val name: String = "", val description: String = "", val restricted: Boolean = false)
@Serializable data class AiHours(
    val dayOfWeek: Int = 0, val startTime: String = "", val endTime: String = "", val audienceGroupKeys: List<String> = emptyList(),
)
@Serializable data class AiResource(
    val key: String = "", val kind: String = "", val name: String = "", val description: String = "", val capacity: Int = 1,
    val weeklyHours: List<AiHours> = emptyList(),
)
@Serializable data class AiOption(
    val name: String = "", val description: String = "", val durationMinutes: Int = 0, val priceCents: Int = 0,
)
@Serializable data class AiAddon(val name: String = "", val description: String = "", val extraMinutes: Int = 0, val priceCents: Int = 0)
@Serializable data class AiRequirement(
    val label: String = "", val quantity: Int = 1, val customerSelectable: Boolean = false, val resourceKeys: List<String> = emptyList(),
)
@Serializable data class AiService(
    val name: String = "", val description: String = "", val category: String = "", val durationMinutes: Int = 0,
    val bufferBeforeMinutes: Int = 0, val bufferAfterMinutes: Int = 0, val slotIntervalMinutes: Int = 0, val capacity: Int = 1,
    val priceCents: Int = 0, val paymentMode: String = "", val depositCents: Int = 0, val requiresApproval: Boolean = false,
    val locationType: String = "", val options: List<AiOption> = emptyList(), val addons: List<AiAddon> = emptyList(),
    val requirements: List<AiRequirement> = emptyList(), val allowedGroupKeys: List<String> = emptyList(),
)
@Serializable data class AiQuestion(
    val label: String = "", val helpText: String = "", val kind: String = "", val options: List<String> = emptyList(),
    val required: Boolean = false, val sensitive: Boolean = false, val serviceName: String = "",
)
@Serializable data class AiSetup(
    val name: String = "", val industry: String = "", val description: String = "", val timezone: String = "", val currency: String = "",
    val locale: String = "", val country: String = "", val primaryColor: String = "", val vocabulary: AiVocabulary = AiVocabulary(),
    val policies: AiPolicies = AiPolicies(), val customerGroups: List<AiGroup> = emptyList(), val resources: List<AiResource> = emptyList(),
    val services: List<AiService> = emptyList(), val questions: List<AiQuestion> = emptyList(),
)
