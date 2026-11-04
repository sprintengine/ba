package ie.bookanything.marketplace

import ie.bookanything.audit.Actor
import ie.bookanything.audit.Audit
import ie.bookanything.business.BusinessRow
import ie.bookanything.geo.GeocodeJobs
import ie.bookanything.geo.LocationRepository
import ie.bookanything.http.Errors
import ie.bookanything.http.formatInstant
import ie.bookanything.marketplace.MarketplaceCategories.toDto
import java.sql.Connection
import java.time.Instant

/** The owner's "List on the bookanything marketplace" setting. Listing is a Pro and Business feature, commission-free. */
object MarketplaceSettings {
    fun eligible(b: BusinessRow) = b.plan.isPaid

    fun get(conn: Connection, business: BusinessRow): MarketplaceSettingsDto {
        val listing = MarketplaceRepository.listing(conn, business.id)
        val query = LocationRepository.queryFor(business)
        val stored = LocationRepository.get(conn, business.id)?.takeIf { it.addressKey == query.key }
        val status = when {
            query.isEmpty -> "missing_address"
            stored == null -> "pending"
            stored.point == null -> "not_found"
            else -> "located"
        }
        return MarketplaceSettingsDto(
            listed = listing != null,
            category = listing?.category ?: MarketplaceCategories.forIndustry(business.industry).key,
            eligible = eligible(business),
            location = stored?.point?.let {
                LocationDto(
                    it.latitude, it.longitude, stored.precision, stored.source,
                    formatInstant(stored.geocodedAt, business.zone),
                )
            },
            locationStatus = status,
            categories = MarketplaceCategories.ALL.map { it.toDto() },
        )
    }

    fun update(
        conn: Connection, business: BusinessRow, input: MarketplaceSettingsInput, actor: Actor, now: Instant,
    ): MarketplaceSettingsDto {
        val current = MarketplaceRepository.listing(conn, business.id)
        val category = input.category?.let { MarketplaceCategories.byKey(it) ?: throw Errors.field("category", "Unknown category") }
            ?: MarketplaceCategories.byKey(current?.category) ?: MarketplaceCategories.forIndustry(business.industry)
        if (input.listed) {
            if (!eligible(business)) {
                throw Errors.planLimit(
                    "Listing on the bookanything marketplace is included in the Pro and Business plans. Upgrade to list ${business.name}.",
                )
            }
            MarketplaceRepository.upsert(conn, business.id, category.key, now)
            if (LocationRepository.get(
                    conn,
                    business.id,
                )?.addressKey != LocationRepository.queryFor(business).key
            ) {
                GeocodeJobs.enqueue(conn, business.id)
            }
            Audit.record(
                conn, business.id, actor, if (current == null) "marketplace.listed" else "marketplace.updated", "business",
                business.id,
                mapOf("category" to category.key),
            )
        } else if (current != null) {
            MarketplaceRepository.delete(conn, business.id)
            Audit.record(conn, business.id, actor, "marketplace.unlisted", "business", business.id)
        }
        return get(conn, business)
    }
}
