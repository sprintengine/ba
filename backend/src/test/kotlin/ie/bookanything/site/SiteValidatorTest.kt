package ie.bookanything.site

import ie.bookanything.http.ApiException
import ie.bookanything.http.ApiJson
import ie.bookanything.site.PlanJson.with
import ie.bookanything.site.PlanJson.without
import ie.bookanything.support.SiteFixtures
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.serializer
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.test.fail

class SiteValidatorTest {
    private val validator = SiteValidator(SiteFixtures.refs)

    private fun ok(plan: JsonElement): SitePlan = try {
        validator.parse(plan)
    } catch (e: ApiException) {
        fail("Expected a valid plan but got ${e.fields}")
    }

    /** The plan is rejected with a problem at [path] (400 INVALID_REQUEST). */
    private fun rejected(plan: JsonElement, path: String, message: String? = null): Map<String, String> {
        val e = assertFailsWith<ApiException> { validator.parse(plan) }
        assertEquals("INVALID_REQUEST", e.code)
        assertEquals(400, e.status.value)
        assertTrue(path in e.fields, "expected a problem at $path, got ${e.fields}")
        if (message != null) assertTrue(e.fields.getValue(path).contains(message), "at $path: ${e.fields[path]}")
        return e.fields
    }

    private fun s(type: String) = "sections[${PlanJson.INDEX.getValue(type)}]"
    private fun str(n: Int, c: Char = 'x') = JsonPrimitive(c.toString().repeat(n))

    // ---- whole plan ----

    @Test
    fun `a plan using every section type is accepted and normalized`() {
        val plan = ok(PlanJson.valid())
        assertEquals(SiteTheme.CALM, plan.theme)
        assertEquals(10, plan.sections.size)
        assertEquals(SectionType.entries.toSet(), plan.sections.map { it.type }.toSet())
        assertEquals(plan, validator.check(plan), "validating the normalized plan again changes nothing")
        val encoded = ApiJson.encodeToJsonElement(serializer<SitePlan>(), plan).jsonObject
        val hero = (encoded["sections"] as JsonArray)[0].jsonObject["content"]!!.jsonObject
        assertEquals(setOf("variant", "eyebrow", "headline", "subheadline", "ctaLabel", "image"), hero.keys, "every field is present")
        val services = (encoded["sections"] as JsonArray)[1].jsonObject["content"]!!.jsonObject
        assertEquals(JsonNull, services["intro"], "explicit nulls")
    }

    @Test
    fun `missing optional fields get their defaults`() {
        val minimal = JsonObject(
            mapOf(
                "theme" to JsonPrimitive("minimal"),
                "palette" to JsonObject(mapOf("primaryColor" to JsonPrimitive("#0F766E"))),
                "sections" to JsonArray(
                    listOf(
                        JsonObject(
                            mapOf(
                                "id" to JsonPrimitive("hero"), "type" to JsonPrimitive("hero"),
                                "content" to JsonObject(mapOf("headline" to JsonPrimitive("  Hello  "))),
                            ),
                        ),
                    ) + listOf("services", "team", "gallery", "testimonials", "faq", "hours", "contact").map {
                        JsonObject(mapOf("id" to JsonPrimitive(it), "type" to JsonPrimitive(it)))
                    },
                ),
            ),
        )
        val plan = ok(minimal)
        assertEquals(SitePalette("#0f766e", null), plan.palette, "colours are lowercased, accent defaults to null")
        assertEquals(SiteSeo(null, null), plan.seo)
        assertEquals(HeroContent(HeroVariant.SPLIT, null, "Hello", null, "Book now", null), plan.sections[0].content)
        assertTrue(plan.sections.all { it.enabled })
        assertEquals(ServicesContent("Services", null, emptyList(), showPrices = true, showDurations = true), plan.sections[1].content)
        assertEquals(TeamContent("Meet the team", null, emptyList()), plan.sections[2].content)
        assertEquals(GalleryContent(null, emptyList()), plan.sections[3].content)
        assertEquals(TestimonialsContent("What our customers say", emptyList()), plan.sections[4].content)
        assertEquals(FaqContent("Frequently asked questions", emptyList()), plan.sections[5].content)
        assertEquals(HoursContent("Opening hours", null, showAddress = true, showMapLink = true), plan.sections[6].content)
        assertEquals(ContactContent("Get in touch", null, showPhone = true, showEmail = true, showAddress = true), plan.sections[7].content)
        // An explicit null CTA label stays null (the renderer uses its own default).
        assertNull((ok(minimal.with("sections[0].content.ctaLabel", JsonNull)).sections[0].content as HeroContent).ctaLabel)
    }

