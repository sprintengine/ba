package ie.bookanything.booking

import ie.bookanything.services.PublicQuestion
import ie.bookanything.services.ServiceAddonDto
import ie.bookanything.services.ServiceOptionDto
import kotlinx.serialization.Serializable

@Serializable
data class SelectableResource(val id: String, val name: String, val description: String?, val kind: String)

@Serializable
data class SelectableRequirement(val id: String, val label: String, val resources: List<SelectableResource>)

@Serializable
data class PublicServiceDto(
    val id: String,
    val name: String,
    val description: String?,
    val category: String?,
    val color: String,
    val durationMinutes: Int,
    val bufferBeforeMinutes: Int,
    val bufferAfterMinutes: Int,
    val slotIntervalMinutes: Int?,
    val minNoticeMinutes: Int?,
    val maxAdvanceDays: Int?,
    val capacity: Int,
    val priceCents: Int,
    val paymentMode: String,
    val depositCents: Int?,
    /** Paid online by default, but the customer may choose to pay at the venue instead. */
    val allowPayAtVenue: Boolean,
    val requiresApproval: Boolean,
    val locationType: String,
    val sortOrder: Int,
    val options: List<ServiceOptionDto>,
    val addons: List<ServiceAddonDto>,
    val allowedGroupIds: List<String>,
    val selectableRequirement: SelectableRequirement?,
    val questions: List<PublicQuestion>,
)

/** The Checkout Session the customer came back from (`session_id` in the success URL). */
@Serializable
data class ConfirmPaymentInput(val sessionId: String = "")
