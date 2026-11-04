package ie.bookanything.seed

import ie.bookanything.AppContext
import ie.bookanything.audit.Actor
import ie.bookanything.auth.TokenService
import ie.bookanything.auth.UserRepository
import ie.bookanything.auth.VerifiedIdentity
import ie.bookanything.availability.AudienceContext
import ie.bookanything.availability.RuleSpec
import ie.bookanything.availability.Windows
import ie.bookanything.booking.AddonSnapshot
import ie.bookanything.booking.AnswerDto
import ie.bookanything.booking.BookingQuote
import ie.bookanything.booking.BookingSource
import ie.bookanything.booking.BookingStatus
import ie.bookanything.booking.BookingSupport
import ie.bookanything.business.Address
import ie.bookanything.business.BusinessRepository
import ie.bookanything.business.SetupInstaller
import ie.bookanything.db.Jsonb
import ie.bookanything.db.TstzRange
import ie.bookanything.db.exists
import ie.bookanything.db.int
import ie.bookanything.db.localDateOrNull
import ie.bookanything.db.localTime
import ie.bookanything.db.query
import ie.bookanything.db.queryOne
import ie.bookanything.db.update
import ie.bookanything.db.uuid
import ie.bookanything.db.uuidList
import ie.bookanything.http.ApiJson
import ie.bookanything.payments.CancelActor
import ie.bookanything.payments.PaymentStatus
import ie.bookanything.services.QuestionRepository
import ie.bookanything.services.ServiceDef
import ie.bookanything.services.ServiceRepository
import ie.bookanything.services.toDef
import ie.bookanything.templates.BusinessSetup
import ie.bookanything.templates.Templates
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.serializer
import org.slf4j.LoggerFactory
import java.sql.Connection
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import kotlin.random.Random

/**
 * Development-only demo data (`seed-demo`). Idempotent: users and memberships are upserted,
 * businesses are created only when their slug is free, bookings only when a business has none.
 * All names are fictional.
 */
class DemoSeeder(private val ctx: AppContext) {
    private val log = LoggerFactory.getLogger(DemoSeeder::class.java)

    private data class Demo(
        val template: String, val name: String, val slug: String, val email: String, val phone: String, val address: Address,
        /** Resource name to link to the staff user, if any. */
        val staffResource: String?,
        val plan: String = "pro", val customize: (BusinessSetup) -> BusinessSetup = { it },
    )

    private val demos = listOf(
        Demo(
            "physio", "Lumen Physiotherapy", "lumen-physio", "hello@lumen-physio.test", "+353 1 555 0101",
            Address("Unit 4, Lantern Quay", null, "Dublin", "D02 XY01"), staffResource = "Casey Lane",
            customize = { s -> s.copy(resources = s.resources.map { if (it.key == "therapist-2") it.copy(name = "Casey Lane") else it }) },
        ),
        Demo(
            "car_wash", "Gleam Car Wash", "gleam-car-wash", "bookings@gleam-car-wash.test", "+353 21 555 0102",
            Address("Orchard Business Park", "Bay Road", "Cork", "T12 AB34"), staffResource = null, plan = "business",
        ),
        Demo(
            "music_lessons", "Cadence Music Studio", "cadence-music", "lessons@cadence-music.test", "+353 91 555 0103",
            Address("7 Tuning Fork Lane", null, "Galway", "H91 CD56"), staffResource = null, plan = "free",
        ),
        Demo(
            "gp_practice", "Meadowbrook Family Practice", "meadowbrook-practice", "reception@meadowbrook-practice.test", "+353 1 555 0104",
            Address("2 Meadowbrook Green", null, "Dublin", "D14 EF78"), staffResource = "Dr Casey Lane",
        ),
    )

    private val customerNames = listOf(
        "Jordan Casey", "Avery Lane", "Casey Rowe", "Drew Ellis", "Morgan Blake", "Parker Hale", "Quinn Harper", "Reese Carter",
        "Sky Warren", "Toby Marsh", "Frankie Dale", "Emerson Pike", "Harley Moss", "Jesse Wren", "Kit Fairley", "Remy Stroud",
    )

