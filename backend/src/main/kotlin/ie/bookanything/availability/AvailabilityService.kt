package ie.bookanything.availability

import ie.bookanything.business.BusinessRow
import ie.bookanything.customers.CustomerGroupRepository
import ie.bookanything.http.Errors
import ie.bookanything.http.formatInstant
import ie.bookanything.http.startIn
import ie.bookanything.offers.SlotOfferDto
import ie.bookanything.releases.DayLock
import ie.bookanything.releases.ReleaseBook
import ie.bookanything.releases.ReleaseRepository
import ie.bookanything.services.ServiceDef
import kotlinx.serialization.Serializable
import java.sql.Connection
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

@Serializable
data class SlotDto(
    val start: String,
    val end: String,
    val resourceIds: List<String>,
    val seatsLeft: Int?,
    /** Set when an offer discounts this slot (public and staff availability; section 19). */
    val offer: SlotOfferDto? = null,
)

/**
 * One day's free times. A day a release schedule keeps closed (section 21) that would have times shows none, with
 * [opensAt] (when it opens) or [held] (closed until the business opens it).
 */
@Serializable
data class DayDto(val date: String, val slots: List<SlotDto>, val opensAt: String? = null, val held: Boolean = false)

@Serializable
data class AvailabilityDto(
    val timezone: String,
    val from: String,
    val to: String,
    val durationMinutes: Int,
    val days: List<DayDto>,
    /** True when the business offers only its next available time, so [days] hold at most one slot. */
    val nextAvailableOnly: Boolean,
)

enum class AvailabilityMode {
    /** Customer-facing: min notice, max advance, release schedules and public-only rules apply. */
    PUBLIC,

    /** Staff/dashboard: no notice window (but never in the past), no max advance, no release schedules. */
    STAFF,
}

data class AvailabilityRequest(
    val business: BusinessRow,
    val service: ServiceDef,
    val optionId: UUID? = null,
    val addonIds: List<UUID> = emptyList(),
    val groupId: UUID? = null,
    /** Customer's choice for the customer-selectable requirement. */
    val selectedResourceId: UUID? = null,
    /** Staff-chosen resources (each must belong to one requirement pool). */
    val forcedResourceIds: List<UUID>? = null,
    val from: LocalDate,
    val to: LocalDate,
    val mode: AvailabilityMode,
    val excludeBookingId: UUID? = null,
    /** Keeps an existing booking's duration on reschedule. */
    val fixedDurationMinutes: Int? = null,
    val onlyStart: Instant? = null,
    /** Which of the free times the response shows (customer paths step forward and may see only the next one). */
    val shown: ShownSlots = ShownSlots.ALL,
    /**
     * A booking being moved by its customer keeps who it is with: the resource it has for the customer-selectable
     * requirement stands in for [selectedResourceId] when none is given, while it can still serve the service.
     */
    val keptResourceId: UUID? = null,
    /** Customer rules without release schedules: what a release will open (the dashboard's release counts). */
    val ignoreReleases: Boolean = false,
)

/**
 * Free times per day, and the days release schedules keep closed that would otherwise have times ([slots] has none for
 * them).
 */
data class ComputedDays(val slots: Map<LocalDate, List<ComputedSlot>>, val locks: Map<LocalDate, DayLock> = emptyMap())

data class Pricing(val durationMinutes: Int, val priceCents: Int, val optionName: String?)

/** When a new booking may start: not before [earliestStart], on no later date than [latestDate] (null: no limit). */
data class BookingWindow(val earliestStart: Instant, val latestDate: LocalDate?)

object AvailabilityService {
    const val MAX_RANGE_DAYS = 31L

    /** Effective duration and price for a service/option/add-on selection. Validates ids. */
    fun pricing(service: ServiceDef, optionId: UUID?, addonIds: List<UUID>, requireOption: Boolean = false): Pricing {
        val option = optionId?.let { id ->
            service.options.firstOrNull { it.id == id } ?: throw Errors.field("optionId", "Unknown option for this service")
        }
        if (requireOption && option == null && service.options.isNotEmpty()) {
            // Booking a service that has options requires choosing one.
            throw Errors.field("optionId", "Choose an option")
        }
        val addons = addonIds.distinct().map { id ->
            service.addons.firstOrNull { it.id == id } ?: throw Errors.field("addonIds", "Unknown add-on for this service")
        }
        return Pricing(
            durationMinutes = (option?.durationMinutes ?: service.durationMinutes) + addons.sumOf { it.extraMinutes },
            priceCents = (option?.priceCents ?: service.priceCents) + addons.sumOf { it.priceCents },
            optionName = option?.name,
        )
    }

