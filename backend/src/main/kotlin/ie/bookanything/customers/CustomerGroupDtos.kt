package ie.bookanything.customers

import ie.bookanything.http.Validator
import kotlinx.serialization.Serializable

@Serializable
data class CustomerGroupDto(
    val id: String,
    val name: String,
    val description: String?,
    val restricted: Boolean,
    val sortOrder: Int,
    val isActive: Boolean,
)

@Serializable
data class CustomerGroupInput(
    val name: String,
    val description: String? = null,
    val restricted: Boolean = false,
    val sortOrder: Int = 0,
    val isActive: Boolean = true,
)

fun validateGroup(g: CustomerGroupInput) = Validator().apply {
    requireText(g.name, "name", 100)
    requireText(g.description, "description", 500, required = false)
    range(g.sortOrder, "sortOrder", -10000, 10000)
}
