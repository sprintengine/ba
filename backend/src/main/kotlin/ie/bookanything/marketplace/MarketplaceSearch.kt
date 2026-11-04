package ie.bookanything.marketplace

import ie.bookanything.business.BusinessRepository
import ie.bookanything.business.BusinessRow
import ie.bookanything.geo.Distance
import ie.bookanything.geo.IrishPlaces
import ie.bookanything.marketplace.MarketplaceCategories.toDto
import ie.bookanything.offers.OfferPricing
import ie.bookanything.offers.OfferService
import ie.bookanything.payments.PaymentProvider
import ie.bookanything.services.ServiceRepository
import java.sql.Connection
import java.time.Instant
import java.time.LocalDate
import kotlin.math.round

/**
 * Marketplace search (docs/architecture.md section 18). SQL finds listed businesses by text, category, distance,
 * price and deals in keyset order; availability ("today", "this week", a date) needs the booking engine, so
 * candidates are then checked in order until the page is full or [MAX_SCANNED] candidates were examined. Candidates
 * are checked a group at a time (as many as the page still needs, at least [MIN_GROUP]), each group's cards loaded
 * together in a fixed number of queries, never per business.
 */
class MarketplaceSearch(payments: PaymentProvider) {
    val nextSlots = NextSlotsFinder(payments)

    fun search(conn: Connection, f: SearchFilter, now: Instant): SearchResultDto {
        val byDistance = f.near != null
        val items = mutableListOf<ListingDto>()
        var after = f.cursor
        var scanned = 0
        var exhausted = false
        var lastIncluded: SearchCursor? = null
        var endOfResults = false
        while (items.size < f.limit && scanned < MAX_SCANNED && !exhausted) {
            val batchSize = minOf(maxOf(f.limit * 2, MIN_GROUP), MAX_SCANNED - scanned)
            val batch = MarketplaceRepository.candidates(conn, f, after, now, batchSize)
            exhausted = batch.size < batchSize
            var next = 0
            while (next < batch.size && items.size < f.limit) {
                // As many as the page still needs, but never fewer than MIN_GROUP: when the availability filter rejects
                // most candidates, groups of one would cost a round of queries per candidate.
                val group = batch.subList(next, minOf(batch.size, next + maxOf(f.limit - items.size, MIN_GROUP)))
                for ((c, listing) in group.zip(listings(conn, group, f, now))) {
                    if (items.size == f.limit) break // the rest of the group is left for the next page
                    scanned++
                    next++
                    after = c.cursor(byDistance)
                    listing?.let { items += it; lastIncluded = after }
                }
                if (items.size == f.limit) endOfResults = exhausted && next == batch.size
            }
        }
        // Full page: continue after the last result. Scan budget used: continue after the last candidate examined.
        val next = when {
            items.size == f.limit -> lastIncluded.takeUnless { endOfResults }
            !exhausted -> after
            else -> null
        }
        return SearchResultDto(
            items, next?.let(SearchCursors::encode),
            f.near?.let { SearchCenterDto(it.center.latitude, it.center.longitude, it.radiusKm, it.label) },
        )
    }

    /** The cards for [candidates], in order, null where the availability filter excludes one; loaded together. */
    private fun listings(conn: Connection, candidates: List<Candidate>, f: SearchFilter, now: Instant): List<ListingDto?> {
        val businesses = BusinessRepository.findByIds(conn, candidates.map { it.businessId }.toSet())
        val shown = candidates.mapNotNull { c -> businesses[c.businessId]?.let { Shown(c, it, f, now) }?.takeIf { it.inWindow } }
        val ids = shown.map { it.business.id }.toSet()
        val services = ServiceRepository.listByBusiness(conn, ids)
        val offers = OfferPricing.books(conn, shown.map { it.business }, now)
        val summaries = shown.map { nextSlots.services(it.business, services[it.business.id].orEmpty()) }
        val slots = nextSlots.find(
            conn,
            shown.mapIndexed { i, s ->
                NextSlotsWanted(s.business, summaries[i].services, offers.getValue(s.business.id).first, s.from, s.to)
            },
            now,
        )
        val cards = shown.mapIndexed { i, s ->
            val (book, stored) = offers.getValue(s.business.id)
            if (f.availability != null && slots[i].isEmpty()) return@mapIndexed null
            val deals = if (book.isEmpty) emptyList() else OfferService.publicOffers(book, stored, s.business.currency)
            s.candidate.businessId to ListingDto(
                business = businessDto(s.business, s.candidate),
                category = (MarketplaceCategories.byKey(s.candidate.category) ?: MarketplaceCategories.OTHER).toDto(),
                distanceKm = s.candidate.distanceKm?.let { round(it * 10) / 10 },
                rating = null,
                priceFromCents = summaries[i].priceFromCents,
                currency = s.business.currency,
                nextSlots = slots[i],
                deals = deals,
            )
        }.filterNotNull().toMap()
        return candidates.map { cards[it.businessId] }
    }

    /** A candidate whose business exists, with the dates its card looks in (the availability filter's, or this week). */
    private class Shown(val candidate: Candidate, val business: BusinessRow, f: SearchFilter, now: Instant) {
        private val today: LocalDate = LocalDate.ofInstant(now, business.zone)
        private val window = (f.availability ?: AvailabilityFilter.ThisWeek).window(today)
        val inWindow: Boolean = !window.endInclusive.isBefore(today)
        val from: LocalDate = maxOf(window.start, today)
        val to: LocalDate = window.endInclusive
    }

    private fun businessDto(b: BusinessRow, c: Candidate) = ListingBusinessDto(
        b.id.toString(), b.slug, b.name, b.description, b.timezone, b.address, b.branding,
        c.point?.let { LatLng(it.latitude, it.longitude) },
    )

    /** Categories and cities; a city counts the visible listings within [CITY_RADIUS_KM] of its centre. */
    fun meta(conn: Connection): MarketplaceMetaDto {
        val points = MarketplaceRepository.visiblePoints(conn)
        val cities = IrishPlaces.CITIES.map { city ->
            CityDto(
                city.slug, city.name, city.county, city.point.latitude, city.point.longitude,
                points.count { Distance.haversineKm(it, city.point) <= CITY_RADIUS_KM },
            )
        }
        return MarketplaceMetaDto(MarketplaceCategories.ALL.map { it.toDto() }, cities)
    }

    companion object {
        /** Candidates examined per request when the availability filter rejects some. */
        const val MAX_SCANNED = 60

        /** Fewest candidates checked together (one round of card queries), whatever the page still needs. */
        const val MIN_GROUP = 8
        const val CITY_RADIUS_KM = 20.0
        const val DEFAULT_RADIUS_KM = 25.0
        const val MAX_RADIUS_KM = 200.0
    }
}
