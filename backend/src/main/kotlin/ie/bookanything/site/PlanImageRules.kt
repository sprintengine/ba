package ie.bookanything.site

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/** Image rules (section 15.4): uploads of this business, Unsplash stock with attribution, or a generated pattern. */
object PlanImageRules {
    /** `{uuid}.{ext}` as written by the upload endpoint. */
    val UPLOAD_FILE = Regex("^[0-9a-f-]{36}\\.(png|jpg|webp)$")
    val STOCK_URL = Regex("^https://images\\.unsplash\\.com/[A-Za-z0-9._~:/?#@!$&+,;=%-]*$")
    val ATTRIBUTION_URL = Regex("^https://unsplash\\.com/[A-Za-z0-9._~:/?#@!$&+,;=%-]*$")

    fun isOwnUpload(url: String, refs: SiteRefs): Boolean {
        val prefix = refs.uploadPrefix ?: return false
        return url.startsWith(prefix) && UPLOAD_FILE.matches(url.removePrefix(prefix))
    }

    fun read(parent: PlanNode, key: String, el: JsonElement): SiteImage? {
        val o = el as? JsonObject ?: run { parent.error(key, "Must be an image object or null"); return null }
        val n = PlanNode(o, parent.p(key), parent.v, parent.refs)
        n.allow("kind", "url", "alt", "pattern", "attribution")
        val kind = n.choice("kind", ImageKind.entries) ?: return null
        val alt = n.text("alt", 140).orEmpty()
        return when (kind) {
            ImageKind.GENERATED -> generated(n, alt)
            ImageKind.UPLOAD -> upload(n, alt)
            ImageKind.STOCK -> stock(n, alt)
        }
    }

    private fun generated(n: PlanNode, alt: String): SiteImage? {
        if (n.has("url")) n.error("url", "Generated images have no URL")
        return n.choice("pattern", GeneratedPattern.entries)?.let { SiteImage.generated(it, alt) }
    }

    private fun upload(n: PlanNode, alt: String): SiteImage? {
        val url = n.text("url", 500, required = true) ?: return null
        val problem = when {
            n.refs.uploadPrefix == null -> "Image uploads are not available"
            !isOwnUpload(url, n.refs) -> "Must be an image uploaded to this business"
            else -> null
        }
        problem?.let { n.error("url", it) }
        return if (problem == null) SiteImage(ImageKind.UPLOAD, url, alt, null, null) else null
    }

    private fun stock(n: PlanNode, alt: String): SiteImage? {
        val url = n.text("url", 1000, required = true) ?: return null
        if (!STOCK_URL.matches(url)) {
            n.error("url", "Must be an https://images.unsplash.com/ image")
            return null
        }
        return n.child("attribution", required = true)?.let(::attribution)?.let { SiteImage(ImageKind.STOCK, url, alt, null, it) }
    }

    /** The photographer's name and Unsplash profile, both required. */
    private fun attribution(a: PlanNode): SiteAttribution? {
        a.allow("name", "url")
        val name = a.text("name", 100, required = true)
        val profile = a.text("url", 500, required = true)
        val unsplashProfile = profile?.takeIf { ATTRIBUTION_URL.matches(it) }
        if (profile != null && unsplashProfile == null) a.error("url", "Must be an https://unsplash.com/ link")
        return if (name != null && unsplashProfile != null) SiteAttribution(name, unsplashProfile) else null
    }
}