    fun seed() {
        val now = ctx.now()
        ctx.db.txBlocking { conn ->
            val owner = UserRepository.upsert(conn, VerifiedIdentity("dev_owner", "owner@bookanything.test", true, "Avery Morgan"))
            val staff = UserRepository.upsert(conn, VerifiedIdentity("dev_staff", "staff@bookanything.test", true, "Casey Lane"))
            val customer = UserRepository.upsert(
                conn, VerifiedIdentity("dev_customer", "customer@bookanything.test", true, "Charlie Stone"),
            )
            for (demo in demos) {
                val existing = BusinessRepository.findBySlug(conn, demo.slug)
                val businessId = existing?.id ?: run {
                    val template = Templates.byKey(demo.template)!!
                    val setup = demo.customize(template.setup).copy(name = demo.name, slug = demo.slug, source = "template")
                    SetupInstaller.install(conn, setup, owner.id, Actor.SYSTEM).also { id ->
                        conn.update(
                            """
                            UPDATE businesses SET contact_email = ?, contact_phone = ?, address_line1 = ?, address_line2 = ?, city = ?, postcode = ?,
                                website_url = ?, plan = ?::business_plan, plan_status = 'active' WHERE id = ?
                            """.trimIndent(),
                            demo.email, demo.phone, demo.address.line1, demo.address.line2, demo.address.city, demo.address.postcode,
                            "https://${demo.slug}.test", demo.plan, id,
                        )
                        log.info("created demo business {} ({})", demo.name, demo.slug)
                    }
                }
                conn.update(
                    "INSERT INTO business_members (business_id, user_id, role, status) VALUES (?, ?, 'owner', 'active') ON CONFLICT " +
                        "(business_id, user_id) DO NOTHING",
                    businessId, owner.id,
                )
                if (demo.staffResource != null) {
                    conn.update(
                        "INSERT INTO business_members (business_id, user_id, role, status) VALUES (?, ?, 'staff', 'active') ON CONFLICT " +
                            "(business_id, user_id) DO NOTHING",
                        businessId, staff.id,
                    )
                    val memberId = conn.queryOne(
                        "SELECT id FROM business_members WHERE business_id = ? AND user_id = ?", businessId, staff.id,
                    ) { it.uuid("id") }!!
                    conn.update(
                        "UPDATE resources SET member_id = ? WHERE business_id = ? AND name = ?", memberId, businessId, demo.staffResource,
                    )
                }
                if (!conn.exists("SELECT 1 FROM bookings WHERE business_id = ?", businessId)) {
                    val n = seedBookings(conn, businessId, customer.id, demo.slug == "meadowbrook-practice", now)
                    log.info("seeded {} bookings for {}", n, demo.slug)
                }
                // Also for existing dev databases: a published site for each demo that has none yet (when sites are on).
                val business = BusinessRepository.findById(conn, businessId)!!
                if (ctx.config.sitesEnabled &&
                    ctx.site.service.seedIfMissing(conn, business) { inputs -> DemoSites.plan(demo.slug, inputs) }
                ) {
                    log.info("published the demo site for {}", demo.slug)
                }
            }
        }
        MarketplaceSeed(ctx).seed(demos.map { it.slug })
        println(
            "Demo data ready. Sign in (dev auth) as owner@bookanything.test (dev_owner), staff@bookanything.test (dev_staff) or " +
                "customer@bookanything.test (dev_customer).",
        )
        demos.forEach { println("  http://localhost:3000/${it.slug}") }
    }

    private data class Busy(val start: Instant, val end: Instant)

