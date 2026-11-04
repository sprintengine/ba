package ie.bookanything.business

import ie.bookanything.http.parseUuidOrNull
import java.text.Normalizer

/** Business slugs: the format, the reserved words (our own routes) and turning a name into a slug. */
object ReservedSlugs {
    val ALL = setOf(
        "api", "app", "admin", "dashboard", "my", "manage", "onboarding", "pricing", "for", "legal", "sign-in", "sign-up", "dev",
        "embed", "b", "help", "support", "blog", "about", "contact", "login", "logout", "signup", "settings", "static", "_next",
        "www", "mail", "invitations", "v1", "health", "explore", "oauth", "mcp",
        // Next.js metadata routes at the site root.
        "opengraph-image", "twitter-image", "icon", "apple-icon", "manifest", "robots", "sitemap",
    )
    private val FORMAT = Regex("^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$")

    fun problem(slug: String): String? = when {
        !FORMAT.matches(slug) -> "Use 3 to 50 lowercase letters, numbers or hyphens"
        slug.contains("--") -> "Must not contain consecutive hyphens"
        slug in ALL || looksLikeId(slug) -> "That address is reserved"
        else -> null
    }

    /** `GET /businesses/{idOrSlug}` reads a UUID as an id, so a slug must never be one. */
    private fun looksLikeId(slug: String) = parseUuidOrNull(slug) != null

    fun slugify(name: String): String {
        val ascii = Normalizer.normalize(name, Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "")
        val s = ascii.lowercase().replace("&", " and ").replace(Regex("[^a-z0-9]+"), "-").trim('-').take(50).trim('-')
        return when {
            s.length < 3 -> (s + "-booking").trim('-')
            s in ALL || looksLikeId(s) -> "$s-booking"
            else -> s
        }
    }
}
