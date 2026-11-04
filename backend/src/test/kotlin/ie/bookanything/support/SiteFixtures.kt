package ie.bookanything.support

import ie.bookanything.business.Address
import ie.bookanything.business.Branding
import ie.bookanything.business.BusinessRow
import ie.bookanything.business.Plan
import ie.bookanything.business.Policies
import ie.bookanything.business.Vocabulary
import ie.bookanything.resources.ResourceDto
import ie.bookanything.services.ServiceDto
import ie.bookanything.services.ServiceOptionDto
import ie.bookanything.services.ServiceRequirementDto
import ie.bookanything.site.HoursInterval
import ie.bookanything.site.OpeningDay
import ie.bookanything.site.SiteContext
import ie.bookanything.site.SiteInputs
import ie.bookanything.site.SiteRefs
import ie.bookanything.site.SiteTeamPerson
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

/** In-memory site inputs for unit tests (no database). */
object SiteFixtures {
    val BUSINESS_ID: UUID = UUID.fromString("00000000-0000-0000-0000-00000000b001")
    const val SERVICE_A = "00000000-0000-0000-0000-00000000a001"
    const val SERVICE_B = "00000000-0000-0000-0000-00000000a002"
    const val PERSON_A = "00000000-0000-0000-0000-00000000c001"
    const val PERSON_B = "00000000-0000-0000-0000-00000000c002"
    const val UPLOAD_PREFIX = "http://localhost:3000/api/v1/public/uploads/00000000-0000-0000-0000-00000000b001/"
    const val OTHER_UPLOAD_PREFIX = "http://localhost:3000/api/v1/public/uploads/00000000-0000-0000-0000-00000000b002/"
    const val UPLOAD_FILE = "0f8fad5b-d9cb-469f-a165-70867728950e.png"

    val refs = SiteRefs(setOf(SERVICE_A, SERVICE_B), setOf(PERSON_A, PERSON_B), UPLOAD_PREFIX)

    fun business(
        industry: String = "physio",
        name: String = "Harbour Physio",
        description: String? = "Friendly physiotherapy by the sea.",
        city: String? = "Dublin",
        policies: Policies = Policies(),
        vocabulary: Vocabulary = Vocabulary("Therapist", "Therapists", "Client", "Clients", "Appointment", "Appointments"),
        primaryColor: String = "#0f766e",
        phone: String? = "+353 1 555 0100",
        email: String? = "hello@harbour.test",
    ) = BusinessRow(
        id = BUSINESS_ID, slug = "harbour-physio", name = name, description = description, industry = industry,
        zone = ZoneId.of("Europe/Dublin"), currency = "EUR", locale = "en-IE", country = "IE", status = "active",
        contactEmail = email, contactPhone = phone, address = Address("1 Quay Street", null, city, "D01 AB12"),
        websiteUrl = null, branding = Branding(primaryColor), vocabulary = vocabulary, policies = policies,
        stripeAccountId = null, stripeChargesEnabled = false, stripeDetailsSubmitted = false, plan = Plan.FREE, planStatus = null,
        createdAt = Instant.parse("2026-01-01T00:00:00Z"),
    )

    fun service(
        id: String = SERVICE_A, name: String = "Assessment", paymentMode: String = "full", priceCents: Int = 5000,
        requiresApproval: Boolean = false, selectable: Boolean = true, maxAdvanceDays: Int? = null, minNoticeMinutes: Int? = null,
        options: List<ServiceOptionDto> = emptyList(), isPublic: Boolean = true,
    ) = ServiceDto(
        id = id, name = name, description = "A $name.", category = null, color = "#0f766e", durationMinutes = 45,
        bufferBeforeMinutes = 0, bufferAfterMinutes = 0, slotIntervalMinutes = null, minNoticeMinutes = minNoticeMinutes,
        maxAdvanceDays = maxAdvanceDays, capacity = 1, priceCents = priceCents, paymentMode = paymentMode, depositCents = null,
        allowPayAtVenue = false,
        requiresApproval = requiresApproval, locationType = "business", allowedGroupIds = emptyList(), isPublic = isPublic, isActive = true,
        sortOrder = 0, options = options, addons = emptyList(),
        requirements = listOf(
            ServiceRequirementDto(
                UUID.randomUUID().toString(), "Therapist", 1, selectable, listOf(PERSON_A, PERSON_B),
                0,
            ),
        ),
    )

    fun person(id: String, name: String) = ResourceDto(id, "person", name, "$name works here.", "#64748b", 1, null, true, 0)

    fun inputs(
        business: BusinessRow = business(),
        services: List<ServiceDto> = listOf(service(), service(SERVICE_B, "Massage")),
        team: List<ResourceDto> = listOf(person(PERSON_A, "Sam Rivers"), person(PERSON_B, "Robin Ashby")),
    ) = SiteInputs(
        business, services, team,
        SiteContext(
            team = team.map { SiteTeamPerson(it.id, it.name, it.description) },
            openingHours = (1..7).map { d -> OpeningDay(d, if (d <= 5) listOf(HoursInterval("09:00", "17:00")) else emptyList()) },
        ),
    )
}