    @Test
    fun `required fields must be present and non-empty`() {
        val p = PlanJson.valid()
        rejected(p.without("theme"), "theme", "Required")
        rejected(p.without("palette"), "palette", "Required")
        rejected(p.without("palette.primaryColor"), "palette.primaryColor", "Required")
        rejected(p.without("${s("hero")}.id"), "${s("hero")}.id", "Required")
        rejected(p.without("${s("hero")}.type"), "${s("hero")}.type", "Required")
        rejected(p.without("${s("hero")}.content.headline"), "${s("hero")}.content.headline", "Required")
        rejected(p.with("${s("hero")}.content.headline", "   "), "${s("hero")}.content.headline", "Required")
        rejected(p.with("${s("hero")}.content.headline", JsonNull), "${s("hero")}.content.headline", "Required")
        rejected(p.without("${s("about")}.content.body"), "${s("about")}.content.body", "Required")
        rejected(p.with("${s("about")}.content.highlights[0]", ""), "${s("about")}.content.highlights[0]", "Required")
        rejected(p.with("${s("services")}.content.heading", ""), "${s("services")}.content.heading", "Required")
        rejected(p.with("${s("team")}.content.members[0].resourceId", ""), "${s("team")}.content.members[0].resourceId", "Required")
        rejected(p.with("${s("testimonials")}.content.items[0].author", ""), "${s("testimonials")}.content.items[0].author", "Required")
        rejected(p.with("${s("testimonials")}.content.items[0].quote", JsonNull), "${s("testimonials")}.content.items[0].quote", "Required")
        rejected(p.with("${s("faq")}.content.items[0].question", ""), "${s("faq")}.content.items[0].question", "Required")
        rejected(p.with("${s("faq")}.content.items[0].answer", " "), "${s("faq")}.content.items[0].answer", "Required")
        rejected(p.without("${s("cta")}.content.headline"), "${s("cta")}.content.headline", "Required")
        rejected(p.with("${s("cta")}.content.buttonLabel", JsonNull), "${s("cta")}.content.buttonLabel", "Required")
        rejected(p.with("${s("hours")}.content.heading", JsonNull), "${s("hours")}.content.heading", "Required")
        rejected(p.with("${s("contact")}.content.heading", ""), "${s("contact")}.content.heading", "Required")
        // Optional text: blank becomes null.
        assertNull((ok(p.with("${s("hero")}.content.eyebrow", "   ")).sections[0].content as HeroContent).eyebrow)
    }

    @Test
    fun `unknown themes, types, variants, patterns and kinds are rejected`() {
        val p = PlanJson.valid()
        rejected(p.with("theme", "neon"), "theme", "Must be one of")
        rejected(p.with("${s("faq")}.type", "pricing"), "${s("faq")}.type")
        rejected(p.with("${s("hero")}.content.variant", "fullscreen"), "${s("hero")}.content.variant")
        rejected(p.with("${s("hero")}.content.image.pattern", "stripes"), "${s("hero")}.content.image.pattern")
        rejected(p.with("${s("hero")}.content.image.kind", "video"), "${s("hero")}.content.image.kind")
        rejected(p.with("theme", JsonPrimitive(3)), "theme")
    }

    @Test
    fun `unknown fields are rejected with their path`() {
        val p = PlanJson.valid()
        rejected(p.with("${s("testimonials")}.content.rating", JsonPrimitive(5)), "${s("testimonials")}.content.rating", "Unknown field")
        rejected(p.with("${s("services")}.content.price", "€40"), "${s("services")}.content.price", "Unknown field")
        rejected(p.with("award", "Best clinic"), "award", "Unknown field")
        rejected(p.with("palette.secondary", "#000000"), "palette.secondary")
        rejected(p.with("seo.keywords", "physio"), "seo.keywords")
        rejected(p.with("${s("hero")}.style", "big"), "${s("hero")}.style")
        rejected(p.with("${s("hero")}.content.image.width", JsonPrimitive(10)), "${s("hero")}.content.image.width")
        rejected(p.with("${s("faq")}.content.items[0].votes", JsonPrimitive(1)), "${s("faq")}.content.items[0].votes")
        rejected(p.with("${s("testimonials")}.content.items[0].stars", JsonPrimitive(5)), "${s("testimonials")}.content.items[0].stars")
        rejected(p.with("${s("team")}.content.members[0].qualification", "MSc"), "${s("team")}.content.members[0].qualification")
        rejected(p.with("${s("about")}.content.image.attribution.email", "x@y.z"), "${s("about")}.content.image.attribution.email")
    }

