package ie.bookanything.offers

import ie.bookanything.audit.Actor
import ie.bookanything.audit.Audit
import ie.bookanything.availability.AvailabilityMode
import ie.bookanything.availability.AvailabilityRequest
import ie.bookanything.availability.AvailabilityService
import ie.bookanything.business.BusinessRow
import ie.bookanything.http.Errors
import ie.bookanything.http.Validator
import ie.bookanything.http.formatInstant
import ie.bookanything.http.parseDate
import ie.bookanything.services.ServiceRepository
import ie.bookanything.services.toDef
import java.sql.Connection
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/** Offer commands (owner/admin). Every method runs in the caller's tenant transaction. */
object OfferService {
    const val MAX_PREVIEW_DAYS = 14
    private const val MAX_PREVIEW_SLOTS = 200

    fun list(conn: Connection, business: BusinessRow): List<OfferDto> {
        val offers = OfferRepository.list(conn, business.id)
        val counts = OfferRepository.redemptions(conn, business.id, offers.map { it.rule.id })
        return offers.map { toDto(it, counts[it.rule.id] ?: 0, business) }
    }

    fun get(conn: Connection, business: BusinessRow, id: UUID): OfferDto {
        val stored = OfferRepository.get(conn, business.id, id) ?: throw Errors.notFound("Offer")
        return toDto(stored, OfferRepository.redemptions(conn, business.id, listOf(id))[id] ?: 0, business)
    }

    fun create(conn: Connection, business: BusinessRow, input: OfferInput, actor: Actor, now: Instant): OfferDto {
        val spec = validated(conn, business, input)
        val id = OfferRepository.insert(conn, business.id, spec, now)
        Audit.record(conn, business.id, actor, "offer.created", "offer", id, mapOf("name" to spec.name, "status" to spec.status.value))
        return get(conn, business, id)
    }

    fun update(conn: Connection, business: BusinessRow, id: UUID, input: OfferInput, actor: Actor, now: Instant): OfferDto {
        OfferRepository.get(conn, business.id, id) ?: throw Errors.notFound("Offer")
        val spec = validated(conn, business, input)
        OfferRepository.update(conn, business.id, id, spec, now)
        Audit.record(conn, business.id, actor, "offer.updated", "offer", id, mapOf("name" to spec.name, "status" to spec.status.value))
        return get(conn, business, id)
    }

    fun setStatus(conn: Connection, business: BusinessRow, id: UUID, status: OfferStatus, actor: Actor, now: Instant): OfferDto {
        OfferRepository.get(conn, business.id, id) ?: throw Errors.notFound("Offer")
        OfferRepository.setStatus(conn, business.id, id, status, now)
        Audit.record(conn, business.id, actor, if (status == OfferStatus.ACTIVE) "offer.resumed" else "offer.paused", "offer", id)
        return get(conn, business, id)
    }

    /** Deletes the offer. Bookings keep their price snapshot (the applied offer's name and discount). */
    fun delete(conn: Connection, business: BusinessRow, id: UUID, actor: Actor) {
        val stored = OfferRepository.get(conn, business.id, id) ?: throw Errors.notFound("Offer")
        OfferRepository.delete(conn, business.id, id)
        Audit.record(conn, business.id, actor, "offer.deleted", "offer", id, mapOf("name" to stored.rule.name))
    }

    /** Active offers customers can still get, for the business site, the booking flow and the marketplace. */
    fun publicOffers(conn: Connection, business: BusinessRow, now: Instant): List<PublicOfferDto> =
        publicOffers(OfferPricing.book(conn, business, now), OfferRepository.list(conn, business.id), business.currency)

    /** Those of [stored] (in their order) that [book] says customers can still get, as the public sees them. */
    fun publicOffers(book: OfferBook, stored: List<StoredOffer>, currency: String): List<PublicOfferDto> {
        val current = book.current().map { it.id }.toSet()
        return stored.filter { it.rule.id in current }.map { OfferPricing.toPublic(it.rule, it.description, currency) }
    }

    /**
     * Which bookable slots (public rules, no customer group, base price) a draft offer would discount over the next
     * [OfferPreviewInput.days] days, so the owner sees the effect before saving.
     */
    fun preview(conn: Connection, business: BusinessRow, input: OfferPreviewInput, now: Instant): OfferPreviewDto {
        val v = Validator()
        if (input.days !in 1..MAX_PREVIEW_DAYS) v.error("days", "Must be between 1 and $MAX_PREVIEW_DAYS")
        val spec = OfferValidation.validate(input.offer, v.nested("offer."))
        val today = LocalDate.ofInstant(now, business.zone)
        val from = input.from?.let { parseDate(it, "from") } ?: today
        v.throwIfInvalid()
        requireServices(conn, business, spec!!.serviceIds)
        val to = from.plusDays(input.days - 1L)
        val draft = spec.toRule(UUID(0, 0), now).copy(status = OfferStatus.ACTIVE)
        val services = ServiceRepository.list(conn, business.id, spec.serviceIds).map { it.toDef() }.filter { it.isActive && it.isPublic }
        var total = 0
        val affected = mutableListOf<Pair<LocalDate, PreviewSlotDto>>()
        val requests = services.map { AvailabilityRequest(business, it, from = from, to = to, mode = AvailabilityMode.PUBLIC) }
        for ((service, computed) in services.zip(AvailabilityService.computeAll(conn, requests, now))) {
            val price = AvailabilityService.pricing(service, null, emptyList()).priceCents
            computed.forEach { (date, slots) ->
                total += slots.size
                slots.forEach { slot ->
                    val applied = OfferMatcher.best(listOf(draft), service.id, slot.start, business.zone, now, price)
                    if (applied != null) {
                        affected += date to PreviewSlotDto(
                            formatInstant(slot.start, business.zone), service.id.toString(),
                            service.name, applied.originalCents, applied.finalCents,
                        )
                    }
                }
            }
        }
        val days = affected.sortedBy { it.second.start }.take(MAX_PREVIEW_SLOTS).groupBy({ it.first }, { it.second })
            .map { (date, slots) -> PreviewDayDto(date.toString(), slots) }
        return OfferPreviewDto(business.timezone, business.currency, from.toString(), to.toString(), total, affected.size, days)
    }

    private fun validated(conn: Connection, business: BusinessRow, input: OfferInput): OfferSpec {
        val v = Validator()
        val spec = OfferValidation.validate(input, v)
        v.throwIfInvalid()
        requireServices(conn, business, spec!!.serviceIds)
        return spec
    }

    private fun requireServices(conn: Connection, business: BusinessRow, ids: Set<UUID>) {
        val known = ServiceRepository.list(conn, business.id, ids).map { UUID.fromString(it.id) }.toSet()
        if (!known.containsAll(ids)) throw Errors.field("serviceIds", "Unknown service")
    }

    private fun toDto(s: StoredOffer, redemptions: Int, business: BusinessRow): OfferDto {
        val o = s.rule
        return OfferDto(
            id = o.id.toString(), name = o.name, description = s.description, serviceIds = o.serviceIds.map { it.toString() }.sorted(),
            discount = OfferMapping.discount(o.discount), schedule = OfferMapping.schedule(o.schedule),
            validFrom = o.schedule.validFrom?.toString(), validUntil = o.schedule.validUntil?.toString(), maxRedemptions = o.maxRedemptions,
            status = o.status.value, kind = o.kind.value, label = OfferText.label(o.discount, business.currency),
            summary = OfferText.summary(o.schedule), redemptions = redemptions,
            createdAt = formatInstant(o.createdAt, business.zone), updatedAt = formatInstant(s.updatedAt, business.zone),
        )
    }
}
