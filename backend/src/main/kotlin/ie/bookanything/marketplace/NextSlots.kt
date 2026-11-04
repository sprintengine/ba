package ie.bookanything.marketplace

import ie.bookanything.availability.AvailabilityMode
import ie.bookanything.availability.AvailabilityRequest
import ie.bookanything.availability.AvailabilityService
import ie.bookanything.availability.ComputedSlot
import ie.bookanything.business.BusinessRow
import ie.bookanything.http.formatInstant
import ie.bookanything.offers.OfferBook
import ie.bookanything.payments.PaymentProvider
import ie.bookanything.services.OptionDef
import ie.bookanything.services.ServiceDef
import ie.bookanything.services.ServiceDto
import ie.bookanything.services.toDef
import java.sql.Connection
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/** The bookable services a marketplace card shows: public, open to everyone, payable. */
data class ServicesSummary(val services: List<ServiceDef>, val priceFromCents: Int?)

/** One business's card: its bookable [services] and [offers], and the dates to look in. */
data class NextSlotsWanted(
    val business: BusinessRow, val services: List<ServiceDef>, val offers: OfferBook, val from: LocalDate, val to: LocalDate,
)

/**
 * Earliest bookable times for marketplace cards. Bounded: at most [MAX_SERVICES] services per business, a window of
 * at most 7 days, [MAX_SLOTS] distinct start times (one for a business that offers only its next available time); every
 * business and service of a search page is computed by the normal engine in one pass (a fixed number of queries for the
 * whole page). Results are cached per business, window and offers for [ttl] because many searches show the same
 * businesses; a booking made meanwhile may still show its time for up to [ttl] (booking re-checks it).
 */
class NextSlotsFinder(private val payments: PaymentProvider, private val ttl: Duration = Duration.ofSeconds(30)) {
    /** [offersHash] (of the business's active offers) changes whenever an offer changes, so discount flags are never stale. */
    private data class Key(val businessId: UUID, val from: LocalDate, val to: LocalDate, val offersHash: Int, val limit: Int)
    private data class Entry(val at: Instant, val slots: List<NextSlotDto>)

    private val cache = ConcurrentHashMap<Key, Entry>()

    /** The services of [business] (from [all], every one it has) a card shows, and their "from" price. */
    fun services(business: BusinessRow, all: List<ServiceDto>): ServicesSummary {
        val payable = payments.chargesEnabled(business)
        val services = all.map { it.toDef() }
            .filter { it.isActive && it.isPublic && it.allowedGroupIds.isEmpty() && (payable || !it.needsOnlinePayment) }
        // Services with options are booked through an option, so their options set the "from" price.
        return ServicesSummary(services, services.minOfOrNull(FromPrice::of))
    }

    /** The next times of each of [wanted], in order: cached ones as they are, the rest computed together. */
    fun find(conn: Connection, wanted: List<NextSlotsWanted>, now: Instant): List<List<NextSlotDto>> {
        val keys = wanted.map { w ->
            Key(w.business.id, w.from, w.to, w.offers.offers.hashCode(), limit(w.business))
        }
        val cached = keys.map { key ->
            cache[key]?.takeIf { Duration.between(it.at, now) < ttl && !now.isBefore(it.at) }?.slots
        }
        val requests = wanted.indices.filter { cached[it] == null }.flatMap { i -> requests(wanted[i]).map { i to it } }
        val computed = AvailabilityService.computeAll(conn, requests.map { it.second.request }, now)
        val found = requests.indices.groupBy({ requests[it].first }, { requests[it].second to computed[it] })
        return wanted.mapIndexed { i, w ->
            cached[i] ?: pick(w, found[i].orEmpty()).also { slots ->
                if (cache.size > MAX_CACHE_ENTRIES) cache.clear()
                cache[keys[i]] = Entry(now, slots)
            }
        }
    }

    /** A service's availability request; a service with options is shown with its cheapest option (duration and price). */
    private class ServiceRequest(val service: ServiceDef, val option: OptionDef?, val price: Int, val request: AvailabilityRequest)

    private fun requests(w: NextSlotsWanted): List<ServiceRequest> = w.services.take(MAX_SERVICES).map { service ->
        val option = service.options.minByOrNull { it.priceCents }
        ServiceRequest(
            service, option, AvailabilityService.pricing(service, option?.id, emptyList()).priceCents,
            AvailabilityRequest(w.business, service, optionId = option?.id, from = w.from, to = w.to, mode = AvailabilityMode.PUBLIC),
        )
    }

    /** Distinct times (a card shouldn't repeat "Today 09:00"); at the same time a deal price wins, then service name. */
    private fun pick(w: NextSlotsWanted, found: List<Pair<ServiceRequest, Map<LocalDate, List<ComputedSlot>>>>): List<NextSlotDto> {
        val limit = limit(w.business)
        return found.flatMap { (s, days) ->
            days.values.flatten().take(limit).map { slot ->
                slot.start to NextSlotDto(
                    formatInstant(slot.start, w.business.zone), s.service.id.toString(), s.service.name,
                    s.option?.id?.toString(), s.option?.name, s.price, w.offers.slotOffer(s.service.id, slot.start, s.price),
                )
            }
        }
            .sortedWith(compareBy({ it.first }, { it.second.offer == null }, { it.second.serviceName }))
            .distinctBy { it.first }.take(limit).map { it.second }
    }

    private fun limit(business: BusinessRow) = if (business.policies.nextAvailableOnly) 1 else MAX_SLOTS

    companion object {
        const val MAX_SERVICES = 4
        const val MAX_SLOTS = 3
        private const val MAX_CACHE_ENTRIES = 5_000
    }
}
