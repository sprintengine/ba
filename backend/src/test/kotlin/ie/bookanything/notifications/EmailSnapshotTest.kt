package ie.bookanything.notifications

import ie.bookanything.support.Snapshots
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlin.test.Test

/** Pins every email exactly (subject, text and HTML), so layout refactors can't change what customers receive. */
class EmailSnapshotTest {
    private fun json(m: EmailMessage) = JsonObject(
        mapOf("subject" to JsonPrimitive(m.subject), "text" to JsonPrimitive(m.text), "html" to JsonPrimitive(m.html)),
    )

    @Test
    fun `every template renders unchanged`() {
        val logoBrand = EmailBrand(businessName = "Sunny <Salon>", primaryColor = "#FDE047", logoUrl = "https://cdn.example/logo.png")
        val invitation = EmailTemplates.teamInvitation(logoBrand, "Avery", "admin", "https://x.ie/i/t")
        val emails = EmailTemplates.ALL.associateWith { json(EmailPreviews.render(it)!!) } +
            ("light_brand_with_logo" to json(EmailTemplates.toMessage(logoBrand, invitation, "a@b.ie")))
        Snapshots.assertMatches("emails", JsonObject(emails).toString())
    }
}
