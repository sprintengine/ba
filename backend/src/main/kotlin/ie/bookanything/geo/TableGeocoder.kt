package ie.bookanything.geo

/**
 * Deterministic geocoder with no network: known addresses first, then the Eircode routing area, then the city
 * centre. Development and tests use it directly; production uses it as the fallback behind Mapbox so a business
 * with only a city still appears in city searches.
 */
class TableGeocoder(
    private val knownAddresses: Map<String, GeoPoint> = IrishPlaces.SAMPLE_ADDRESSES,
) : Geocoder {
    override fun geocode(query: GeocodeQuery): GeocodeResult? {
        if (query.isEmpty || query.country.uppercase() != "IE") return null
        knownAddresses[query.key.substringBeforeLast('|')]?.let { return GeocodeResult(it, GeoPrecision.ADDRESS, SOURCE) }
        val routingKey = query.postcode?.trim()?.uppercase()?.replace(" ", "")?.take(3)
        IrishPlaces.ROUTING_KEYS[routingKey]?.let { return GeocodeResult(it, GeoPrecision.POSTCODE, SOURCE) }
        IrishPlaces.cityByName(query.city)?.let { return GeocodeResult(it.point, GeoPrecision.CITY, SOURCE) }
        return null
    }

    companion object {
        const val SOURCE = "table"
    }
}
