package ie.bookanything.config

import java.net.URI
import java.net.URISyntaxException

/**
 * The frontend URLs the API hands out (emails, MCP results, payment returns) and the origins a customer may be sent
 * back to. [base] is `APP_BASE_URL`; [embedOrigins] are the `CORS_ALLOWED_ORIGINS` that embed the booking flow.
 */
class AppUrls(val base: String, private val embedOrigins: List<String> = emptyList()) {
    fun bookingPage(slug: String) = "$base/$slug"

    /** A booking's manage page; [origin] is where the customer booked from (an allowed embed origin, else ours). */
    fun manage(token: String, origin: String = base) = "$origin/manage/$token"

    fun invitation(token: String) = "$base/invitations/$token"

    fun myBookings() = "$base/my/bookings"

    fun dashboardBookings(slug: String) = "$base/dashboard/$slug/bookings"

    /** Whether [url] belongs to our frontend or an allowed embed origin (the only places we redirect to). */
    fun isAllowed(url: String): Boolean = originOf(url)?.let { it == base || it in embedOrigins } ?: false

    /** The origin of [returnUrl] when it is allowed, else our frontend. */
    fun returnOrigin(returnUrl: String?): String {
        val candidate = returnUrl?.trim()?.trimEnd('/') ?: return base
        val origin = originOf(candidate) ?: return base
        return if (origin == base || origin in embedOrigins) origin else base
    }

    companion object {
        /** `scheme://authority` of [url], or null when it is not a valid URI. */
        fun originOf(url: String): String? = try {
            URI(url).let { "${it.scheme}://${it.authority}" }
        } catch (_: URISyntaxException) {
            null
        }
    }
}
