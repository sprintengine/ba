package ie.bookanything.business

import ie.bookanything.audit.Audit
import ie.bookanything.auth.BusinessAccess
import ie.bookanything.auth.Role
import ie.bookanything.geo.GeocodeJobs
import ie.bookanything.http.Errors
import ie.bookanything.http.Patch
import ie.bookanything.http.Validator
import kotlinx.serialization.serializer
import java.sql.Connection

/** `PATCH /businesses/{id}`: business details, address, branding, vocabulary and policies. */
object BusinessSettings {
    /**
     * [b] with [patch] applied and validated (one INVALID_REQUEST with every field problem, in field order); no
     * database access.
     */
    fun apply(b: BusinessRow, patch: Patch): BusinessRow {
        val v = Validator()
        val name = v.requireText(patch.requiredString("name", b.name), "name", 100) ?: b.name
        val slug = patch.requiredString("slug", b.slug).trim().lowercase()
        if (slug != b.slug) ReservedSlugs.problem(slug)?.let { v.error("slug", it) }
        val regional = regional(b, patch, v)
        val status = status(b, patch, v)
        val address = patch.merge("address", b.address, serializer<Address>())
        val styled = withStyle(b, patch, v)
        val updated = regional.copy(
            name = name, slug = slug, status = status, branding = styled.branding, vocabulary = styled.vocabulary,
            policies = styled.policies,
            description = v.requireText(patch.string("description", b.description), "description", 2000, required = false),
            contactEmail = v.email(patch.string("contactEmail", b.contactEmail), "contactEmail", required = false),
            contactPhone = v.phone(patch.string("contactPhone", b.contactPhone), "contactPhone", required = false),
            websiteUrl = v.url(patch.string("websiteUrl", b.websiteUrl), "websiteUrl"),
            address = address(address, v),
            aiAgents = aiAgents(b.aiAgents, patch, v),
        )
        v.throwIfInvalid()
        return updated
    }

    /**
     * Applies [patch] to the business as it is now, read and locked inside the transaction (the request's copy may be
     * stale: publishing the site sets the brand colour meanwhile), and saves it.
     */
    fun update(conn: Connection, access: BusinessAccess, patch: Patch) {
        if (AI_AGENT_FIELDS.any(patch::has)) access.requireRole(Role.OWNER)
        val current = BusinessRepository.lockById(conn, access.businessId) ?: throw Errors.notFound("Business")
        save(conn, access, current, apply(current, patch), patch.keys)
    }

    /** Saves [updated] (from [apply]) over [b], the locked row: the slug must be free; a new address is geocoded again. */
    private fun save(conn: Connection, access: BusinessAccess, b: BusinessRow, updated: BusinessRow, fields: Collection<String>) {
        if (updated.slug != b.slug && BusinessRepository.slugExists(conn, updated.slug, b.id)) {
            throw Errors.slugTaken(SlugService.suggest(conn, updated.slug, b.id))
        }
        BusinessRepository.update(conn, updated)
        // A new address moves the business on the marketplace (geocoded by the job worker).
        if (updated.address != b.address) GeocodeJobs.enqueue(conn, b.id)
        Audit.record(conn, b.id, access.actor, "business.updated", "business", b.id, mapOf("fields" to fields.toList()))
    }

    // Fields only an owner may change: who may use AI agents here, and which of their changes need approval.
    private val AI_AGENT_FIELDS = listOf("aiAgentsAccess", "aiAgentsAutoApprove")

    private fun aiAgents(current: AiAgentsPolicy, patch: Patch, v: Validator): AiAgentsPolicy {
        val access = patch.requiredString("aiAgentsAccess", current.access.key)
        val kinds = patch.stringList("aiAgentsAutoApprove", current.autoApprove.map { it.key })
        val parsedAccess = AiAgentsAccess.entries.firstOrNull { it.key == access }
        if (parsedAccess == null) v.error("aiAgentsAccess", "Must be off, admins or team")
        val parsedKinds = kinds.mapNotNull(AgentChangeKind::parse)
        if (parsedKinds.size != kinds.size) {
            v.error("aiAgentsAutoApprove", "Each must be one of ${AgentChangeKind.entries.joinToString { it.key }}")
        }
        return AiAgentsPolicy(parsedAccess ?: current.access, parsedKinds.toSet())
    }

    /** Timezone, currency and locale, each kept when absent or invalid (the invalid value is reported). */
    private fun regional(b: BusinessRow, patch: Patch, v: Validator) = b.copy(
        zone = if (patch.has("timezone")) v.zone(patch.string("timezone", null), "timezone") ?: b.zone else b.zone,
        currency = if (patch.has("currency")) v.currency(patch.string("currency", null), "currency") ?: b.currency else b.currency,
        locale = if (patch.has("locale")) v.locale(patch.string("locale", null), "locale") ?: b.locale else b.locale,
    )

    private fun status(b: BusinessRow, patch: Patch, v: Validator): String {
        val status = patch.requiredString("status", b.status)
        if (patch.has("status")) v.oneOf(status, "status", setOf("draft", "active")) { it }
        return status
    }

    private fun address(address: Address, v: Validator) = Address(
        v.requireText(address.line1, "address.line1", 200, required = false),
        v.requireText(address.line2, "address.line2", 200, required = false),
        v.requireText(address.city, "address.city", 100, required = false),
        v.requireText(address.postcode, "address.postcode", 20, required = false),
    )

    /** Branding, vocabulary and policies, validated with the onboarding rules when the patch changes them. */
    private fun withStyle(b: BusinessRow, patch: Patch, v: Validator): BusinessRow {
        val branding = patch.merge("branding", b.branding, serializer<Branding>())
        val vocabulary = patch.merge("vocabulary", b.vocabulary, serializer<Vocabulary>())
        val policies = patch.merge("policies", b.policies, serializer<Policies>())
        if (patch.has("branding")) SetupValidation.validateBranding(branding, v)
        if (patch.has("vocabulary")) SetupValidation.validateVocabulary(vocabulary, v)
        if (patch.has("policies")) SetupValidation.validatePolicies(policies, v)
        val normalised = branding.copy(primaryColor = branding.primaryColor.lowercase())
        return b.copy(branding = normalised, vocabulary = vocabulary, policies = policies)
    }
}