    /** True when the group may book this service at all (service allowed groups). */
    fun groupMayBook(service: ServiceDef, groupId: UUID?): Boolean =
        service.allowedGroupIds.isEmpty() || (groupId != null && groupId in service.allowedGroupIds)

    fun compute(conn: Connection, req: AvailabilityRequest, now: Instant): Map<LocalDate, List<ComputedSlot>> =
        computeDays(conn, req, now).slots

    /** [compute] with the days release schedules keep closed. */
    fun computeDays(conn: Connection, req: AvailabilityRequest, now: Instant): ComputedDays =
        computeAllDays(conn, listOf(req), now).single()

    /** [computeAllDays] without the closed days. */
    fun computeAll(conn: Connection, reqs: List<AvailabilityRequest>, now: Instant): List<Map<LocalDate, List<ComputedSlot>>> =
        computeAllDays(conn, reqs, now).map { it.slots }

    /**
     * [computeDays] for several requests at once (other services, other businesses), in [reqs] order. Their slot data is
     * read together, so many requests cost the same handful of queries as one; each request still only sees its own
     * resources and its own business's closures, customer groups and release schedules.
     */
    fun computeAllDays(conn: Connection, reqs: List<AvailabilityRequest>, now: Instant): List<ComputedDays> {
        val durations = reqs.map { req -> req.fixedDurationMinutes ?: pricing(req.service, req.optionId, req.addonIds).durationMinutes }
        val asked = reqs.mapNotNull { req -> req.groupId?.let { req.business.id to it } }.toSet()
        // One query for every customer group asked about, however many requests.
        if (!CustomerGroupRepository.activePairs(conn, asked).containsAll(asked)) throw Errors.field("groupId", "Unknown customer group")
        val bookable = reqs.filter { groupMayBook(it.service, it.groupId) }
        val resourceIds = bookable.flatMap { r -> r.service.requirements.flatMap { it.resourceIds } }.toSet()
        val active = SlotDataRepository.activeResources(conn, bookable.map { it.business.id }.toSet(), resourceIds)
        val plans = reqs.map { req -> if (groupMayBook(req.service, req.groupId)) plan(req, active) else null }
        val data = SlotData.load(conn, reqs.zip(plans).mapNotNull { (req, plan) -> plan?.let { req to it } }, now)
        return reqs.mapIndexed { i, req ->
            val plan = plans[i]
            if (plan == null) {
                ComputedDays(emptyDays(req.from, req.to))
            } else {
                withReleases(req, SlotEngine.findSlots(slotQuery(req, durations[i], plan, data, now)), data, now)
            }
        }
    }

    /**
     * [days] with the days release schedules keep closed to [req]'s customer emptied, and when each opens. Only days with
     * times are locked: a day with nothing free (or no hours) stays as it is, so nobody is told to come back for it.
     */
    private fun withReleases(
        req: AvailabilityRequest, days: Map<LocalDate, List<ComputedSlot>>, data: SlotData, now: Instant,
    ): ComputedDays {
        val book = data.releases[req.business.id]
        if (!req.appliesReleases || book == null) return ComputedDays(days)
        val schedules = book.covering(req.service.id, req.groupId, data.restrictedGroups[req.business.id].orEmpty())
        if (schedules.isEmpty()) return ComputedDays(days)
        val locks = days.filterValues { it.isNotEmpty() }.keys
            .mapNotNull { date -> book.lock(schedules, date, req.business.zone, now)?.let { date to it } }.toMap()
        if (locks.isEmpty()) return ComputedDays(days)
        return ComputedDays(days.mapValues { (date, slots) -> if (date in locks) emptyList() else slots }, locks)
    }

    private val AvailabilityRequest.appliesReleases get() = mode == AvailabilityMode.PUBLIC && !ignoreReleases

