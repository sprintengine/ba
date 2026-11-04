package ie.bookanything.seed

import ie.bookanything.AppContext
import ie.bookanything.audit.Actor
import ie.bookanything.auth.UserRepository
import ie.bookanything.auth.VerifiedIdentity
import ie.bookanything.business.Address
import ie.bookanything.business.BusinessRepository
import ie.bookanything.business.SetupInstaller
import ie.bookanything.db.update
import ie.bookanything.geo.GeocodeJobs
import ie.bookanything.geo.TableGeocoder
import ie.bookanything.marketplace.MarketplaceRepository
import ie.bookanything.offers.Discount
import ie.bookanything.offers.OfferRepository
import ie.bookanything.offers.OfferSchedule
import ie.bookanything.offers.OfferSpec
import ie.bookanything.offers.OfferStatus
import ie.bookanything.offers.TimeWindow
import ie.bookanything.services.ServiceRepository
import ie.bookanything.templates.Templates
import org.slf4j.LoggerFactory
import java.time.LocalTime
import java.util.UUID

/**
 * Marketplace demo data for `seed-demo` (idempotent): places every demo business with the built-in table geocoder
 * (deterministic, no network), lists the paid ones (`cadence-music` is on Free and stays unlisted, to show the
 * upgrade prompt), adds example deals and a few extra, obviously fictional listed businesses around Ireland.
 */
class MarketplaceSeed(private val ctx: AppContext) {
    private val log = LoggerFactory.getLogger(MarketplaceSeed::class.java)

    private data class Extra(
        val template: String, val name: String, val slug: String, val category: String, val address: Address, val plan: String = "pro",
    )

    private val extras = listOf(
        Extra("salon", "Snip Snip Hooray Salon", "snip-snip-hooray", "salon", Address("3 Scissor Row", null, "Galway", "H91 SN11")),
        Extra(
            "fitness_class", "Kettlebell Kingdom", "kettlebell-kingdom", "fitness",
            Address("Unit 9, Iron Yard", null, "Limerick", "V94 KB22"),
        ),
        Extra(
            "music_lessons", "Lark and Lute Music School", "lark-and-lute", "music-lessons",
            Address("12 Treble Terrace", null, "Cork", "T23 LL33"),
        ),
        Extra(
            "car_wash", "Suds and Sprockets", "suds-and-sprockets", "car-wash",
            Address("The Old Forecourt", "Foam Lane", "Kilkenny", "R95 SS44"),
        ),
        Extra(
            "fitness_class", "Bendy Willow Pilates", "bendy-willow-pilates", "fitness",
            Address("1 Stretch Street", null, "Sligo", "F91 BW55"),
        ),
        Extra("physio", "Knotty Knees Physio", "knotty-knees-physio", "physio", Address("5 Sprain Square", null, "Galway", "H91 KK66")),
        Extra(
            "generic", "Paws for Thought Grooming", "paws-for-thought", "pet-grooming",
            Address("8 Whisker Walk", null, "Waterford", "X91 PT77"),
        ),
    )

    fun seed(demoSlugs: List<String>) {
        val owner = ctx.db.txBlocking {
            UserRepository.upsert(it, VerifiedIdentity("dev_marketplace", "market@bookanything.test", true, "Morgan Marketplace"))
        }
        val extraIds = extras.map { e -> ensureExtra(e, owner.id) }
        val all = demoSlugs.mapNotNull { slug -> ctx.db.txBlocking { BusinessRepository.findBySlug(it, slug) } } +
            extraIds.mapNotNull { id -> ctx.db.txBlocking { BusinessRepository.findById(it, id) } }
        val geocoder = TableGeocoder()
        for (b in all) {
            GeocodeJobs.run(ctx.db, geocoder, ctx.clock, b.id)
            if (b.plan.isPaid) {
                val category = extras.firstOrNull { it.slug == b.slug }?.category
                    ?: ie.bookanything.marketplace.MarketplaceCategories.forIndustry(b.industry).key
                ctx.db.txBlocking(b.id) { conn ->
                    if (MarketplaceRepository.listing(conn, b.id) == null) MarketplaceRepository.upsert(conn, b.id, category, ctx.now())
                }
            }
        }
        seedOffers("gleam-car-wash", listOf("Exterior wash", "Full valet")) { services ->
            OfferSpec(
                "Off-peak Tuesday afternoons", "Quieter bays on Tuesday afternoons, so we pass the saving on.", services,
                Discount.Percent(20), OfferSchedule(setOf(2), listOf(TimeWindow(LocalTime.of(13, 0), LocalTime.of(17, 0)))), null,
                OfferStatus.ACTIVE,
            )
        }
        seedOffers("lumen-physio", listOf("Follow-up treatment", "Sports massage")) { services ->
            OfferSpec(
                "Last-minute physio", "A therapist had a cancellation? Grab the slot for less.", services,
                Discount.Fixed(1500), OfferSchedule(lastMinuteHours = 24), null, OfferStatus.ACTIVE,
            )
        }
        seedOffers("suds-and-sprockets", listOf("Exterior wash")) { services ->
            OfferSpec(
                "Early bird wash", "Weekday washes before 10am.", services, Discount.Percent(15),
                OfferSchedule(setOf(1, 2, 3, 4, 5), listOf(TimeWindow(LocalTime.of(8, 0), LocalTime.of(10, 0)))), 50, OfferStatus.ACTIVE,
            )
        }
        seedOffers("knotty-knees-physio", listOf("Follow-up treatment")) { services ->
            OfferSpec(
                "Friday afternoon follow-ups", null, services, Discount.Fixed(1000),
                OfferSchedule(setOf(5), listOf(TimeWindow(LocalTime.of(12, 0), LocalTime.of(18, 0)))), null, OfferStatus.ACTIVE,
            )
        }
        log.info("marketplace demo data ready ({} businesses placed)", all.size)
    }

    private fun ensureExtra(e: Extra, ownerId: UUID): UUID = ctx.db.txBlocking { conn ->
        BusinessRepository.findBySlug(conn, e.slug)?.id ?: run {
            val setup = Templates.byKey(e.template)!!.setup.copy(name = e.name, slug = e.slug, source = "template")
            SetupInstaller.install(conn, setup, ownerId, Actor.SYSTEM).also { id ->
                conn.update(
                    """
                    UPDATE businesses SET contact_email = ?, address_line1 = ?, address_line2 = ?, city = ?, postcode = ?,
                        plan = ?::business_plan, plan_status = 'active' WHERE id = ?
                    """.trimIndent(),
                    "hello@${e.slug}.test", e.address.line1, e.address.line2, e.address.city, e.address.postcode, e.plan, id,
                )
                log.info("created marketplace demo business {} ({})", e.name, e.slug)
            }
        }
    }

    /** Adds the offer when the business exists and has no offers yet. */
    private fun seedOffers(slug: String, serviceNames: List<String>, spec: (Set<UUID>) -> OfferSpec) {
        ctx.db.txBlocking { conn ->
            val b = BusinessRepository.findBySlug(conn, slug) ?: return@txBlocking
            if (OfferRepository.list(conn, b.id).isNotEmpty()) return@txBlocking
            val services = ServiceRepository.list(conn, b.id).filter { it.name in serviceNames }.map { UUID.fromString(it.id) }.toSet()
            if (services.isEmpty()) return@txBlocking
            OfferRepository.insert(conn, b.id, spec(services), ctx.now())
        }
    }
}
