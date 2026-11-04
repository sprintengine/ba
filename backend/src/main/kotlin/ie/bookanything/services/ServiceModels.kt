package ie.bookanything.services

import ie.bookanything.http.Validator
import kotlinx.serialization.Serializable
import java.util.UUID

val PAYMENT_MODES = setOf("full", "deposit", "at_venue", "free")
val LOCATION_TYPES = setOf("business", "customer", "online")

@Serializable
data class ServiceOptionDto(
    val id: String, val name: String, val description: String?, val durationMinutes: Int, val priceCents: Int, val sortOrder: Int,
)

@Serializable
data class ServiceAddonDto(
    val id: String, val name: String, val description: String?, val extraMinutes: Int, val priceCents: Int, val sortOrder: Int,
)

@Serializable
data class ServiceRequirementDto(
    val id: String, val label: String, val quantity: Int, val customerSelectable: Boolean, val resourceIds: List<String>,
    val sortOrder: Int,
)

@Serializable
data class ServiceDto(
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
    /** A `full` or `deposit` service the customer may choose to pay at the venue instead (always false otherwise). */
    val allowPayAtVenue: Boolean,
    val requiresApproval: Boolean,
    val locationType: String,
    val allowedGroupIds: List<String>,
    val isPublic: Boolean,
    val isActive: Boolean,
    val sortOrder: Int,
    val options: List<ServiceOptionDto>,
    val addons: List<ServiceAddonDto>,
    val requirements: List<ServiceRequirementDto>,
)

/** `id` is optional on input items: when it matches an existing item it is updated in place (keeps ids stable). */
@Serializable
data class ServiceOptionInput(
    val id: String? = null, val name: String, val description: String? = null, val durationMinutes: Int, val priceCents: Int = 0,
    val sortOrder: Int = 0,
)

@Serializable
data class ServiceAddonInput(
    val id: String? = null, val name: String, val description: String? = null, val extraMinutes: Int = 0, val priceCents: Int = 0,
    val sortOrder: Int = 0,
)

@Serializable
data class ServiceRequirementInput(
    val id: String? = null, val label: String, val quantity: Int = 1, val customerSelectable: Boolean = false,
    val resourceIds: List<String> = emptyList(), val sortOrder: Int = 0,
)

@Serializable
data class ServiceInput(
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
    val allowPayAtVenue: Boolean = false,
    val requiresApproval: Boolean = false,
    val locationType: String = "business",
    val allowedGroupIds: List<String> = emptyList(),
    val isPublic: Boolean = true,
    val isActive: Boolean = true,
    val sortOrder: Int = 0,
    val options: List<ServiceOptionInput> = emptyList(),
    val addons: List<ServiceAddonInput> = emptyList(),
    val requirements: List<ServiceRequirementInput> = emptyList(),
)

/** The input that recreates this service unchanged (ids kept), for read-modify-write updates. */
fun ServiceDto.toInput() = ServiceInput(
    name = name, description = description, category = category, color = color, durationMinutes = durationMinutes,
    bufferBeforeMinutes = bufferBeforeMinutes, bufferAfterMinutes = bufferAfterMinutes, slotIntervalMinutes = slotIntervalMinutes,
    minNoticeMinutes = minNoticeMinutes, maxAdvanceDays = maxAdvanceDays, capacity = capacity, priceCents = priceCents,
    paymentMode = paymentMode, depositCents = depositCents, allowPayAtVenue = allowPayAtVenue, requiresApproval = requiresApproval,
    locationType = locationType,
    allowedGroupIds = allowedGroupIds, isPublic = isPublic, isActive = isActive, sortOrder = sortOrder,
    options = options.map { ServiceOptionInput(it.id, it.name, it.description, it.durationMinutes, it.priceCents, it.sortOrder) },
    addons = addons.map { ServiceAddonInput(it.id, it.name, it.description, it.extraMinutes, it.priceCents, it.sortOrder) },
    requirements = requirements.map {
        ServiceRequirementInput(
            it.id, it.label, it.quantity, it.customerSelectable, it.resourceIds,
            it.sortOrder,
        )
    },
)

// ---- Internal typed model used by the booking engine ----

data class OptionDef(val id: UUID, val name: String, val durationMinutes: Int, val priceCents: Int)
data class AddonDef(val id: UUID, val name: String, val extraMinutes: Int, val priceCents: Int)
data class RequirementDef(
    val id: UUID, val label: String, val quantity: Int, val customerSelectable: Boolean, val resourceIds: List<UUID>, val sortOrder: Int,
)

data class ServiceDef(
    val id: UUID,
    val name: String,
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
    val allowPayAtVenue: Boolean,
    val requiresApproval: Boolean,
    val allowedGroupIds: Set<UUID>,
    val isPublic: Boolean,
    val isActive: Boolean,
    val options: List<OptionDef>,
    val addons: List<AddonDef>,
    val requirements: List<RequirementDef>,
) {
    val selectableRequirement: RequirementDef? get() = requirements.firstOrNull { it.customerSelectable }

    /**
     * Paid online when booked (architecture §5.2: full or deposit mode and a price). The price is the selection's, so a
     * service priced only by its options or add-ons counts: its base price may be 0. In SQL:
     * [ServiceRepository.anyNeedsOnlinePayment].
     */
    val needsOnlinePayment: Boolean
        get() = (paymentMode == "full" || paymentMode == "deposit") &&
            (priceCents > 0 || options.any { it.priceCents > 0 } || addons.any { it.priceCents > 0 })

    /** Paid online by default, but the customer may choose to pay at the venue instead. */
    val offersPayAtVenue: Boolean get() = allowPayAtVenue && needsOnlinePayment
}

