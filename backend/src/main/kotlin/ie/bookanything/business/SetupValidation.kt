package ie.bookanything.business

import ie.bookanything.http.Validator
import ie.bookanything.resources.RESOURCE_KINDS
import ie.bookanything.services.validateQuestion
import ie.bookanything.services.validateService
import ie.bookanything.templates.BusinessSetup
import ie.bookanything.templates.SetupGroup
import ie.bookanything.templates.SetupQuestion
import ie.bookanything.templates.SetupResource
import ie.bookanything.templates.SetupService
import java.util.UUID

/**
 * Validation of a [BusinessSetup] (onboarding, AI and template drafts) before anything is inserted. Cross references use
 * keys (group keys, resource keys, service names), so every section is checked against the others' keys. The
 * vocabulary, branding and policy rules are shared with `PATCH /businesses/{id}`.
 */
object SetupValidation {
    fun validate(setup: BusinessSetup): Validator {
        val v = Validator()
        validateDetails(setup, v)
        val groupKeys = setup.customerGroups.map { it.key }
        validateGroups(setup.customerGroups, v)
        val resourceKeys = setup.resources.map { it.key }
        validateResources(setup.resources, groupKeys, v)
        val serviceNames = setup.services.map { it.name.trim().lowercase() }
        validateServices(setup.services, resourceKeys, groupKeys, v)
        validateQuestions(setup.questions, serviceNames, v)
        return v
    }

    fun validateVocabulary(voc: Vocabulary, v: Validator) {
        listOf(
            "resource" to voc.resource, "resources" to voc.resources, "customer" to voc.customer, "customers" to voc.customers,
            "booking" to voc.booking, "bookings" to voc.bookings,
        ).forEach { (k, value) -> v.requireText(value, "vocabulary.$k", 40) }
    }

    fun validateBranding(b: Branding, v: Validator) {
        v.color(b.primaryColor, "branding.primaryColor")
        v.url(b.logoUrl, "branding.logoUrl")
        v.url(b.coverImageUrl, "branding.coverImageUrl")
    }

    fun validatePolicies(p: Policies, v: Validator) {
        v.range(p.minNoticeMinutes, "policies.minNoticeMinutes", 0, 60 * 24 * 90)
        v.range(p.maxAdvanceDays, "policies.maxAdvanceDays", 1, 730)
        v.range(p.cancellationNoticeHours, "policies.cancellationNoticeHours", 0, 24 * 60)
        v.range(p.lateCancellationRefundPercent, "policies.lateCancellationRefundPercent", 0, 100)
        v.range(p.holdMinutes, "policies.holdMinutes", Policies.HOLD_MINUTES.first, Policies.HOLD_MINUTES.last)
    }

    private fun validateDetails(setup: BusinessSetup, v: Validator) {
        v.requireText(setup.name, "name", 100)
        setup.slug?.let { slug -> ReservedSlugs.problem(slug)?.let { v.error("slug", it) } }
        v.requireText(setup.industry, "industry", 50)
        v.requireText(setup.description, "description", 2000, required = false)
        v.zone(setup.timezone, "timezone")
        v.currency(setup.currency, "currency")
        v.locale(setup.locale, "locale")
        v.country(setup.country, "country")
        validateVocabulary(setup.vocabulary, v)
        validateBranding(setup.branding, v)
        validatePolicies(setup.policies, v)
    }

    private fun validateGroups(groups: List<SetupGroup>, v: Validator) {
        val keys = groups.map { it.key }
        if (keys.size != keys.toSet().size) v.error("customerGroups", "Group keys must be unique")
        groups.forEachIndexed { i, g ->
            v.requireText(g.key, "customerGroups[$i].key", 50)
            v.requireText(g.name, "customerGroups[$i].name", 100)
            v.requireText(g.description, "customerGroups[$i].description", 500, required = false)
        }
    }

    private fun validateResources(resources: List<SetupResource>, groupKeys: List<String>, v: Validator) {
        val keys = resources.map { it.key }
        if (keys.size != keys.toSet().size) v.error("resources", "Resource keys must be unique")
        if (resources.size > MAX_RESOURCES) v.error("resources", "At most $MAX_RESOURCES resources")
        resources.forEachIndexed { i, r ->
            val p = "resources[$i]."
            v.requireText(r.key, "${p}key", 50)
            v.oneOf(r.kind, "${p}kind", RESOURCE_KINDS) { it }
            v.requireText(r.name, "${p}name", 100)
            v.requireText(r.description, "${p}description", 1000, required = false)
            v.range(r.capacity, "${p}capacity", 1, 1000)
            validateWeeklyHours(r, p, groupKeys, v)
        }
    }

    private fun validateWeeklyHours(r: SetupResource, p: String, groupKeys: List<String>, v: Validator) {
        r.weeklyHours.forEachIndexed { j, h ->
            val q = "${p}weeklyHours[$j]."
            v.range(h.dayOfWeek, "${q}dayOfWeek", 1, 7)
            val s = v.time(h.startTime, "${q}startTime")
            val e = v.time(h.endTime, "${q}endTime")
            if (s != null && e != null && !e.isAfter(s)) v.error("${q}endTime", "Must be after startTime")
            h.audienceGroupKeys.forEach { if (it !in groupKeys) v.error("${q}audienceGroupKeys", "Unknown group key '$it'") }
        }
    }

    private fun validateServices(services: List<SetupService>, resourceKeys: List<String>, groupKeys: List<String>, v: Validator) {
        val names = services.map { it.name.trim().lowercase() }
        if (names.size != names.toSet().size) v.error("services", "Service names must be unique")
        if (services.size > MAX_SERVICES) v.error("services", "At most $MAX_SERVICES services")
        services.forEachIndexed { i, s ->
            validateService(SetupInstaller.toServiceInput(s, fakeIds(resourceKeys), fakeIds(groupKeys)), v.nested("services[$i]."))
            s.requirements.forEachIndexed { j, r ->
                r.resourceKeys.forEach {
                    if (it !in resourceKeys) v.error("services[$i].requirements[$j].resourceKeys", "Unknown resource key '$it'")
                }
                if (r.resourceKeys.toSet().size <
                    r.quantity
                ) {
                    v.error("services[$i].requirements[$j].quantity", "Pool is smaller than quantity")
                }
            }
            s.allowedGroupKeys.forEach { if (it !in groupKeys) v.error("services[$i].allowedGroupKeys", "Unknown group key '$it'") }
        }
    }

    private fun validateQuestions(questions: List<SetupQuestion>, serviceNames: List<String>, v: Validator) {
        questions.forEachIndexed { i, q ->
            val p = "questions[$i]."
            // The dashboard's rules (label, kind, option count and length), so an onboarded question can be edited later.
            validateQuestion(SetupInstaller.toQuestionInput(q, serviceId = null, sortOrder = i), v.nested(p))
            q.serviceName?.let { if (it.trim().lowercase() !in serviceNames) v.error("${p}serviceName", "Unknown service '$it'") }
        }
    }

    /** Distinct stand-in ids so structural service validation can run before anything is inserted. */
    private fun fakeIds(keys: List<String>): Map<String, UUID> = keys.distinct().mapIndexed { i, k -> k to UUID(0, i + 1L) }.toMap()

    private const val MAX_RESOURCES = 100
    private const val MAX_SERVICES = 100
}