    @Test
    fun `wrong JSON types are field errors, never crashes`() {
        val p = PlanJson.valid()
        rejected(p.with("${s("hero")}.content.headline", JsonPrimitive(5)), "${s("hero")}.content.headline", "Must be a string")
        rejected(p.with("${s("hero")}.enabled", "yes"), "${s("hero")}.enabled", "true or false")
        rejected(p.with("sections", "all"), "sections", "Must be a list")
        rejected(p.with("sections[0]", "hero"), "sections[0]", "Must be an object")
        rejected(p.with("${s("hero")}.content", JsonNull), "${s("hero")}.content", "Must be an object")
        rejected(p.with("palette", "teal"), "palette", "Must be an object")
        rejected(p.with("${s("services")}.content.serviceIds", "all"), "${s("services")}.content.serviceIds", "Must be a list")
        rejected(
            p.with("${s("services")}.content.serviceIds[0]", JsonPrimitive(1)), "${s("services")}.content.serviceIds[0]",
            "Must be a string",
        )
        rejected(p.with("${s("hero")}.content.image", "waves.png"), "${s("hero")}.content.image")
        rejected(p.with("${s("gallery")}.content.images[0]", JsonNull), "${s("gallery")}.content.images[0]", "Required")
        rejected(JsonPrimitive("plan"), "plan")
        rejected(JsonArray(emptyList()), "plan")
    }

    /** Every text limit of section 15.3: exactly the limit is accepted, one more is rejected. */
    @Test
    fun `text limits are exact`() {
        val limits = listOf(
            "${s("hero")}.content.eyebrow" to 60, "${s("hero")}.content.headline" to 90, "${s("hero")}.content.subheadline" to 240,
            "${s("hero")}.content.ctaLabel" to 30, "${s("hero")}.content.image.alt" to 140,
            "${s("services")}.content.heading" to 80, "${s("services")}.content.intro" to 300,
            "${s("team")}.content.heading" to 80, "${s("team")}.content.intro" to 300, "${s("team")}.content.members[0].bio" to 400,
            "${s("about")}.content.heading" to 80, "${s("about")}.content.body" to 1500, "${s("about")}.content.highlights[0]" to 60,
            "${s("about")}.content.image.attribution.name" to 100,
            "${s("gallery")}.content.heading" to 80,
            "${s("testimonials")}.content.heading" to 80, "${s("testimonials")}.content.items[0].quote" to 400,
            "${s("testimonials")}.content.items[0].author" to 60, "${s("testimonials")}.content.items[0].detail" to 60,
            "${s("faq")}.content.heading" to 80, "${s("faq")}.content.items[0].question" to 140,
            "${s("faq")}.content.items[0].answer" to 600,
            "${s("hours")}.content.heading" to 80, "${s("hours")}.content.note" to 200,
            "${s("cta")}.content.headline" to 90, "${s("cta")}.content.body" to 240, "${s("cta")}.content.buttonLabel" to 30,
            "${s("contact")}.content.heading" to 80, "${s("contact")}.content.body" to 300,
            "seo.title" to 70, "seo.description" to 160,
        )
        for ((path, max) in limits) {
            ok(PlanJson.valid().with(path, str(max)))
            rejected(PlanJson.valid().with(path, str(max + 1)), path, "at most $max")
        }
    }

    @Test
    fun `list limits are exact`() {
        fun list(n: Int, item: (Int) -> JsonElement) = JsonArray((0 until n).map(item))
        val image = PlanJson.valid().jsonObject["sections"]!!.let { (it as JsonArray)[PlanJson.INDEX.getValue("gallery")] }
            .jsonObject["content"]!!.jsonObject["images"]!!.jsonArray[0]
        val cases = listOf(
            Triple("${s("about")}.content.highlights", 4) { i: Int -> JsonPrimitive("Highlight $i") },
            Triple("${s("gallery")}.content.images", 12) { _: Int -> image },
            Triple(
                "${s("testimonials")}.content.items",
                8,
            ) { i: Int -> JsonObject(mapOf("quote" to JsonPrimitive("Q$i"), "author" to JsonPrimitive("A"))) },
            Triple(
                "${s("faq")}.content.items",
                12,
            ) { i: Int -> JsonObject(mapOf("question" to JsonPrimitive("Q$i?"), "answer" to JsonPrimitive("A"))) },
        )
        for ((path, max, item) in cases) {
            ok(PlanJson.valid().with(path, list(max, item)))
            rejected(PlanJson.valid().with(path, list(max + 1, item)), path, "At most $max")
        }
        rejected(
            PlanJson.valid().with(
                "${s("team")}.content.members",
                list(25) { JsonObject(mapOf("resourceId" to JsonPrimitive(SiteFixtures.PERSON_A))) },
            ),
            "${s("team")}.content.members",
            "At most 24",
        )
    }

