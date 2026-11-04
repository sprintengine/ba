package ie.bookanything.services

import ie.bookanything.db.TextArray
import ie.bookanything.db.bool
import ie.bookanything.db.int
import ie.bookanything.db.query
import ie.bookanything.db.queryOne
import ie.bookanything.db.str
import ie.bookanything.db.strOrNull
import ie.bookanything.db.stringList
import ie.bookanything.db.update
import ie.bookanything.db.uuid
import ie.bookanything.db.uuidOrNull
import java.sql.Connection
import java.sql.ResultSet
import java.util.UUID

object QuestionRepository {
    fun map(rs: ResultSet) = FormQuestionDto(
        id = rs.uuid("id").toString(), serviceId = rs.uuidOrNull("service_id")?.toString(), label = rs.str("label"),
        helpText = rs.strOrNull("help_text"), kind = rs.str("kind"), options = rs.stringList("options"),
        required = rs.bool("required"), sensitive = rs.bool("sensitive"), sortOrder = rs.int("sort_order"), isActive = rs.bool("is_active"),
    )

    private const val COLS = "id, service_id, label, help_text, kind::text AS kind, options, required, sensitive, sort_order, is_active"

    fun list(conn: Connection, businessId: UUID) = conn.query(
        "SELECT $COLS FROM form_questions WHERE business_id = ? ORDER BY sort_order, label", businessId, map = ::map,
    )

    /** Active questions that apply to a service (business-wide + service-specific). */
    fun forService(conn: Connection, businessId: UUID, serviceId: UUID) = conn.query(
        "SELECT $COLS FROM form_questions WHERE business_id = ? AND is_active AND (service_id IS NULL OR service_id = ?) ORDER BY " +
            "sort_order, label",
        businessId, serviceId, map = ::map,
    )

    fun get(conn: Connection, businessId: UUID, id: UUID) = conn.queryOne(
        "SELECT $COLS FROM form_questions WHERE business_id = ? AND id = ?", businessId, id, map = ::map,
    )

    fun insert(conn: Connection, businessId: UUID, q: FormQuestionInput): FormQuestionDto = conn.queryOne(
        """
        INSERT INTO form_questions (business_id, service_id, label, help_text, kind, options, required, sensitive, sort_order, is_active)
        VALUES (?, ?, ?, ?, ?::question_kind, ?, ?, ?, ?, ?) RETURNING $COLS
        """.trimIndent(),
        businessId, q.serviceId?.let(UUID::fromString), q.label.trim(), q.helpText?.trim()?.ifEmpty { null }, q.kind,
        TextArray(q.options.map { it.trim() }), q.required, q.sensitive, q.sortOrder, q.isActive, map = ::map,
    )!!

    fun update(conn: Connection, businessId: UUID, id: UUID, q: FormQuestionInput): FormQuestionDto? = conn.queryOne(
        """
        UPDATE form_questions SET service_id = ?, label = ?, help_text = ?, kind = ?::question_kind, options = ?, required = ?,
            sensitive = ?, sort_order = ?, is_active = ?
        WHERE business_id = ? AND id = ? RETURNING $COLS
        """.trimIndent(),
        q.serviceId?.let(UUID::fromString), q.label.trim(), q.helpText?.trim()?.ifEmpty { null }, q.kind,
        TextArray(q.options.map { it.trim() }), q.required, q.sensitive, q.sortOrder, q.isActive, businessId, id, map = ::map,
    )

    /** Deletes a question; false when there was none. */
    fun delete(conn: Connection, businessId: UUID, id: UUID): Boolean =
        conn.update("DELETE FROM form_questions WHERE business_id = ? AND id = ?", businessId, id) > 0
}
