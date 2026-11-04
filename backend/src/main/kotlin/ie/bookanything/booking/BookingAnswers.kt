package ie.bookanything.booking

import ie.bookanything.http.Validator
import ie.bookanything.services.FormQuestionDto

/** Answers to a service's booking form questions: validated against the questions and stored as a snapshot. */
object BookingAnswers {
    /** Any answer (a textarea) and a single-line text answer. */
    const val MAX_LENGTH = 2000
    const val MAX_SHORT_LENGTH = 500

    /**
     * Validates [answers] (question id → value) against the service's active [questions] and returns the snapshot
     * stored on the booking. [enforceRequired] is false for staff-created bookings. Field errors are `answers.<id>`.
     */
    fun validate(questions: List<FormQuestionDto>, answers: Map<String, String>, enforceRequired: Boolean): List<AnswerDto> {
        val v = Validator("answers.")
        val byId = questions.associateBy { it.id }
        answers.keys.forEach { if (it !in byId) v.error(it, "Unknown question") }
        val out = ArrayList<AnswerDto>()
        for (q in questions) {
            val raw = answers[q.id]?.trim()
            if (raw.isNullOrEmpty()) {
                if (q.required && enforceRequired) v.error(q.id, "Required")
            } else {
                problem(q, raw, enforceRequired)?.let { v.error(q.id, it) }
                out.add(AnswerDto(q.id, q.label, raw, q.sensitive))
            }
        }
        v.throwIfInvalid()
        return out
    }

    /**
     * A staff edit of a booking's answers: only the [changed] ones (question id → value; empty clears) are validated
     * against the service's active [questions], as for staff bookings. Every other [stored] answer stays as it was, even
     * one to a question that has since been retired or changed. Edited answers keep their place; new ones follow.
     */
    fun merge(stored: List<AnswerDto>, questions: List<FormQuestionDto>, changed: Map<String, String>): List<AnswerDto> {
        val fresh = validate(questions.filter { it.id in changed }, changed, enforceRequired = false).associateBy { it.questionId }
        val kept = stored.mapNotNull { a -> if (a.questionId in changed) fresh[a.questionId] else a }
        return kept + fresh.values.filter { f -> stored.none { it.questionId == f.questionId } }
    }

    /** What is wrong with the non-empty answer [raw] to [q], or null when it is fine. */
    fun problem(q: FormQuestionDto, raw: String, enforceRequired: Boolean): String? = when {
        raw.length > MAX_LENGTH -> "Must be at most $MAX_LENGTH characters"
        q.kind == "select" && raw !in q.options -> "Choose one of the options"
        q.kind == "checkbox" -> checkboxProblem(raw, q.required && enforceRequired)
        q.kind == "number" && raw.toBigDecimalOrNull() == null -> "Must be a number"
        q.kind == "email" && !Validator.EMAIL.matches(raw) -> "Must be a valid email address"
        q.kind == "phone" && !Validator.PHONE.matches(raw) -> "Must be a valid phone number"
        q.kind == "text" && raw.length > MAX_SHORT_LENGTH -> "Must be at most $MAX_SHORT_LENGTH characters"
        else -> null
    }

    /** A checkbox answers "true" or "false"; a required one must be ticked. */
    private fun checkboxProblem(raw: String, mustBeTicked: Boolean): String? = when {
        raw != "true" && raw != "false" -> "Must be true or false"
        mustBeTicked && raw != "true" -> "Required"
        else -> null
    }
}