    /** [req]'s active resources (of its own business) and requirement pools, or null when no resource can serve it. */
    private fun plan(req: AvailabilityRequest, active: Map<UUID, OwnedResource>): Plan? {
        val resources = req.service.requirements.flatMap { it.resourceIds }.mapNotNull { active[it] }
            .filter { it.businessId == req.business.id }.associate { it.spec.id to it.spec }
        val selected = req.selectedResourceId ?: req.keptResourceId?.takeIf { kept ->
            kept in resources && req.service.selectableRequirement?.resourceIds?.contains(kept) == true
        }
        val requirements = requirementPools(req.service, resources.keys, selected, req.forcedResourceIds?.distinct())
        return Plan(resources, requirements).takeIf { it.poolIds.isNotEmpty() }
    }

    private fun slotQuery(req: AvailabilityRequest, duration: Int, plan: Plan, data: SlotData, now: Instant): SlotQuery {
        val business = req.business
        val service = req.service
        val window = bookingWindow(service, business, req.mode, now)
        val pool = plan.poolIds
        return SlotQuery(
            zone = business.zone, from = req.from, to = req.to, now = now, serviceId = service.id,
            durationMinutes = duration, bufferBeforeMinutes = service.bufferBeforeMinutes,
            bufferAfterMinutes = service.bufferAfterMinutes,
            stepMinutes = maxOf(MIN_SLOT_STEP_MINUTES, service.slotIntervalMinutes ?: duration),
            earliestStart = window.earliestStart, latestDate = window.latestDate,
            capacity = service.capacity, requirements = plan.requirements, resources = plan.resources,
            rules = data.rules.filter { it.resourceId in pool },
            overrides = data.overrides[business.id].orEmpty().filter { it.resourceId == null || it.resourceId in pool },
            busy = data.busy.filter { it.resourceId in pool },
            audience = AudienceContext(req.groupId, data.restrictedGroups[business.id].orEmpty()),
            excludeBookingId = req.excludeBookingId, onlyStart = req.onlyStart,
        )
    }

    /** One request's active resources and requirement pools. */
    private class Plan(val resources: Map<UUID, ResourceSpec>, val requirements: List<RequirementSpec>) {
        val poolIds: Set<UUID> = requirements.flatMap { it.pool }.toSet()
    }

    /**
     * The rules, closures, allocations, restricted groups and release schedules for every planned request, read once over
     * the union of their pools, businesses and date ranges (a superset of each request's own, which the engine narrows by
     * resource and date).
     */
    private class SlotData(
        val rules: List<RuleSpec>,
        val overrides: Map<UUID, List<OverrideSpec>>,
        val busy: List<BusyAllocation>,
        val restrictedGroups: Map<UUID, Set<UUID>>,
        val releases: Map<UUID, ReleaseBook>,
    ) {
        companion object {
            private val NONE = SlotData(emptyList(), emptyMap(), emptyList(), emptyMap(), emptyMap())

            fun load(conn: Connection, planned: List<Pair<AvailabilityRequest, Plan>>, now: Instant): SlotData {
                if (planned.isEmpty()) return NONE
                val businessIds = planned.map { it.first.business.id }.toSet()
                val poolIds = planned.flatMap { it.second.poolIds }.toSet()
                val from = planned.minOf { it.first.from }
                val to = planned.maxOf { it.first.to }
                return SlotData(
                    rules = SlotDataRepository.rules(conn, businessIds, poolIds, from, to),
                    overrides = SlotDataRepository.overrides(conn, businessIds, poolIds, from, to),
                    // A day either side, so buffers and bookings crossing midnight count.
                    busy = SlotDataRepository.busy(
                        conn, businessIds, poolIds,
                        planned.minOf { (req, _) -> req.from.minusDays(1).startIn(req.business.zone) },
                        planned.maxOf { (req, _) -> req.to.plusDays(2).startIn(req.business.zone) }, now,
                    ),
                    restrictedGroups = CustomerGroupRepository.restrictedIds(conn, businessIds),
                    // Only customers' requests are subject to release schedules: staff ones skip the query.
                    releases = planned.filter { (req, _) -> req.appliesReleases }.map { it.first.business.id }.toSet()
                        .let { ids -> ReleaseRepository.books(conn, ids, from, to) },
                )
            }
        }
    }

