package ie.bookanything.geo

/** `MAPBOX_ACCESS_TOKEN` enables Mapbox geocoding; without it the built-in [TableGeocoder] places businesses. */
data class GeoConfig(val mapboxAccessToken: String? = null) {
    fun geocoder(): Geocoder = mapboxAccessToken?.let { FallbackGeocoder(MapboxGeocoder(it), TableGeocoder()) } ?: TableGeocoder()

    val providerName: String get() = if (mapboxAccessToken != null) "mapbox" else "table"

    companion object {
        fun fromEnvironment(str: (String) -> String?) = GeoConfig(mapboxAccessToken = str("MAPBOX_ACCESS_TOKEN"))
    }
}
