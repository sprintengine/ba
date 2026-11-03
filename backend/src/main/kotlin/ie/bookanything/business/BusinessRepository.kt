package ie.bookanything.business

import ie.bookanything.db.Jsonb
import ie.bookanything.db.TextArray
import ie.bookanything.db.UuidArray
import ie.bookanything.db.bool
import ie.bookanything.db.exists
import ie.bookanything.db.instant
import ie.bookanything.db.int
import ie.bookanything.db.jsonOr
import ie.bookanything.db.query
import ie.bookanything.db.queryOne
import ie.bookanything.db.str
import ie.bookanything.db.strOrNull
import ie.bookanything.db.stringList
import ie.bookanything.db.update
import ie.bookanything.db.uuid
import ie.bookanything.http.ApiJson
import kotlinx.serialization.serializer
import java.sql.Connection
import java.sql.ResultSet
import java.time.ZoneId
import java.util.UUID

object BusinessRepository {
    /**
     * Serialises a business's new bookings that count towards its plan's monthly limit until the transaction ends
     * (transaction-scoped advisory lock), so two can't both see the last place free: each counts after the other commits.
     */
    fun lockMonthlyBookings(conn: Connection, businessId: UUID) {
        conn.queryOne("SELECT pg_advisory_xact_lock(hashtextextended('plan_bookings:' || ?::text, 0))", businessId) { true }
    }

    /** As [lockMonthlyBookings], for the team seats a plan limits (invitations and acceptances). */
    fun lockSeats(conn: Connection, businessId: UUID) {
        conn.queryOne("SELECT pg_advisory_xact_lock(hashtextextended('plan_seats:' || ?::text, 0))", businessId) { true }
    }

    /** The columns [map] reads, from `businesses b`. */
    const val COLUMNS = """
        b.id, b.slug, b.name, b.description, b.industry, b.timezone, b.currency, b.locale, b.country, b.status::text AS status,
        b.contact_email, b.contact_phone, b.address_line1, b.address_line2, b.city, b.postcode, b.website_url,
        b.branding::text AS branding, b.vocabulary::text AS vocabulary,
        b.min_notice_minutes, b.max_advance_days, b.cancellation_notice_hours, b.late_cancellation_refund_percent,
        b.allow_customer_cancel, b.allow_customer_reschedule, b.hold_minutes, b.require_customer_phone,
        b.next_available_only,
        b.stripe_account_id, b.stripe_charges_enabled, b.stripe_details_submitted, b.stripe_connect_method, b.stripe_account_generation,
        b.plan::text AS plan,
        b.plan_status,
        b.stripe_customer_id, b.stripe_subscription_id, b.created_at, b.ai_agents_access,
        b.ai_agents_auto_approve
    """

