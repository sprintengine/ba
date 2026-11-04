package ie.bookanything.services

import ie.bookanything.audit.Actor
import ie.bookanything.audit.Audit
import ie.bookanything.auth.BusinessAccess
import ie.bookanything.http.Errors
import ie.bookanything.http.Patch
import java.sql.Connection
import java.util.UUID

/** Booking form question changes (admins; audited with the given actor). */
object QuestionCommands {
    fun create(conn: Connection, access: BusinessAccess, input: FormQuestionInput, actor: Actor): FormQuestionDto {
        validateQuestion(input).throwIfInvalid()
        requireService(conn, access.businessId, input.serviceId)
        val created = QuestionRepository.insert(conn, access.businessId, input)
        Audit.record(
            conn, access.businessId, actor, "question.created", "question", UUID.fromString(created.id), mapOf("label" to created.label),
        )
        return created
    }

    /** Applies [patch] (absent keys keep their value) to the question. */
    fun update(conn: Connection, access: BusinessAccess, id: UUID, patch: Patch, actor: Actor): FormQuestionDto {
        val q = QuestionRepository.get(conn, access.businessId, id) ?: throw Errors.notFound("Question")
        val merged = FormQuestionInput(
            serviceId = patch.string("serviceId", q.serviceId), label = patch.requiredString("label", q.label),
            helpText = patch.string("helpText", q.helpText), kind = patch.requiredString("kind", q.kind),
            options = patch.stringList("options", q.options), required = patch.bool("required", q.required),
            sensitive = patch.bool("sensitive", q.sensitive), sortOrder = patch.int("sortOrder", q.sortOrder),
            isActive = patch.bool("isActive", q.isActive),
        )
        validateQuestion(merged).throwIfInvalid()
        requireService(conn, access.businessId, merged.serviceId)
        val updated = QuestionRepository.update(conn, access.businessId, id, merged)!!
        Audit.record(conn, access.businessId, actor, "question.updated", "question", id, mapOf("fields" to patch.keys.toList()))
        return updated
    }

    fun remove(conn: Connection, access: BusinessAccess, id: UUID, actor: Actor) {
        if (!QuestionRepository.delete(conn, access.businessId, id)) throw Errors.notFound("Question")
        Audit.record(conn, access.businessId, actor, "question.deleted", "question", id)
    }

    /** A question may be scoped to one of the business's own services. */
    private fun requireService(conn: Connection, businessId: UUID, serviceId: String?) {
        if (serviceId != null && !ServiceRepository.exists(conn, businessId, UUID.fromString(serviceId))) {
            throw Errors.field("serviceId", "Unknown service")
        }
    }
}
