package ie.bookanything.support

import ie.bookanything.business.Policies
import ie.bookanything.templates.BusinessSetup
import ie.bookanything.templates.SetupGroup
import ie.bookanything.templates.SetupQuestion
import ie.bookanything.templates.SetupRequirement
import ie.bookanything.templates.SetupResource
import ie.bookanything.templates.SetupService
import ie.bookanything.templates.SetupWeeklyHours
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import java.util.UUID

/** A small, fully controlled business used by route tests (all times Europe/Dublin). */
data class Clinic(
    val id: String,
    val slug: String,
    val owner: TestUser,
    val services: Map<String, String>,
    val resources: Map<String, String>,
    val groups: Map<String, String>,
    val questions: Map<String, String>,
) {
    val base get() = "/v1/businesses/$id"
    val public get() = "/v1/public/businesses/$slug"
    fun service(name: String) = services.getValue(name)
    fun resource(name: String) = resources.getValue(name)
}

object Fixtures {
    private fun weekdays(start: String, end: String, groups: List<String> = emptyList()) =
        (1..5).map { SetupWeeklyHours(it, start, end, groups) }

    fun clinicSetup(slug: String, timezone: String = "Europe/Dublin") = BusinessSetup(
        name = "Test Clinic $slug", slug = slug, industry = "physio", timezone = timezone,
        policies = Policies(
            minNoticeMinutes = 60, maxAdvanceDays = 60, cancellationNoticeHours = 24, lateCancellationRefundPercent = 50,
            allowCustomerCancel = true, allowCustomerReschedule = true, holdMinutes = 15, requireCustomerPhone = false,
        ),
        customerGroups = listOf(
            SetupGroup("members", "Members", null, restricted = false),
            SetupGroup("vip", "VIP", null, restricted = true),
        ),
        resources = listOf(
            SetupResource(
                "alex", "person", "Alex",
                weeklyHours = weekdays("09:00", "17:00") + SetupWeeklyHours(6, "09:00", "12:00", listOf("vip")),
            ),
            SetupResource("blake", "person", "Blake", weeklyHours = weekdays("13:00", "17:00")),
            SetupResource(
                "room", "space", "Room",
                weeklyHours = weekdays("09:00", "17:00") + SetupWeeklyHours(6, "09:00", "12:00", listOf("vip")),
            ),
            SetupResource("studio", "space", "Studio", capacity = 3, weeklyHours = weekdays("18:00", "20:00")),
        ),
        services = listOf(
            SetupService(
                name = "Consult", durationMinutes = 60, slotIntervalMinutes = 30, priceCents = 0, paymentMode = "free",
                requirements = listOf(
                    SetupRequirement("Therapist", 1, true, listOf("alex", "blake")),
                    SetupRequirement("Room", 1, false, listOf("room")),
                ),
            ),
            SetupService(
                name = "Paid consult", durationMinutes = 60, priceCents = 5000, paymentMode = "full",
                requirements = listOf(SetupRequirement("Therapist", 1, true, listOf("alex", "blake"))),
            ),
            SetupService(
                name = "Deposit consult", durationMinutes = 60, priceCents = 8000, paymentMode = "deposit", depositCents = 2000,
                requirements = listOf(SetupRequirement("Therapist", 1, true, listOf("alex", "blake"))),
            ),
            SetupService(
                name = "Approval consult", durationMinutes = 30, priceCents = 3000, paymentMode = "at_venue",
                requiresApproval = true,
                requirements = listOf(SetupRequirement("Therapist", 1, true, listOf("alex", "blake"))),
            ),
            SetupService(
                name = "Class", durationMinutes = 60, capacity = 3, priceCents = 0, paymentMode = "free",
                requirements = listOf(SetupRequirement("Studio", 1, false, listOf("studio"))),
            ),
            SetupService(
                name = "Members only", durationMinutes = 30, priceCents = 0, paymentMode = "free",
                allowedGroupKeys = listOf("members"),
                requirements = listOf(SetupRequirement("Therapist", 1, false, listOf("alex"))),
            ),
            SetupService(
                name = "Buffered", durationMinutes = 45, bufferBeforeMinutes = 15, bufferAfterMinutes = 15, priceCents = 0,
                paymentMode = "free",
                requirements = listOf(SetupRequirement("Therapist", 1, false, listOf("blake"))),
            ),
        ),
        questions = listOf(
            SetupQuestion("Reason for visit", kind = "textarea", required = true, sensitive = true, serviceName = "Consult"),
            SetupQuestion("Referred by", kind = "select", options = listOf("Friend", "Search"), required = false),
        ),
    )