    fun map(rs: ResultSet): BusinessRow = BusinessRow(
        id = rs.uuid("id"),
        slug = rs.str("slug"),
        name = rs.str("name"),
        description = rs.strOrNull("description"),
        industry = rs.str("industry"),
        zone = runCatching { ZoneId.of(rs.str("timezone")) }.getOrDefault(ZoneId.of("Europe/Dublin")),
        currency = rs.str("currency").trim(),
        locale = rs.str("locale"),
        country = rs.str("country").trim(),
        status = rs.str("status"),
        contactEmail = rs.strOrNull("contact_email"),
        contactPhone = rs.strOrNull("contact_phone"),
        address = Address(rs.strOrNull("address_line1"), rs.strOrNull("address_line2"), rs.strOrNull("city"), rs.strOrNull("postcode")),
        websiteUrl = rs.strOrNull("website_url"),
        branding = rs.jsonOr("branding", serializer<Branding>(), Branding()),
        vocabulary = rs.jsonOr("vocabulary", serializer<Vocabulary>(), Vocabulary()),
        policies = Policies(
            minNoticeMinutes = rs.int("min_notice_minutes"),
            maxAdvanceDays = rs.int("max_advance_days"),
            cancellationNoticeHours = rs.int("cancellation_notice_hours"),
            lateCancellationRefundPercent = rs.int("late_cancellation_refund_percent"),
            allowCustomerCancel = rs.bool("allow_customer_cancel"),
            allowCustomerReschedule = rs.bool("allow_customer_reschedule"),
            holdMinutes = rs.int("hold_minutes"),
            requireCustomerPhone = rs.bool("require_customer_phone"),
            nextAvailableOnly = rs.bool("next_available_only"),
        ),
        stripeAccountId = rs.strOrNull("stripe_account_id"),
        stripeChargesEnabled = rs.bool("stripe_charges_enabled"),
        stripeDetailsSubmitted = rs.bool("stripe_details_submitted"),
        plan = Plan.parse(rs.str("plan")),
        planStatus = rs.strOrNull("plan_status"),
        stripeCustomerId = rs.strOrNull("stripe_customer_id"),
        stripeSubscriptionId = rs.strOrNull("stripe_subscription_id"),
        createdAt = rs.instant("created_at"),
        aiAgents = AiAgentsPolicy(
            AiAgentsAccess.parse(rs.str("ai_agents_access")),
            rs.stringList("ai_agents_auto_approve").mapNotNull(AgentChangeKind::parse).toSet(),
        ),
        stripeConnectMethod = rs.strOrNull("stripe_connect_method"),
        stripeAccountGeneration = rs.int("stripe_account_generation"),
    )

    /** Suspends a business (its last owner was deleted): kept for support to recover, hidden everywhere else. */
    fun suspend(conn: Connection, id: UUID) {
        conn.update("UPDATE businesses SET status = 'suspended', updated_at = now() WHERE id = ?", id)
    }

    fun findById(conn: Connection, id: UUID): BusinessRow? =
        conn.queryOne("SELECT $COLUMNS FROM businesses b WHERE b.id = ?", id, map = ::map)

    /** The business, its row locked for the rest of the transaction (read, change, write back without losing a write). */
    fun lockById(conn: Connection, id: UUID): BusinessRow? =
        conn.queryOne("SELECT $COLUMNS FROM businesses b WHERE b.id = ? FOR UPDATE", id, map = ::map)

    /** The businesses among [ids] that exist, by id. */
    fun findByIds(conn: Connection, ids: Set<UUID>): Map<UUID, BusinessRow> =
        if (ids.isEmpty()) {
            emptyMap()
        } else {
            conn.query("SELECT $COLUMNS FROM businesses b WHERE b.id = ANY(?)", UuidArray(ids), map = ::map).associateBy { it.id }
        }

    fun activeIds(conn: Connection): List<UUID> = conn.query(
        "SELECT id FROM businesses WHERE status = 'active' ORDER BY id",
    ) { it.uuid("id") }

    fun findBySlug(conn: Connection, slug: String): BusinessRow? =
        conn.queryOne("SELECT $COLUMNS FROM businesses b WHERE b.slug = ?", slug.lowercase(), map = ::map)

    fun idBySlug(conn: Connection, slug: String): UUID? =
        conn.queryOne("SELECT id FROM businesses WHERE slug = ?", slug.lowercase()) { it.uuid("id") }

    fun slugExists(conn: Connection, slug: String, exceptId: UUID? = null): Boolean =
        conn.exists("SELECT 1 FROM businesses WHERE slug = ? AND (?::uuid IS NULL OR id <> ?::uuid)", slug, exceptId, exceptId)

    data class NewBusiness(
        val slug: String, val name: String, val description: String?, val industry: String, val timezone: String,
        val currency: String, val locale: String, val country: String, val status: String,
        val contactEmail: String?, val contactPhone: String?, val address: Address, val websiteUrl: String?,
        val branding: Branding, val vocabulary: Vocabulary, val policies: Policies,
    )

