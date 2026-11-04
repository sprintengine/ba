package ie.bookanything.marketplace

import ie.bookanything.services.ServiceDef

/** The "from" price of a service on marketplace cards and in the price filter: its cheapest option, else its own price. */
object FromPrice {
    fun of(service: ServiceDef): Int = service.options.minOfOrNull { it.priceCents } ?: service.priceCents

    /** [of] in SQL, for a service aliased `s`. */
    const val SQL =
        "COALESCE((SELECT min(o.price_cents) FROM service_options o WHERE o.business_id = s.business_id AND o.service_id = s.id), " +
            "s.price_cents)"
}