fun ServiceDto.toDef() = ServiceDef(
    id = UUID.fromString(id), name = name, color = color, durationMinutes = durationMinutes,
    bufferBeforeMinutes = bufferBeforeMinutes, bufferAfterMinutes = bufferAfterMinutes, slotIntervalMinutes = slotIntervalMinutes,
    minNoticeMinutes = minNoticeMinutes, maxAdvanceDays = maxAdvanceDays, capacity = capacity, priceCents = priceCents,
    paymentMode = paymentMode, depositCents = depositCents, allowPayAtVenue = allowPayAtVenue, requiresApproval = requiresApproval,
    allowedGroupIds = allowedGroupIds.map(UUID::fromString).toSet(), isPublic = isPublic, isActive = isActive,
    options = options.map { OptionDef(UUID.fromString(it.id), it.name, it.durationMinutes, it.priceCents) },
    addons = addons.map { AddonDef(UUID.fromString(it.id), it.name, it.extraMinutes, it.priceCents) },
    requirements = requirements.map {
        RequirementDef(
            UUID.fromString(it.id), it.label, it.quantity, it.customerSelectable,
            it.resourceIds.map(UUID::fromString), it.sortOrder,
        )
    },
)

/** Structural validation (no database). Reference checks happen in the repository. */
fun validateService(s: ServiceInput, v: Validator = Validator()): Validator {
    validateBasics(s, v)
    v.range(s.priceCents, "priceCents", 0, 10_000_000)
    v.oneOf(s.paymentMode, "paymentMode", PAYMENT_MODES) { it }
    v.oneOf(s.locationType, "locationType", LOCATION_TYPES) { it }
    validateDeposit(s, v)
    v.uuids(s.allowedGroupIds, "allowedGroupIds")
    v.range(s.sortOrder, "sortOrder", -10000, 10000)
    validateOptions(s.options, v)
    validateAddons(s.addons, v)
    validateRequirements(s.requirements, v)
    return v
}

private fun validateBasics(s: ServiceInput, v: Validator) {
    v.requireText(s.name, "name", 120)
    v.requireText(s.description, "description", 2000, required = false)
    v.requireText(s.category, "category", 60, required = false)
    v.color(s.color, "color")
    v.range(s.durationMinutes, "durationMinutes", 5, 1440)
    v.range(s.bufferBeforeMinutes, "bufferBeforeMinutes", 0, 480)
    v.range(s.bufferAfterMinutes, "bufferAfterMinutes", 0, 480)
    v.range(s.slotIntervalMinutes, "slotIntervalMinutes", 5, 1440)
    v.range(s.minNoticeMinutes, "minNoticeMinutes", 0, 60 * 24 * 90)
    v.range(s.maxAdvanceDays, "maxAdvanceDays", 1, 730)
    v.range(s.capacity, "capacity", 1, 1000)
}

/** A deposit-mode service needs a deposit of at most its price; other modes may not carry a negative one. */
private fun validateDeposit(s: ServiceInput, v: Validator) {
    val deposit = s.depositCents
    when {
        s.paymentMode != "deposit" -> if (deposit != null && deposit < 0) v.error("depositCents", "Must not be negative")
        deposit == null || deposit <= 0 -> v.error("depositCents", "Required for deposit payment mode")
        deposit > s.priceCents -> v.error("depositCents", "Cannot exceed the price")
    }
}

private fun validateOptions(options: List<ServiceOptionInput>, v: Validator) {
    if (options.size > 30) v.error("options", "At most 30 options")
    options.forEachIndexed { i, o ->
        o.id?.let { v.uuid(it, "options[$i].id") }
        v.requireText(o.name, "options[$i].name", 120)
        v.requireText(o.description, "options[$i].description", 500, required = false)
        v.range(o.durationMinutes, "options[$i].durationMinutes", 5, 1440)
        v.range(o.priceCents, "options[$i].priceCents", 0, 10_000_000)
    }
}

private fun validateAddons(addons: List<ServiceAddonInput>, v: Validator) {
    if (addons.size > 30) v.error("addons", "At most 30 add-ons")
    addons.forEachIndexed { i, a ->
        a.id?.let { v.uuid(it, "addons[$i].id") }
        v.requireText(a.name, "addons[$i].name", 120)
        v.requireText(a.description, "addons[$i].description", 500, required = false)
        v.range(a.extraMinutes, "addons[$i].extraMinutes", 0, 480)
        v.range(a.priceCents, "addons[$i].priceCents", 0, 10_000_000)
    }
}

/** Each requirement draws [quantity] resources from a pool at least that large; one at most is customer-selectable. */
private fun validateRequirements(requirements: List<ServiceRequirementInput>, v: Validator) {
    if (requirements.size > 10) v.error("requirements", "At most 10 requirements")
    if (requirements.count { it.customerSelectable } > 1) v.error("requirements", "Only one requirement can be customer-selectable")
    requirements.forEachIndexed { i, r ->
        r.id?.let { v.uuid(it, "requirements[$i].id") }
        v.requireText(r.label, "requirements[$i].label", 100)
        v.range(r.quantity, "requirements[$i].quantity", 1, 20)
        val ids = v.uuids(r.resourceIds, "requirements[$i].resourceIds")
        if (ids.isEmpty()) {
            v.error("requirements[$i].resourceIds", "Choose at least one resource")
        } else if (ids.size < r.quantity) {
            v.error("requirements[$i].quantity", "Needs at least ${r.quantity} resources in the pool")
        }
    }
}