    @Test
    fun `sixteen sections are allowed, seventeen are not`() {
        fun plan(n: Int) = PlanJson.valid().with(
            "sections",
            JsonArray(
                (0 until n).map {
                    JsonObject(mapOf("id" to JsonPrimitive("faq-$it"), "type" to JsonPrimitive("faq")))
                },
            ),
        )
        assertEquals(16, ok(plan(16)).sections.size)
        rejected(plan(17), "sections", "At most 16")
    }

    @Test
    fun `at most one hero and unique, well-formed section ids`() {
        val p = PlanJson.valid()
        val hero = (p.jsonObject["sections"] as JsonArray)[0]
        rejected(p.with("sections[10]", hero.with("id", "hero-2")), "sections[10].type", "Only one hero")
        rejected(p.with("${s("faq")}.id", "hero"), "${s("faq")}.id", "already uses")
        for (bad in listOf("Hero", "a b", "x".repeat(41), "faq_1", "ü")) rejected(p.with("${s("faq")}.id", bad), "${s("faq")}.id")
        ok(p.with("${s("faq")}.id", "x".repeat(40)))
        ok(p.with("${s("faq")}.id", "faq-2026"))
    }

    @Test
    fun `control characters are rejected and whitespace is normalized`() {
        val p = PlanJson.valid()
        rejected(p.with("${s("hero")}.content.headline", "Hello\u0007"), "${s("hero")}.content.headline", "invalid characters")
        rejected(p.with("${s("about")}.content.body", "Hi\u0000there"), "${s("about")}.content.body", "invalid characters")
        rejected(p.with("${s("cta")}.content.headline", "Book ‮now"), "${s("cta")}.content.headline", "invalid characters")
        val plan = ok(
            p.with("${s("hero")}.content.headline", "  Move\n\tbetter  ").with("${s("about")}.content.body", " One.\r\n\r\n\r\n\r\nTwo.  "),
        )
        assertEquals("Move better", (plan.sections[0].content as HeroContent).headline, "single-line text collapses whitespace")
        assertEquals("One.\n\nTwo.", (plan.sections[3].content as AboutContent).body, "paragraphs are kept")
    }

    @Test
    fun `images follow the upload, stock and generated rules`() {
        val p = PlanJson.valid()
        val photo = "${s("team")}.content.members[0].photo.url"
        val stock = "${s("about")}.content.image"
        val hero = "${s("hero")}.content.image"
        ok(p)
        // Uploads: only this business's storage prefix and generated file names.
        for (bad in listOf(
            SiteFixtures.OTHER_UPLOAD_PREFIX + SiteFixtures.UPLOAD_FILE,
            SiteFixtures.UPLOAD_PREFIX + "../00000000-0000-0000-0000-00000000b002/" + SiteFixtures.UPLOAD_FILE,
            SiteFixtures.UPLOAD_PREFIX + "photo.png",
            SiteFixtures.UPLOAD_PREFIX + "0f8fad5b-d9cb-469f-a165-70867728950e.gif",
            "http://evil.example/" + SiteFixtures.UPLOAD_FILE,
            "javascript:alert(1)",
            "data:image/png;base64,iVBORw0KGgo=",
            "https://images.unsplash.com/photo-1",
        )) {
            rejected(p.with(photo, bad), photo, "uploaded to this business")
        }
        rejected(p.without(photo), photo, "Required")
        val noUploads = SiteValidator(SiteFixtures.refs.copy(uploadPrefix = null))
        assertEquals("Image uploads are not available", assertFailsWith<ApiException> { noUploads.parse(p) }.fields[photo])
        // Stock: images.unsplash.com over https with an unsplash.com attribution.
        for (bad in listOf(
            "https://example.com/photo.jpg", "http://images.unsplash.com/photo-1",
            "https://images.unsplash.com.evil.example/x",
            "javascript:alert(1)", "data:image/png;base64,xx", "https://images.unsplash.com/x\"onerror=\"1",
        )) {
            rejected(p.with("$stock.url", bad), "$stock.url", "images.unsplash.com")
        }
        rejected(p.without("$stock.attribution"), "$stock.attribution", "Required")
        rejected(p.with("$stock.attribution", JsonNull), "$stock.attribution")
        rejected(p.with("$stock.attribution.url", "https://example.com/@someone"), "$stock.attribution.url", "unsplash.com")
        rejected(p.with("$stock.attribution.url", "javascript:alert(1)"), "$stock.attribution.url")
        // Generated: a pattern and no URL.
        rejected(p.with("$hero.url", "https://example.com/x.png"), "$hero.url", "no URL")
        rejected(p.without("$hero.pattern"), "$hero.pattern", "Required")
        // Fields that don't apply to a kind are dropped when normalizing.
        val plan = ok(p.with("${s("team")}.content.members[0].photo.pattern", "dots"))
        assertNull((plan.sections[2].content as TeamContent).members[0].photo!!.pattern)
    }

