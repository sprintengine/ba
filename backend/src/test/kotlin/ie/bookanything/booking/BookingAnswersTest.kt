package ie.bookanything.booking

import ie.bookanything.http.ApiException
import ie.bookanything.services.FormQuestionDto
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull

class BookingAnswersTest {
    private fun q(id: String, kind: String, required: Boolean = false, options: List<String> = emptyList(), sensitive: Boolean = false) =
        FormQuestionDto(id, null, "Question $id", null, kind, options, required, sensitive, 0, true)

    private fun fields(block: () -> Unit): Map<String, String> = assertFailsWith<ApiException> { block() }.fields

    @Test
    fun `each kind of question checks its answer`() {
        assertNull(BookingAnswers.problem(q("a", "select", options = listOf("Yes", "No")), "Yes", true))
        assertEquals("Choose one of the options", BookingAnswers.problem(q("a", "select", options = listOf("Yes")), "Maybe", true))
        assertNull(BookingAnswers.problem(q("a", "checkbox"), "false", true))
        assertEquals("Must be true or false", BookingAnswers.problem(q("a", "checkbox"), "yes", true))
        assertEquals("Required", BookingAnswers.problem(q("a", "checkbox", required = true), "false", true))
        assertNull(BookingAnswers.problem(q("a", "checkbox", required = true), "false", false))
        assertNull(BookingAnswers.problem(q("a", "number"), "-1.5", true))
        assertEquals("Must be a number", BookingAnswers.problem(q("a", "number"), "ten", true))
        assertNull(BookingAnswers.problem(q("a", "email"), "jo@example.test", true))
        assertEquals("Must be a valid email address", BookingAnswers.problem(q("a", "email"), "jo@", true))
        assertEquals("Must be a valid phone number", BookingAnswers.problem(q("a", "phone"), "call me", true))
        assertNull(BookingAnswers.problem(q("a", "text"), "x".repeat(500), true))
        assertEquals("Must be at most 500 characters", BookingAnswers.problem(q("a", "text"), "x".repeat(501), true))
        assertNull(BookingAnswers.problem(q("a", "textarea"), "x".repeat(2000), true))
        assertEquals("Must be at most 2000 characters", BookingAnswers.problem(q("a", "textarea"), "x".repeat(2001), true))
    }

    @Test
    fun `answers are trimmed and snapshotted in question order`() {
        val questions = listOf(q("b", "text", sensitive = true), q("a", "text"), q("c", "text"))
        val out = BookingAnswers.validate(questions, mapOf("a" to " one ", "b" to "two", "c" to "  "), enforceRequired = true)
        assertEquals(listOf(AnswerDto("b", "Question b", "two", true), AnswerDto("a", "Question a", "one", false)), out)
    }

    @Test
    fun `unknown questions, missing required answers and bad values are field errors under answers`() {
        val questions = listOf(q("name", "text", required = true), q("age", "number"))
        assertEquals(
            mapOf("answers.extra" to "Unknown question", "answers.name" to "Required", "answers.age" to "Must be a number"),
            fields { BookingAnswers.validate(questions, mapOf("extra" to "x", "age" to "old"), enforceRequired = true) },
        )
        // Staff bookings don't enforce required questions.
        assertEquals(emptyList(), BookingAnswers.validate(questions, emptyMap(), enforceRequired = false))
    }

    @Test
    fun `an edit validates only the changed answers and keeps the others, even to retired questions`() {
        val retired = AnswerDto("old", "Old question", "kept as answered", false)
        val stale = AnswerDto("pick", "Question pick", "An option that was renamed", false)
        val stored = listOf(retired, AnswerDto("a", "Question a", "one", false), stale)
        val questions = listOf(q("a", "text"), q("pick", "select", options = listOf("Yes", "No")), q("b", "number"))
        assertEquals(
            listOf(retired, AnswerDto("a", "Question a", "uno", false), stale, AnswerDto("b", "Question b", "2", false)),
            BookingAnswers.merge(stored, questions, mapOf("a" to " uno ", "b" to "2")),
        )
        // An empty value clears an answer; a changed answer is still checked, and unknown or retired ids are refused.
        assertEquals(listOf(retired, stale), BookingAnswers.merge(stored, questions, mapOf("a" to "")))
        assertEquals(mapOf("answers.b" to "Must be a number"), fields { BookingAnswers.merge(stored, questions, mapOf("b" to "two")) })
        assertEquals(mapOf("answers.old" to "Unknown question"), fields { BookingAnswers.merge(stored, questions, mapOf("old" to "x")) })
    }
}