    private fun seedBookings(conn: Connection, businessId: UUID, customerUserId: UUID, withPending: Boolean, now: Instant): Int {
        val business = BusinessRepository.findById(conn, businessId)!!
        val zone = business.zone
        val random = Random(business.slug.hashCode())
        val services = ServiceRepository.list(conn, businessId).map { it.toDef() }.filter { it.isActive && it.requirements.isNotEmpty() }
        val rules = conn.query(
            "SELECT resource_id, day_of_week, start_time, end_time, valid_from, valid_until, audience_group_ids FROM availability_rules " +
                "WHERE business_id = ?",
            businessId,
        ) {
            RuleSpec(
                it.uuid("resource_id"), it.int("day_of_week"), it.localTime("start_time"), it.localTime("end_time"),
                it.localDateOrNull("valid_from"), it.localDateOrNull("valid_until"), it.uuidList("audience_group_ids").toSet(),
            )
        }
        val busy = HashMap<UUID, MutableList<Busy>>()
        val customers = HashMap<String, UUID>()
        fun customerId(name: String, email: String, userId: UUID?): UUID = customers.getOrPut(email) {
            conn.queryOne(
                "INSERT INTO customers (business_id, name, email, phone, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
                businessId, name, email, "+353 87 555 ${1000 + customers.size}", userId, now.minus(Duration.ofDays(30)),
            ) { it.uuid("id") }!!
        }
        val today = LocalDate.ofInstant(now, zone)
        var count = 0
        var pendingDone = !withPending
        var devCustomerBookings = 0
        for (offset in -14..14) {
            val date = today.plusDays(offset.toLong())
            val perDay = if (date.dayOfWeek.value == 7) 1 else 3 + random.nextInt(3)
            repeat(perDay) { attempt ->
                val service = services[(offset + 14 + attempt) % services.size]
                val option = service.options.randomOrNull(random)
                val addons = service.addons.filter { random.nextInt(4) == 0 }
                val duration = (option?.durationMinutes ?: service.durationMinutes) + addons.sumOf { it.extraMinutes }
                val price = (option?.priceCents ?: service.priceCents) + addons.sumOf { it.priceCents }
                val slot = findFreeSlot(date, zone, service, duration, rules, busy, random) ?: return@repeat
                val (start, assignments) = slot
                val end = start.plus(Duration.ofMinutes(duration.toLong()))
                val past = end.isBefore(now)
                val roll = random.nextInt(100)
                var status = when {
                    past && roll < 75 -> BookingStatus.COMPLETED
                    past && roll < 87 -> BookingStatus.NO_SHOW
                    past -> BookingStatus.CANCELLED
                    roll < 85 -> BookingStatus.CONFIRMED
                    else -> BookingStatus.CANCELLED
                }
                if (!past && !pendingDone && start.isAfter(now.plus(Duration.ofDays(2)))) {
                    status = BookingStatus.PENDING_APPROVAL; pendingDone = true
                }
                val useDevCustomer = devCustomerBookings < 3 && (offset == -7 || offset == 3 || offset == 9) && attempt == 0
                val (name, email, userId) = if (useDevCustomer) {
                    devCustomerBookings++
                    Triple("Charlie Stone", "customer@bookanything.test", customerUserId)
                } else {
                    val n = customerNames[random.nextInt(customerNames.size)]
                    Triple(n, n.lowercase().replace(' ', '.') + "@example.test", null)
                }
                if (useDevCustomer && status == BookingStatus.CANCELLED) {
                    status = if (past) BookingStatus.COMPLETED else BookingStatus.CONFIRMED
                }
                val cid = customerId(name, email, userId)
                val onlinePaid = service.needsOnlinePayment && status != BookingStatus.PENDING_APPROVAL
                val paid = if (onlinePaid) BookingQuote.dueOnline(service.paymentMode, service.depositCents, price) else 0
                val cancelled = status == BookingStatus.CANCELLED
                val refunded = if (cancelled && paid > 0) paid else 0
                val paymentStatus = when {
                    refunded > 0 -> PaymentStatus.REFUNDED
                    paid > 0 -> PaymentStatus.PAID
                    service.paymentMode == "at_venue" && price > 0 -> PaymentStatus.PAY_AT_VENUE
                    else -> PaymentStatus.NOT_REQUIRED
                }
                val bookingId = UUID.randomUUID()
                val createdAt = minOf(now, start.minus(Duration.ofDays(3L + random.nextInt(10))))
                val answers = answersFor(conn, businessId, service, random)
                conn.update(
                    """
                    INSERT INTO bookings (id, business_id, reference, customer_id, service_id, option_id, option_name, addons, start_at, end_at,
                        status, price_cents, deposit_cents, currency, amount_paid_cents, amount_refunded_cents, payment_status, answers, source,
                        manage_token_hash, cancelled_at, cancelled_by, cancellation_reason, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::booking_status, ?, ?, ?, ?, ?, ?::payment_status, ?, ?::booking_source, ?, ?, ?::cancelled_by, ?, ?, ?)
                    """.trimIndent(),
                    bookingId, businessId, BookingSupport.newReference(conn, businessId), cid, service.id, option?.id, option?.name,
                    Jsonb(
                        ApiJson.encodeToString(
                            ListSerializer(serializer<AddonSnapshot>()),
                            addons.map { AddonSnapshot(it.id.toString(), it.name, it.extraMinutes, it.priceCents) },
                        ),
                    ),
                    start, end, status, price, if (service.paymentMode == "deposit") paid.takeIf { it > 0 } else null, business.currency,
                    paid, refunded, paymentStatus, Jsonb(ApiJson.encodeToString(ListSerializer(serializer<AnswerDto>()), answers)),
                    if (random.nextBoolean()) BookingSource.PUBLIC else BookingSource.DASHBOARD,
                    TokenService.hash(ctx.tokens.manageToken(bookingId)),
                    if (cancelled) start.minus(Duration.ofDays(1)) else null,
                    if (cancelled) (if (random.nextBoolean()) CancelActor.CUSTOMER else CancelActor.BUSINESS) else null,
                    if (cancelled) "Plans changed" else null, createdAt, createdAt,
                )
                val active = status.isBlocking
                val range = TstzRange(
                    start.minus(Duration.ofMinutes(service.bufferBeforeMinutes.toLong())),
                    end.plus(Duration.ofMinutes(service.bufferAfterMinutes.toLong())),
                )
                assignments.forEach { (reqId, rid) ->
                    conn.update(
                        "INSERT INTO booking_allocations (business_id, booking_id, resource_id, requirement_id, time_range, exclusive, " +
                            "active) VALUES (?, ?, ?, ?, ?, ?, ?)",
                        businessId, bookingId, rid, reqId, range, service.capacity == 1, active,
                    )
                    busy.getOrPut(rid) { mutableListOf() }.add(Busy(range.start, range.end))
                }
                if (paid > 0) {
                    conn.update(
                        "INSERT INTO payments (business_id, booking_id, provider, kind, provider_ref, amount_cents, currency, status, " +
                            "created_at) VALUES (?, ?, 'dev', 'charge', ?, ?, ?, 'succeeded', ?)",
                        businessId, bookingId, "dev_seed_$bookingId", paid, business.currency, createdAt,
                    )
                }
                if (refunded > 0) {
                    conn.update(
                        "INSERT INTO payments (business_id, booking_id, provider, kind, provider_ref, amount_cents, currency, status, " +
                            "created_at) VALUES (?, ?, 'dev', 'refund', ?, ?, ?, 'succeeded', ?)",
                        businessId, bookingId, "dev_seed_re_$bookingId", refunded, business.currency, start.minus(Duration.ofDays(1)),
                    )
                }
                conn.update(
                    "INSERT INTO audit_events (business_id, actor_type, action, entity_type, entity_id, summary, occurred_at) VALUES (?, " +
                        "'system', 'booking.seeded', 'booking', ?, '{}'::jsonb, ?)",
                    businessId, bookingId, createdAt,
                )
                count++
            }
        }
        return count
    }

