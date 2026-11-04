package ie.bookanything.marketplace

import ie.bookanything.http.Errors
import java.util.Base64
import java.util.UUID

/** Opaque, URL-safe encoding of [SearchCursor]. */
object SearchCursors {
    private val encoder = Base64.getUrlEncoder().withoutPadding()

    fun encode(c: SearchCursor): String = encoder.encodeToString(
        when (c) {
            is SearchCursor.ByDistance -> "d:${c.id}:${c.distanceKm}"
            is SearchCursor.ByName -> "n:${c.id}:${c.sortName}"
        }.toByteArray(Charsets.UTF_8),
    )

    /** Decodes [raw]; the cursor must match the sort of the current search ([byDistance]). */
    fun decode(raw: String?, byDistance: Boolean): SearchCursor? {
        if (raw.isNullOrBlank()) return null
        val invalid = { Errors.field("cursor", "Invalid cursor") }
        val text = try {
            String(Base64.getUrlDecoder().decode(raw), Charsets.UTF_8)
        } catch (e: IllegalArgumentException) { throw invalid() }
        val parts = text.split(':', limit = 3)
        if (parts.size != 3) throw invalid()
        val id = runCatching { UUID.fromString(parts[1]) }.getOrNull() ?: throw invalid()
        return when {
            parts[0] == "d" && byDistance -> SearchCursor.ByDistance(
                parts[2].toDoubleOrNull()?.takeIf { it.isFinite() } ?: throw invalid(), id,
            )
            parts[0] == "n" && !byDistance -> SearchCursor.ByName(parts[2], id)
            else -> throw invalid()
        }
    }
}