    fun insert(conn: Connection, b: NewBusiness): UUID = conn.queryOne(
        """
        INSERT INTO businesses (slug, name, description, industry, timezone, currency, locale, country, status,
            contact_email, contact_phone, address_line1, address_line2, city, postcode, website_url, branding, vocabulary,
            min_notice_minutes, max_advance_days, cancellation_notice_hours, late_cancellation_refund_percent,
            allow_customer_cancel, allow_customer_reschedule, hold_minutes, require_customer_phone, next_available_only)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::business_status, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
        """.trimIndent(),
        b.slug, b.name, b.description, b.industry, b.timezone, b.currency, b.locale, b.country, b.status,
        b.contactEmail, b.contactPhone, b.address.line1, b.address.line2, b.address.city, b.address.postcode, b.websiteUrl,
        Jsonb(ApiJson.encodeToString(serializer<Branding>(), b.branding)),
        Jsonb(ApiJson.encodeToString(serializer<Vocabulary>(), b.vocabulary)),
        b.policies.minNoticeMinutes, b.policies.maxAdvanceDays, b.policies.cancellationNoticeHours,
        b.policies.lateCancellationRefundPercent, b.policies.allowCustomerCancel, b.policies.allowCustomerReschedule,
        b.policies.holdMinutes, b.policies.requireCustomerPhone, b.policies.nextAvailableOnly,
    ) { it.uuid("id") }!!

    fun update(conn: Connection, row: BusinessRow) {
        conn.update(
            """
            UPDATE businesses SET slug = ?, name = ?, description = ?, timezone = ?, currency = ?, locale = ?, status = ?::business_status,
                contact_email = ?, contact_phone = ?, address_line1 = ?, address_line2 = ?, city = ?, postcode = ?, website_url = ?,
                branding = ?, vocabulary = ?, min_notice_minutes = ?, max_advance_days = ?, cancellation_notice_hours = ?,
                late_cancellation_refund_percent = ?, allow_customer_cancel = ?, allow_customer_reschedule = ?, hold_minutes = ?,
                require_customer_phone = ?, next_available_only = ?, ai_agents_access = ?,
                ai_agents_auto_approve = ?, updated_at = now()
            WHERE id = ?
            """.trimIndent(),
            row.slug, row.name, row.description, row.timezone, row.currency, row.locale, row.status,
            row.contactEmail, row.contactPhone, row.address.line1, row.address.line2, row.address.city, row.address.postcode,
            row.websiteUrl,
            Jsonb(ApiJson.encodeToString(serializer<Branding>(), row.branding)),
            Jsonb(ApiJson.encodeToString(serializer<Vocabulary>(), row.vocabulary)),
            row.policies.minNoticeMinutes, row.policies.maxAdvanceDays, row.policies.cancellationNoticeHours,
            row.policies.lateCancellationRefundPercent, row.policies.allowCustomerCancel, row.policies.allowCustomerReschedule,
            row.policies.holdMinutes, row.policies.requireCustomerPhone, row.policies.nextAvailableOnly, row.aiAgents.access.key,
            TextArray(row.aiAgents.autoApprove.map { it.key }.sorted()), row.id,
        )
    }

    /** Keeps the rest of the branding (logo, cover) as it is. */
    fun setPrimaryColor(conn: Connection, id: UUID, color: String) {
        conn.update(
            "UPDATE businesses SET branding = jsonb_set(branding, '{primaryColor}', to_jsonb(?::text)), updated_at = now() WHERE id = ?",
            color, id,
        )
    }

    fun setStatus(conn: Connection, id: UUID, status: String) {
        conn.update("UPDATE businesses SET status = ?::business_status, updated_at = now() WHERE id = ?", status, id)
    }

    fun publicGroups(conn: Connection, businessId: UUID): List<PublicCustomerGroup> = conn.query(
        "SELECT id, name, description FROM customer_groups WHERE business_id = ? AND is_active ORDER BY sort_order, name",
        businessId,
    ) { PublicCustomerGroup(it.uuid("id").toString(), it.str("name"), it.strOrNull("description")) }
}