    /** Picks a start within the day's windows where every requirement has free resources (in-memory busy map). */
    private fun findFreeSlot(
        date: LocalDate, zone: java.time.ZoneId, service: ServiceDef, duration: Int, rules: List<RuleSpec>,
        busy: Map<UUID, List<Busy>>, random: Random,
    ): Pair<Instant, List<Pair<UUID?, UUID>>>? {
        val audience = AudienceContext(ignoreAudience = true)
        val firstPool = service.requirements.first().resourceIds
        val windows = firstPool.flatMap { Windows.toInstants(date, zone, Windows.localWindows(it, date, rules, emptyList(), audience)) }
        if (windows.isEmpty()) return null
        val step = Duration.ofMinutes(maxOf(15, service.slotIntervalMinutes ?: 30).toLong())
        val candidates = windows.flatMap { w ->
            generateSequence(w.start) { it.plus(step) }.takeWhile {
                !it.plus(Duration.ofMinutes(duration.toLong() + service.bufferAfterMinutes)).isAfter(w.end)
            }.toList()
        }.shuffled(random)
        for (start in candidates.take(40)) {
            val span = Busy(
                start.minus(Duration.ofMinutes(service.bufferBeforeMinutes.toLong())),
                start.plus(Duration.ofMinutes(duration.toLong() + service.bufferAfterMinutes)),
            )
            val used = HashSet<UUID>()
            val chosen = ArrayList<Pair<UUID?, UUID>>()
            val ok = service.requirements.all { req ->
                val free = req.resourceIds.filter { rid ->
                    rid !in used &&
                        Windows.toInstants(date, zone, Windows.localWindows(rid, date, rules, emptyList(), audience))
                            .any { !it.start.isAfter(span.start) && !it.end.isBefore(span.end) } &&
                        busy[rid].orEmpty().none { it.start.isBefore(span.end) && span.start.isBefore(it.end) }
                }.take(req.quantity)
                if (free.size < req.quantity) false else { free.forEach { used.add(it); chosen.add(req.id to it) }; true }
            }
            if (ok) return start to chosen
        }
        return null
    }

    private fun answersFor(conn: Connection, businessId: UUID, service: ServiceDef, random: Random): List<AnswerDto> =
        QuestionRepository.forService(conn, businessId, service.id).mapNotNull { q ->
            val value = when (q.kind) {
                "select" -> q.options.randomOrNull(random)
                "checkbox" -> "true"
                "number" -> (8 + random.nextInt(40)).toString()
                "email" -> "someone@example.test"
                "phone" -> "+353 87 555 0000"
                else -> when {
                    q.label.contains(
                        "registration", ignoreCase = true,
                    ) -> "${listOf("231", "202", "191").random(random)}-D-${1000 + random.nextInt(9000)}"
                    q.label.contains("make", ignoreCase = true) -> listOf("Hatchback, blue", "Estate, grey", "SUV, white").random(random)
                    q.required -> listOf("Lower back pain after gardening", "Knee pain when running", "Routine check").random(random)
                    else -> null
                }
            } ?: return@mapNotNull null
            AnswerDto(q.id, q.label, value, q.sensitive)
        }
}
