package ie.bookanything.geo

/** A city or town people search the marketplace by (`/explore/{slug}`). */
data class Place(val slug: String, val name: String, val county: String, val point: GeoPoint)

/**
 * Built-in Irish places: city and town centres, Eircode routing areas and the (fictional) demo seed addresses.
 * Used by [TableGeocoder] and the marketplace city picker. Adding a city is one entry in [CITIES].
 */
object IrishPlaces {
    private fun p(slug: String, name: String, county: String, lat: Double, lng: Double) = Place(slug, name, county, GeoPoint(lat, lng))

    val CITIES: List<Place> = listOf(
        p("dublin", "Dublin", "Dublin", 53.3498, -6.2603),
        p("cork", "Cork", "Cork", 51.8985, -8.4756),
        p("galway", "Galway", "Galway", 53.2707, -9.0568),
        p("limerick", "Limerick", "Limerick", 52.6638, -8.6267),
        p("waterford", "Waterford", "Waterford", 52.2593, -7.1101),
        p("kilkenny", "Kilkenny", "Kilkenny", 52.6541, -7.2448),
        p("sligo", "Sligo", "Sligo", 54.2766, -8.4761),
        p("athlone", "Athlone", "Westmeath", 53.4239, -7.9407),
        p("drogheda", "Drogheda", "Louth", 53.7179, -6.3561),
        p("dundalk", "Dundalk", "Louth", 54.0090, -6.4049),
        p("wexford", "Wexford", "Wexford", 52.3369, -6.4633),
        p("killarney", "Killarney", "Kerry", 52.0599, -9.5044),
        p("tralee", "Tralee", "Kerry", 52.2713, -9.6999),
        p("ennis", "Ennis", "Clare", 52.8436, -8.9864),
        p("letterkenny", "Letterkenny", "Donegal", 54.9558, -7.7342),
        p("bray", "Bray", "Wicklow", 53.2028, -6.0983),
        p("navan", "Navan", "Meath", 53.6528, -6.6814),
        p("carlow", "Carlow", "Carlow", 52.8408, -6.9261),
        p("mullingar", "Mullingar", "Westmeath", 53.5259, -7.3381),
        p("castlebar", "Castlebar", "Mayo", 53.8547, -9.2988),
        p("clonmel", "Clonmel", "Tipperary", 52.3551, -7.7039),
        p("tullamore", "Tullamore", "Offaly", 53.2739, -7.4889),
        p("naas", "Naas", "Kildare", 53.2159, -6.6669),
        p("swords", "Swords", "Dublin", 53.4597, -6.2181),
        p("portlaoise", "Portlaoise", "Laois", 53.0344, -7.2998),
    )

    private val bySlug = CITIES.associateBy { it.slug }
    private val byName = CITIES.associateBy { it.name.lowercase() }

    fun city(slug: String): Place? = bySlug[slug.trim().lowercase()]

    /** Matches a free-text city ("Dublin 2", "Co. Cork", "galway city") to a known place. */
    fun cityByName(raw: String?): Place? {
        val text = raw?.trim()?.lowercase()?.removePrefix("co. ")?.removePrefix("county ") ?: return null
        byName[text]?.let { return it }
        val first = text.split(Regex("[\\s,]+")).firstOrNull() ?: return null
        return byName[first]
    }

    /** Eircode routing keys (the first three characters) → approximate area centre. */
    val ROUTING_KEYS: Map<String, GeoPoint> = mapOf(
        "D01" to GeoPoint(53.3522, -6.2560), "D02" to GeoPoint(53.3398, -6.2512), "D04" to GeoPoint(53.3270, -6.2280),
        "D06" to GeoPoint(53.3200, -6.2650), "D08" to GeoPoint(53.3380, -6.2880), "D14" to GeoPoint(53.2950, -6.2500),
        "T12" to GeoPoint(51.8930, -8.4700), "T23" to GeoPoint(51.9150, -8.4400),
        "H91" to GeoPoint(53.2730, -9.0520), "V94" to GeoPoint(52.6620, -8.6300), "X91" to GeoPoint(52.2590, -7.1110),
        "R95" to GeoPoint(52.6530, -7.2470), "F91" to GeoPoint(54.2720, -8.4730), "N37" to GeoPoint(53.4230, -7.9400),
    )

    /**
     * The fictional demo addresses used by `seed-demo`, keyed by [GeocodeQuery.key] without the country part
     * ("line1|line2|city|postcode"), so the demo data is placed precisely and deterministically.
     */
    val SAMPLE_ADDRESSES: Map<String, GeoPoint> = mapOf(
        "unit 4, lantern quay||dublin|d02 xy01" to GeoPoint(53.3446, -6.2395),
        "orchard business park|bay road|cork|t12 ab34" to GeoPoint(51.8902, -8.4388),
        "7 tuning fork lane||galway|h91 cd56" to GeoPoint(53.2741, -9.0489),
        "2 meadowbrook green||dublin|d14 ef78" to GeoPoint(53.2962, -6.2571),
    )
}