    /** Creates the clinic via the API as [owner] and resolves ids. */
    suspend fun clinic(api: Api, owner: TestUser = TestUser.create("owner", "Olive Owner"), timezone: String = "Europe/Dublin"): Clinic =
        api.createBusiness(clinicSetup(unique("clinic"), timezone), owner)

    /**
     * Lets the whole team use AI apps, and (by default) every kind of single change go ahead once the app confirms it,
     * so tests of the tools needn't approve each change on bookanything (AgentApprovalsTest covers that).
     */
    suspend fun allowAgents(api: Api, clinic: Clinic, autoApprove: List<String> = AGENT_CHANGE_KINDS): Clinic {
        assertStatus(
            HttpStatusCode.OK,
            api.patch(clinic.base, jsonOf("aiAgentsAccess" to "team", "aiAgentsAutoApprove" to autoApprove), clinic.owner.token),
        )
        return clinic
    }

    val AGENT_CHANGE_KINDS = listOf("records", "bookings", "cancellations", "time_off", "settings")

    fun bookingBody(
        clinic: Clinic, service: String, start: String, email: String = "${unique("guest")}@example.test", name: String = "Jordan Casey",
        resourceId: String? = null, groupId: String? = null, optionId: String? = null, answers: Map<String, String>? = null,
        customerNotes: String? = null,
    ): String {
        val defaultAnswers = if (service == "Consult") {
            mapOf(
                clinic.questions.getValue("Reason for visit") to "Sore shoulder",
            )
        } else {
            emptyMap()
        }
        return jsonOf(
            "serviceId" to clinic.service(service), "optionId" to optionId, "addonIds" to emptyList<String>(), "groupId" to groupId,
            "resourceId" to resourceId, "start" to start,
            "customer" to mapOf("name" to name, "email" to email, "phone" to null),
            "answers" to (answers ?: defaultAnswers), "customerNotes" to customerNotes,
        )
    }

    suspend fun book(
        api: Api, clinic: Clinic, service: String, start: String, token: String? = null, key: String? = null,
        email: String? = null,
        resourceId: String? = null, groupId: String? = null,
    ): JsonObject {
        val res = api.post(
            "${clinic.public}/bookings",
            bookingBody(
                clinic, service, start, email = email ?: "${unique("guest")}@example.test", resourceId = resourceId,
                groupId = groupId,
            ),
            token, if (key != null) mapOf("Idempotency-Key" to key) else emptyMap(),
        )
        assertStatus(HttpStatusCode.Created, res)
        return res.obj()
    }

    suspend fun slots(api: Api, clinic: Clinic, service: String, date: String, extra: String = ""): List<String> {
        val res = api.get("${clinic.public}/availability?serviceId=${clinic.service(service)}&from=$date&to=$date$extra")
        assertStatus(HttpStatusCode.OK, res)
        return res.obj()["days"]!!.jsonArray.flatMap { d -> d.o["slots"]!!.jsonArray.map { it.s("start") } }
    }

    fun sql(update: String, vararg params: Any?) {
        TestDatabase.dataSource.connection.use { c ->
            c.prepareStatement(update).use { st ->
                params.forEachIndexed { i, p -> st.setObject(i + 1, p) }
                st.execute()
            }
        }
    }

    fun <T> sqlOne(query: String, vararg params: Any?, map: (java.sql.ResultSet) -> T): T? =
        TestDatabase.dataSource.connection.use { c ->
            c.prepareStatement(query).use { st ->
                params.forEachIndexed { i, p ->
                    st.setObject(i + 1, if (p is String && p.length == 36 && p[8] == '-') UUID.fromString(p) else p)
                }
                st.executeQuery().use { rs -> if (rs.next()) map(rs) else null }
            }
        }

    fun sqlAll(query: String, vararg params: Any?): List<String> =
        TestDatabase.dataSource.connection.use { c ->
            c.prepareStatement(query).use { st ->
                params.forEachIndexed { i, p ->
                    st.setObject(i + 1, if (p is String && p.length == 36 && p[8] == '-') UUID.fromString(p) else p)
                }
                st.executeQuery().use { rs -> generateSequence { if (rs.next()) rs.getString(1) else null }.toList() }
            }
        }
}
