package ie.bookanything.services

import ie.bookanything.http.Validator
import kotlinx.serialization.Serializable

val QUESTION_KINDS = setOf("text", "textarea", "select", "checkbox", "number", "phone", "email")

@Serializable
data class FormQuestionDto(
    val id: String,
    val serviceId: String?,
    val label: String,
    val helpText: String?,
    val kind: String,
    val options: List<String>,
    val required: Boolean,
    val sensitive: Boolean,
    val sortOrder: Int,
    val isActive: Boolean,
)

@Serializable
data class FormQuestionInput(
    val serviceId: String? = null,
    val label: String,
    val helpText: String? = null,
    val kind: String = "text",
    val options: List<String> = emptyList(),
    val required: Boolean = false,
    val sensitive: Boolean = false,
    val sortOrder: Int = 0,
    val isActive: Boolean = true,
)

/** Public shape: Omit<FormQuestion, "serviceId" | "isActive">. */
@Serializable
data class PublicQuestion(
    val id: String,
    val label: String,
    val helpText: String?,
    val kind: String,
    val options: List<String>,
    val required: Boolean,
    val sensitive: Boolean,
    val sortOrder: Int,
)

fun FormQuestionDto.toPublic() = PublicQuestion(id, label, helpText, kind, options, required, sensitive, sortOrder)

fun validateQuestion(q: FormQuestionInput, v: Validator = Validator()): Validator {
    q.serviceId?.let { v.uuid(it, "serviceId") }
    v.requireText(q.label, "label", 200)
    v.requireText(q.helpText, "helpText", 500, required = false)
    v.oneOf(q.kind, "kind", QUESTION_KINDS) { it }
    if (q.kind == "select" && q.options.isEmpty()) v.error("options", "A select question needs at least one option")
    if (q.options.size > 50) v.error("options", "At most 50 options")
    q.options.forEachIndexed { i, o -> if (o.isBlank() || o.length > 100) v.error("options[$i]", "Must be 1 to 100 characters") }
    v.range(q.sortOrder, "sortOrder", -10000, 10000)
    return v
}