    @Test
    fun `services and team members must belong to the business`() {
        val p = PlanJson.valid()
        val ids = "${s("services")}.content.serviceIds"
        rejected(p.with("$ids[0]", "00000000-0000-0000-0000-00000000dead"), "$ids[0]", "Unknown service")
        rejected(p.with("$ids[0]", "not-a-uuid"), "$ids[0]", "Unknown service")
        val deduped = ok(
            p.with(ids, JsonArray(listOf(SiteFixtures.SERVICE_B, SiteFixtures.SERVICE_A, SiteFixtures.SERVICE_B).map(::JsonPrimitive))),
        )
        assertEquals(listOf(SiteFixtures.SERVICE_B, SiteFixtures.SERVICE_A), (deduped.sections[1].content as ServicesContent).serviceIds)
        val member = "${s("team")}.content.members"
        rejected(p.with("$member[0].resourceId", "00000000-0000-0000-0000-00000000dead"), "$member[0].resourceId", "active team member")
        rejected(p.with("$member[0].resourceId", SiteFixtures.SERVICE_A), "$member[0].resourceId", "active team member")
        rejected(
            p.with("$member[1]", JsonObject(mapOf("resourceId" to JsonPrimitive(SiteFixtures.PERSON_A)))), "$member[1].resourceId",
            "Already listed",
        )
        ok(p.with("$member[1]", JsonObject(mapOf("resourceId" to JsonPrimitive(SiteFixtures.PERSON_B)))))
    }

    @Test
    fun `palette colours must be readable`() {
        val p = PlanJson.valid()
        rejected(p.with("palette.primaryColor", "teal"), "palette.primaryColor", "hex colour")
        rejected(p.with("palette.primaryColor", "#0f766"), "palette.primaryColor", "hex colour")
        rejected(
            p.with("palette.primaryColor", "#ffffff"), "palette.primaryColor", "Too light for buttons on a white page (1.0:1, needs 3:1)",
        )
        rejected(p.with("palette.primaryColor", "#fde047"), "palette.primaryColor", "Choose a darker shade")
        // Just below / above 3:1 against white.
        rejected(p.with("palette.primaryColor", "#959595"), "palette.primaryColor", "(2.9:1, needs 3:1)")
        ok(p.with("palette.primaryColor", "#949494"))
        // Passes 3:1, but neither white nor ink text reaches 4.5:1 on it; just above that line is fine.
        rejected(p.with("palette.primaryColor", "#777777"), "palette.primaryColor", "needs 4.5:1")
        ok(p.with("palette.primaryColor", "#767676"))
        ok(p.with("palette.primaryColor", "#1c1917"))
        // Accent: 3:1 against white, or none.
        rejected(p.with("palette.accent", "#959595"), "palette.accent", "needs 3:1")
        ok(p.with("palette.accent", "#949494"))
        ok(p.with("palette.accent", JsonNull))
        ok(p.without("palette.accent"))
        rejected(p.with("palette.accent", "red"), "palette.accent", "hex colour")
    }

    @Test
    fun `problems lists field paths without throwing`() {
        val plan = ok(PlanJson.valid())
        assertTrue(validator.problems(plan).isEmpty())
        val bad = plan.copy(palette = SitePalette("#ffffff"))
        assertEquals(setOf("palette.primaryColor"), validator.problems(bad).keys)
    }
}
