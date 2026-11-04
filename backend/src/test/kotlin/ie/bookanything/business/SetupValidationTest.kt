package ie.bookanything.business

import ie.bookanything.http.Validator
import ie.bookanything.services.FormQuestionInput
import ie.bookanything.services.validateQuestion
import ie.bookanything.support.Fixtures
import ie.bookanything.templates.SetupQuestion
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class SetupValidationTest {
    private fun problems(vararg questions: SetupQuestion): Map<String, String> =
        SetupValidation.validate(Fixtures.clinicSetup("setup-rules").copy(questions = questions.toList())).errors()

    private fun select(options: List<String>) = SetupQuestion("Pick one", kind = "select", options = options)

    @Test
    fun `the fixture setup is valid`() {
        assertEquals(emptyMap(), SetupValidation.validate(Fixtures.clinicSetup("setup-rules")).errors())
    }

    @Test
    fun `questions follow the dashboard's option rules`() {
        val cases = listOf(
            select(emptyList()) to setOf("questions[0].options"),
            select(List(51) { "Option $it" }) to setOf("questions[0].options"),
            select(listOf("Fine", "x".repeat(101))) to setOf("questions[0].options[1]"),
            select(listOf("Fine", " ")) to setOf("questions[0].options[1]"),
            select(List(50) { "x".repeat(100) }) to emptySet(),
            SetupQuestion("", kind = "text") to setOf("questions[0].label"),
            SetupQuestion("Shoe size", kind = "slider") to setOf("questions[0].kind"),
            SetupQuestion("Why", serviceName = "Nope") to setOf("questions[0].serviceName"),
        )
        cases.forEach { (question, fields) -> assertEquals(fields, problems(question).keys, "for $question") }
    }

    @Test
    fun `a question onboarding accepts is one the dashboard accepts`() {
        // The same inputs through both doors give the same verdicts, so an onboarded question can always be edited later.
        val samples = listOf(
            select(listOf("A", "B")), select(emptyList()), select(List(51) { "o$it" }), select(listOf("y".repeat(101))),
            SetupQuestion("x".repeat(201)), SetupQuestion("Help", helpText = "h".repeat(501)), SetupQuestion("Fine", kind = "email"),
        )
        samples.forEach { q ->
            val viaSetup = problems(q).keys.map { it.removePrefix("questions[0].") }.toSet()
            val viaDashboard = validateQuestion(
                FormQuestionInput(label = q.label, helpText = q.helpText, kind = q.kind, options = q.options),
                Validator(),
            ).errors().keys
            assertEquals(viaDashboard, viaSetup, "for $q")
        }
        assertTrue(problems(select(listOf("A", "B"))).isEmpty())
    }
}