    /**
     * Each requirement's pool: its [active] resources, narrowed to the customer's [selected] resource for the
     * customer-selectable requirement and to staff's [forced] resources where some of them belong. A choice the service
     * can't use is a field error (`resourceId` / `resourceIds`).
     */
    fun requirementPools(service: ServiceDef, active: Set<UUID>, selected: UUID?, forced: List<UUID>?): List<RequirementSpec> {
        if (selected != null && (service.selectableRequirement?.resourceIds?.contains(selected) != true || selected !in active)) {
            throw Errors.field("resourceId", "That choice is not available for this service")
        }
        forced?.forEach { rid ->
            if (service.requirements.none { rid in it.resourceIds } || rid !in active) {
                throw Errors.field("resourceIds", "Resource cannot be used for this service")
            }
        }
        return service.requirements.map { r ->
            val pool = if (r.customerSelectable && selected != null) listOf(selected) else r.resourceIds.filter { it in active }
            val chosen = forced?.let { f -> pool.filter { it in f } }.orEmpty()
            RequirementSpec(r.id, r.quantity, chosen.ifEmpty { pool })
        }
    }

    /**
     * When a slot may start: customers need the minimum notice and may book up to the maximum advance (the service's,
     * else the business's); staff may book anything from now on.
     */
    fun bookingWindow(service: ServiceDef, business: BusinessRow, mode: AvailabilityMode, now: Instant): BookingWindow {
        if (mode != AvailabilityMode.PUBLIC) return BookingWindow(now, null)
        val minNotice = (service.minNoticeMinutes ?: business.policies.minNoticeMinutes).toLong()
        val maxAdvance = (service.maxAdvanceDays ?: business.policies.maxAdvanceDays).toLong()
        return BookingWindow(now.plusSeconds(minNotice * SECONDS_PER_MINUTE), LocalDate.ofInstant(now, business.zone).plusDays(maxAdvance))
    }

    /** The wire form of [days]; [AvailabilityRequest.shown] applies last, after every other rule. */
    fun toDto(
        req: AvailabilityRequest, days: ComputedDays, durationMinutes: Int, offerFor: (ComputedSlot) -> SlotOfferDto? = { null },
    ): AvailabilityDto {
        val zone = req.business.zone
        // Offering the next time only, a lock on every closed day would tell which days have times: only the soonest
        // opening is told.
        val locks = if (req.shown.nextOnly) soonestOpening(days.locks) else days.locks
        return AvailabilityDto(
            timezone = zone.id, from = req.from.toString(), to = req.to.toString(), durationMinutes = durationMinutes,
            nextAvailableOnly = req.shown.nextOnly,
            days = NextAvailable.shown(days.slots, req.shown).map { (date, slots) ->
                val lock = locks[date]
                DayDto(
                    date.toString(),
                    slots.map { s ->
                        SlotDto(
                            formatInstant(s.start, zone), formatInstant(s.end, zone), s.assignments.map { it.resourceId.toString() },
                            s.seatsLeft, offerFor(s),
                        )
                    },
                    opensAt = lock?.opensAt?.let { formatInstant(it, zone) },
                    held = lock != null && lock.opensAt == null,
                )
            },
        )
    }

    private fun soonestOpening(locks: Map<LocalDate, DayLock>): Map<LocalDate, DayLock> {
        val soonest = locks.entries.mapNotNull { (date, lock) -> lock.opensAt?.let { date to it } }.minByOrNull { it.second }
        return if (soonest == null) emptyMap() else mapOf(soonest.first to DayLock(soonest.second))
    }

    private fun emptyDays(from: LocalDate, to: LocalDate): Map<LocalDate, List<ComputedSlot>> {
        val out = LinkedHashMap<LocalDate, List<ComputedSlot>>()
        var d = from
        while (!d.isAfter(to)) { out[d] = emptyList(); d = d.plusDays(1) }
        return out
    }
}

private const val SECONDS_PER_MINUTE = 60L

/** Slots never start more often than every 5 minutes, whatever the duration. */
private const val MIN_SLOT_STEP_MINUTES = 5
