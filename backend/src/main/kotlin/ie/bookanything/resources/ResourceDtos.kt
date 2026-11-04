package ie.bookanything.resources

import kotlinx.serialization.Serializable

val RESOURCE_KINDS = setOf("person", "space", "equipment")

@Serializable
data class ResourceDto(
    val id: String,
    val kind: String,
    val name: String,
    val description: String?,
    val color: String,
    val capacity: Int,
    val memberId: String?,
    val isActive: Boolean,
    val sortOrder: Int,
)

@Serializable
data class ResourceInput(
    val kind: String,
    val name: String,
    val description: String? = null,
    val color: String = "#64748b",
    val capacity: Int = 1,
    val memberId: String? = null,
    val isActive: Boolean = true,
    val sortOrder: Int = 0,
)
