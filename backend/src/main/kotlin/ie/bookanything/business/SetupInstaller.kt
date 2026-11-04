package ie.bookanything.business

import ie.bookanything.audit.Actor
import ie.bookanything.audit.Audit
import ie.bookanything.availability.AvailabilityRepository
import ie.bookanything.availability.ValidRule
import ie.bookanything.customers.CustomerGroupInput
import ie.bookanything.customers.CustomerGroupRepository
import ie.bookanything.db.update
import ie.bookanything.http.Errors
import ie.bookanything.http.Validator
import ie.bookanything.resources.ResourceInput
import ie.bookanything.resources.ResourceRepository
import ie.bookanything.services.FormQuestionInput
import ie.bookanything.services.QuestionRepository
import ie.bookanything.services.ServiceInput
import ie.bookanything.services.ServiceRepository
import ie.bookanything.services.ServiceRequirementInput
import ie.bookanything.templates.BusinessSetup
import ie.bookanything.templates.SetupQuestion
import java.sql.Connection
import java.util.UUID

/** Validates a [BusinessSetup] and creates the business with everything in it. */
object SetupInstaller {
    /** Validation of a whole setup ([SetupValidation]); kept here because onboarding and the draft generators ask the installer. */
    fun validate(setup: BusinessSetup): Validator = SetupValidation.validate(setup)

    /** The service input a setup service becomes, with its keys resolved to [resources] and [groups] ids. */
    internal fun toServiceInput(
        s: ie.bookanything.templates.SetupService, resources: Map<String, UUID>, groups: Map<String, UUID>,
    ) = ServiceInput(
        name = s.name, description = s.description, category = s.category, color = s.color, durationMinutes = s.durationMinutes,
        bufferBeforeMinutes = s.bufferBeforeMinutes, bufferAfterMinutes = s.bufferAfterMinutes, slotIntervalMinutes = s.slotIntervalMinutes,
        minNoticeMinutes = s.minNoticeMinutes, maxAdvanceDays = s.maxAdvanceDays, capacity = s.capacity, priceCents = s.priceCents,
        paymentMode = s.paymentMode, depositCents = s.depositCents, requiresApproval = s.requiresApproval, locationType = s.locationType,
        allowedGroupIds = s.allowedGroupKeys.mapNotNull { groups[it]?.toString() }.distinct(), isPublic = s.isPublic, isActive = true,
        sortOrder = 0, options = s.options, addons = s.addons,
        requirements = s.requirements.mapIndexed { i, r ->
            ServiceRequirementInput(
                label = r.label, quantity = r.quantity, customerSelectable = r.customerSelectable, sortOrder = i,
                resourceIds = r.resourceKeys.mapNotNull { resources[it]?.toString() }.distinct(),
            )
        },
    )

    /** The question input a setup question becomes, asked for [serviceId] (null: every service). */
    internal fun toQuestionInput(q: SetupQuestion, serviceId: UUID?, sortOrder: Int) = FormQuestionInput(
        serviceId = serviceId?.toString(), label = q.label, helpText = q.helpText, kind = q.kind, options = q.options,
        required = q.required, sensitive = q.sensitive, sortOrder = sortOrder, isActive = true,
    )

    /** Creates the business owned by [ownerUserId]. Caller runs this in a transaction. Returns the business id. */
    fun install(conn: Connection, setup: BusinessSetup, ownerUserId: UUID, actor: Actor, status: String = "active"): UUID {
        validate(setup).throwIfInvalid()
        val slug = if (setup.slug != null) {
            if (BusinessRepository.slugExists(conn, setup.slug)) throw Errors.slugTaken(SlugService.suggest(conn, setup.slug))
            setup.slug
        } else {
            SlugService.suggest(conn, ReservedSlugs.slugify(setup.name))
        }

        val businessId = BusinessRepository.insert(
            conn,
            BusinessRepository.NewBusiness(
                slug = slug, name = setup.name.trim(), description = setup.description?.trim()?.ifEmpty { null },
                industry = setup.industry.trim(),
                timezone = setup.timezone, currency = setup.currency, locale = setup.locale, country = setup.country, status = status,
                contactEmail = null, contactPhone = null, address = Address(), websiteUrl = null,
                branding = setup.branding.copy(primaryColor = setup.branding.primaryColor.lowercase()), vocabulary = setup.vocabulary,
                policies = setup.policies,
            ),
        )
        conn.update(
            "INSERT INTO business_members (business_id, user_id, role, status) VALUES (?, ?, 'owner', 'active')",
            businessId, ownerUserId,
        )
        val groupIds = setup.customerGroups.mapIndexed { i, g ->
            g.key to UUID.fromString(
                CustomerGroupRepository.insert(conn, businessId, CustomerGroupInput(g.name, g.description, g.restricted, i, true)).id,
            )
        }.toMap()
        val palette = listOf("#0ea5e9", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#6366f1", "#14b8a6", "#ec4899")
        val resourceIds = setup.resources.mapIndexed { i, r ->
            val id = UUID.fromString(
                ResourceRepository.insert(
                    conn, businessId,
                    ResourceInput(
                        kind = r.kind, name = r.name.trim(), description = r.description?.trim()?.ifEmpty { null },
                        color = palette[i % palette.size],
                        capacity = r.capacity, memberId = null, isActive = true, sortOrder = i,
                    ),
                    null,
                ).id,
            )
            r.weeklyHours.forEach { h ->
                AvailabilityRepository.insertRule(
                    conn, businessId, id,
                    ValidRule(
                        h.dayOfWeek, java.time.LocalTime.parse(h.startTime), java.time.LocalTime.parse(h.endTime), null, null,
                        h.audienceGroupKeys.map { groupIds.getValue(it) },
                    ),
                )
            }
            r.key to id
        }.toMap()
        val serviceIds = setup.services.mapIndexed { i, s ->
            val input = toServiceInput(s, resourceIds, groupIds).copy(sortOrder = i)
            s.name.trim().lowercase() to ServiceRepository.insert(conn, businessId, input)
        }.toMap()
        setup.questions.forEachIndexed { i, q ->
            val serviceId = q.serviceName?.let { serviceIds.getValue(it.trim().lowercase()) }
            QuestionRepository.insert(conn, businessId, toQuestionInput(q, serviceId, sortOrder = i))
        }
        Audit.record(
            conn, businessId, actor, "business.created", "business", businessId,
            mapOf(
                "name" to setup.name, "slug" to slug, "industry" to setup.industry, "source" to setup.source,
            ),
        )
        return businessId
    }
}
