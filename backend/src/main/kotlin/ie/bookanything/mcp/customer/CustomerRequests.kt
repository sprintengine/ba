package ie.bookanything.mcp.customer

import ie.bookanything.AppContext
import ie.bookanything.assistant.actions.ActionApp
import ie.bookanything.assistant.actions.ActionDto
import ie.bookanything.assistant.actions.ActionStatus
import ie.bookanything.assistant.tools.ActionLink
import ie.bookanything.assistant.tools.ActionResult
import ie.bookanything.assistant.tools.Proposal
import ie.bookanything.assistant.tools.ProposalChange
import ie.bookanything.assistant.tools.ToolViews
import ie.bookanything.audit.Actor
import ie.bookanything.auth.CurrentUser
import ie.bookanything.booking.AvailabilityQuery
import ie.bookanything.booking.BookingQuote
import ie.bookanything.booking.BookingSource
import ie.bookanything.booking.BookingViews
import ie.bookanything.booking.CreatePublicBooking
import ie.bookanything.booking.PublicCustomerInput
import ie.bookanything.booking.PublicServiceDto
import ie.bookanything.business.BusinessRepository
import ie.bookanything.business.BusinessRow
import ie.bookanything.customers.CustomerRepository
import ie.bookanything.db.Jsonb
import ie.bookanything.db.StoredJson
import ie.bookanything.db.TextArray
import ie.bookanything.db.bool
import ie.bookanything.db.instant
import ie.bookanything.db.instantOrNull
import ie.bookanything.db.query
import ie.bookanything.db.queryOne
import ie.bookanything.db.str
import ie.bookanything.db.strOrNull
import ie.bookanything.db.stringList
import ie.bookanything.db.update
import ie.bookanything.db.uuid
import ie.bookanything.http.ApiException
import ie.bookanything.http.ApiJson
import ie.bookanything.http.DateRange
import ie.bookanything.http.Errors
import ie.bookanything.http.formatInstant
import ie.bookanything.http.formatInstantOrNull
import ie.bookanything.http.parseInstant
import ie.bookanything.http.parseUuid
import ie.bookanything.mcp.MarketplaceTools
import ie.bookanything.mcp.StrictArgs
import ie.bookanything.notifications.inbox.Inbox
import ie.bookanything.notifications.inbox.InboxKind
import ie.bookanything.notifications.inbox.NewNotification
import ie.bookanything.offers.OfferText
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.serializer
import org.slf4j.LoggerFactory
import java.sql.Connection
import java.sql.ResultSet
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/** What a customer's AI app can ask to do; [group] is the kind the customer may let go ahead without approval. */
enum class CustomerChangeKind(val key: String, val group: CustomerAutoApprove) {
    BOOK("book", CustomerAutoApprove.BOOKINGS),
    RESCHEDULE("reschedule", CustomerAutoApprove.BOOKINGS),
    CANCEL("cancel", CustomerAutoApprove.CANCELLATIONS),
    ;

    companion object {
        fun parse(key: String) = entries.first { it.key == key }
    }
}

/** Kinds of change a customer lets their AI apps make once the app confirms them (none by default). */
@Serializable
enum class CustomerAutoApprove(val key: String) {
    @SerialName("bookings") BOOKINGS("bookings"),
    @SerialName("cancellations") CANCELLATIONS("cancellations"),
    ;

    companion object {
        fun parse(key: String): CustomerAutoApprove? = entries.firstOrNull { it.key == key }
    }
}

/** What happened once a customer's request was carried out: shown on the approval page and given to the app. */
@Serializable
data class CustomerRequestResult(val message: String, val links: List<ActionLink> = emptyList(), val bookingId: String? = null)

data class CustomerRequestRow(
    val id: UUID,
    val userId: UUID,
    val grantId: UUID,
    val businessId: UUID,
    val kind: CustomerChangeKind,
    val input: JsonObject,
    val proposal: Proposal,
    val needsApproval: Boolean,
    val status: ActionStatus,
    val result: CustomerRequestResult?,
    val error: String?,
    val expiresAt: Instant,
    val createdAt: Instant,
    val decidedAt: Instant?,
    val app: ActionApp,
    val businessName: String,
    val businessSlug: String,
    val timezone: String,
) {
    fun effectiveStatus(now: Instant) = if (status == ActionStatus.PENDING && !expiresAt.isAfter(now)) ActionStatus.EXPIRED else status
}

/** One of the customer's AI apps' requests, as their approvals page shows it (section 20.8). */
@Serializable
data class CustomerRequestDto(
    /** In the shape of a business proposal (the same card shows both); result links are app paths or full URLs. */
    val action: ActionDto,
    val app: String,
    val business: NamedRef,
    /** The business's timezone: the times are in it. */
    val timezone: String,
    val needsApproval: Boolean,
    val appDisconnected: Boolean,
)

@Serializable
data class CustomerRequestList(val items: List<CustomerRequestDto>)

@Serializable
data class AgentSettingsDto(val autoApprove: List<CustomerAutoApprove>)

@Serializable
data class UpdateAgentSettings(val autoApprove: List<String>)

/**
 * A customer's AI app asking to book, move or cancel (section 20.8). It only proposes: the request is stored and goes
 * ahead when the customer approves it on bookanything, signed in (or, for a kind they let go ahead, when the app
 * confirms it). It runs through the same commands as the website, as the customer, audited as the app acting for them.
 */
class CustomerRequests(private val ctx: AppContext) {
    private val now get() = ctx.now()

    /** What [kind] with [input] would do now, checked as the customer could do it on the website. */
    suspend fun preview(user: CurrentUser, kind: CustomerChangeKind, input: JsonObject): Pair<BusinessRow, Proposal> = when (kind) {
        CustomerChangeKind.BOOK -> previewBook(user, StrictArgs.decode(serializer<BookArgs>(), input))
        CustomerChangeKind.RESCHEDULE -> previewMove(user, StrictArgs.decode(serializer<RescheduleArgs>(), input))
        CustomerChangeKind.CANCEL -> previewCancel(user, StrictArgs.decode(serializer<CancelArgs>(), input))
    }

    private suspend fun previewBook(user: CurrentUser, a: BookArgs): Pair<BusinessRow, Proposal> {
        user.verifiedEmail ?: throw Errors.policy("Verify your email address on bookanything before booking through an assistant.")
        val business = MarketplaceTools.business(ctx, a.slug)
        val service = ctx.booking.public.services(business).firstOrNull { it.id == a.serviceId } ?: throw Errors.notFound("Service")
        requireBookable(business, service, a)
        val start = parseInstant(a.start, "start", business.zone)
        val serviceId = parseUuid(a.serviceId, "serviceId")
        val optionId = a.optionId?.let { parseUuid(it, "optionId") }
        val addonIds = a.addonIds.map { parseUuid(it, "addonIds") }
        val resourceId = a.resourceId?.let { parseUuid(it, "resourceId") }
        val day = LocalDate.ofInstant(start, business.zone)
        val free = ctx.booking.public.availability(
            business, AvailabilityQuery(serviceId, DateRange(day, day), optionId, addonIds, groupOf(user, business), resourceId),
        )
        val slot = free.days.flatMap { it.slots }.firstOrNull { parseInstant(it.start, "start", business.zone) == start }
            ?: throw Errors.slotUnavailable("That time isn't free. Check availability and pick one of the free times.")
        val quote = ctx.db.read(business.id) { conn ->
            val def = ctx.booking.engine.loadService(conn, business.id, serviceId)
            BookingQuote.preview(conn, business, def, optionId, addonIds, start, now)
        }
        val whenText = ToolViews.whenText(start, parseInstant(slot.end, "end", business.zone), business.zone)
        val serviceName = service.name + quote.pricing.optionName?.let { " ($it)" }.orEmpty()
        val price = ToolViews.price(quote.pricing.priceCents, quote.offer, business.currency)
        val atVenue = a.payment == "at_venue"
        val payment = when {
            quote.priceCents == 0 -> "Free"
            atVenue || service.paymentMode == "at_venue" -> "Pay at ${business.name}"
            else -> "Pay ${OfferText.money(quote.dueNowCents, business.currency)} online once you approve"
        }
        return business to Proposal(
            title = "Book $serviceName at ${business.name}",
            summary = whenText,
            changes = listOf(
                ProposalChange("What", null, "$serviceName · ${quote.pricing.durationMinutes} min"),
                ProposalChange("When", null, whenText),
                ProposalChange("Where", null, business.name),
                ProposalChange("Price", null, "$price · $payment"),
            ),
            warnings = listOfNotNull("${business.name} confirms it by email after you request it.".takeIf { service.requiresApproval }),
            confirmLabel = "Book",
        )
    }

    /** What booking would refuse, said now rather than once the user approved it. */
    private fun requireBookable(business: BusinessRow, service: PublicServiceDto, a: BookArgs) {
        val unanswered = service.questions.filter { it.required && a.answers[it.id].isNullOrBlank() }
        if (unanswered.isNotEmpty()) throw Errors.field("answers", "Answer: ${unanswered.joinToString { "${it.label} (${it.id})" }}")
        if (business.policies.requireCustomerPhone && a.phone.isNullOrBlank()) {
            throw Errors.field("phone", "${business.name} needs a phone number")
        }
        if (a.payment == "at_venue" && !service.allowPayAtVenue && service.paymentMode != "at_venue") {
            throw Errors.field("payment", "This service is paid online; it can't be paid at the venue")
        }
    }

    private suspend fun previewMove(user: CurrentUser, a: RescheduleArgs): Pair<BusinessRow, Proposal> {
        val (business, booking) = ctx.booking.customer.ownBooking(user, parseUuid(a.bookingId, "bookingId"))
        if (!BookingViews.canReschedule(booking, business, now)) {
            throw Errors.policy("This booking can no longer be moved online. Please contact ${business.name}.")
        }
        val start = parseInstant(a.start, "start", business.zone)
        val resourceId = a.resourceId?.let { parseUuid(it, "resourceId") }
        val day = LocalDate.ofInstant(start, business.zone)
        val free = ctx.db.read(business.id) { conn ->
            ctx.booking.customer.availability(conn, business, booking, DateRange(day, day), resourceId, null, now)
        }
        val slot = free.days.flatMap { it.slots }.firstOrNull { parseInstant(it.start, "start", business.zone) == start }
            ?: throw Errors.slotUnavailable("That time isn't free to move to. Use find_times_to_move and pick one of its times.")
        val before = ToolViews.whenText(booking.start, booking.end, business.zone)
        val after = ToolViews.whenText(start, parseInstant(slot.end, "end", business.zone), business.zone)
        return business to Proposal(
            title = "Move ${booking.serviceName} at ${business.name}",
            summary = "To $after",
            changes = listOf(ProposalChange("When", before, after)),
            warnings = listOf("Payment carries over."),
            confirmLabel = "Move",
        )
    }

    private suspend fun previewCancel(user: CurrentUser, a: CancelArgs): Pair<BusinessRow, Proposal> {
        val (business, booking) = ctx.booking.customer.ownBooking(user, parseUuid(a.bookingId, "bookingId"))
        val view = BookingViews.customerView(booking, business, now)
        if (!view.canCancel) throw Errors.policy("This booking can't be cancelled online. Please contact ${business.name}.")
        val refund = view.refundPreview
        return business to Proposal(
            title = "Cancel ${booking.serviceName} at ${business.name}",
            summary = ToolViews.whenText(booking.start, booking.end, business.zone),
            changes = listOfNotNull(
                ProposalChange(
                    "Refund", null,
                    refund?.let { "${OfferText.money(it.amountCents, booking.currency)} (${it.reason})" } ?: "Nothing was paid",
                ),
                a.reason?.takeIf { it.isNotBlank() }?.let { ProposalChange("Reason", null, ToolViews.clip(it, 200)) },
            ),
            warnings = listOf("${business.name} is told, and the time is given up."),
            confirmLabel = "Cancel booking",
            destructive = true,
        )
    }

    private suspend fun groupOf(user: CurrentUser, business: BusinessRow): UUID? = ctx.db.read(business.id) { conn ->
        val record = CustomerRepository.findByUser(conn, business.id, user.id)
            ?: user.verifiedEmail?.let { CustomerRepository.findByEmail(conn, business.id, it) }
        record?.takeIf { it.erasedAt == null }?.groupId
    }

    /**
     * Stores [kind] with [input] as a request from the app holding [grantId]: waiting for the customer's approval unless
     * they let that kind go ahead, in which case the app confirms it.
     */
    suspend fun propose(user: CurrentUser, grantId: UUID, kind: CustomerChangeKind, input: JsonObject): CustomerRequestRow {
        val (business, proposal) = preview(user, kind, input)
        return ctx.db.tx { conn ->
            val needsApproval = kind.group !in autoApprove(conn, user.id)
            val expires = now.plus(if (needsApproval) APPROVAL_TTL else CONFIRM_TTL)
            val id = conn.queryOne(
                """
                INSERT INTO customer_agent_requests (user_id, oauth_grant_id, business_id, kind, input, preview, needs_approval, status,
                    expires_at, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?) RETURNING id
                """.trimIndent(),
                user.id, grantId, business.id, kind.key, Jsonb(input), Jsonb(ApiJson.encodeToString(serializer<Proposal>(), proposal)),
                needsApproval, expires, now,
            ) { it.uuid("id") }!!
            val row = get(conn, id)!!
            if (needsApproval) {
                ctx.inbox.notify(
                    conn,
                    NewNotification(
                        user.id, InboxKind.AGENT_APPROVAL, "${row.app.name} wants to: ${proposal.title}", proposal.summary,
                        approvalPath(id), business.id, id, approvalKey(id),
                    ),
                )
            }
            row
        }
    }

    /** One of the customer's requests (any app): null when it isn't theirs. */
    suspend fun mine(user: CurrentUser, id: UUID): CustomerRequestRow? =
        ctx.db.read { conn -> get(conn, id)?.takeIf { it.userId == user.id } }

    /** One the app holding [grantId] made: null otherwise. */
    suspend fun ofApp(user: CurrentUser, grantId: UUID, id: UUID): CustomerRequestRow? =
        mine(user, id)?.takeIf { it.grantId == grantId }

    suspend fun recent(user: CurrentUser): List<CustomerRequestRow> = ctx.db.read { conn ->
        conn.query(
            "SELECT $COLUMNS FROM $FROM WHERE r.user_id = ? AND r.created_at >= ? ORDER BY r.created_at DESC, r.id LIMIT ?",
            user.id, now.minus(SHOWN), MAX_SHOWN, map = ::map,
        )
    }

    /**
     * Prepares a pending request again as things are now (a refund, a price or the free times may have changed): stores
     * the new preview when it differs and returns true. Throws when it can no longer go ahead at all.
     */
    suspend fun refresh(user: CurrentUser, id: UUID): Boolean {
        val row = mine(user, id) ?: throw Errors.notFound("Request")
        if (row.effectiveStatus(now) != ActionStatus.PENDING) return false
        val (_, fresh) = preview(user, row.kind, row.input)
        if (fresh == row.proposal) return false
        ctx.db.tx { conn ->
            conn.update(
                "UPDATE customer_agent_requests SET preview = ? WHERE id = ?",
                Jsonb(ApiJson.encodeToString(serializer<Proposal>(), fresh)), id,
            )
        }
        return true
    }

    /**
     * Carries out a pending request: [byApp] when its app confirms it (only one the customer lets go ahead: one that
     * needs approval is returned still pending), else the customer approving it here. Idempotent.
     */
    suspend fun carryOut(user: CurrentUser, id: UUID, byApp: Boolean): CustomerRequestRow {
        val claimed = ctx.db.tx { conn ->
            val row = conn.queryOne("SELECT $COLUMNS FROM $FROM WHERE r.id = ? AND r.user_id = ? FOR UPDATE OF r", id, user.id, map = ::map)
                ?: throw Errors.notFound("Request")
            when (row.effectiveStatus(now)) {
                ActionStatus.CONFIRMED -> return@tx null
                ActionStatus.PENDING -> Unit
                ActionStatus.EXPIRED -> throw Errors.conflict("This request has expired. Ask your AI app to prepare it again.")
                ActionStatus.REJECTED -> throw Errors.conflict("This request was declined.")
                ActionStatus.FAILED -> throw Errors.conflict("This request couldn't be completed: ${row.error ?: "unknown error"}")
            }
            if (byApp && (row.needsApproval || row.kind.group !in autoApprove(conn, user.id))) {
                if (!row.needsApproval) markNeedsApproval(conn, row, user)
                return@tx null
            }
            if (row.app.revoked) throw Errors.conflict("${row.app.name} was disconnected, so its requests can't go ahead.")
            conn.update("UPDATE customer_agent_requests SET status = 'confirmed', decided_at = ? WHERE id = ?", now, id)
            Inbox.resolve(conn, user.id, approvalKey(id), now)
            row
        } ?: return mine(user, id)!!
        val (status, result, error) = try {
            Triple(ActionStatus.CONFIRMED, execute(user, claimed), null)
        } catch (e: CancellationException) {
            record(id, ActionStatus.FAILED, null, UNKNOWN_OUTCOME)
            throw e
        } catch (e: ApiException) {
            Triple(ActionStatus.FAILED, null, e.message)
        } catch (@Suppress("TooGenericExceptionCaught") e: Exception) { // Claimed already: record it, never leave it hanging.
            log.error("customer request {} failed", id, e)
            Triple(ActionStatus.FAILED, null, UNKNOWN_OUTCOME)
        }
        record(id, status, result, error)
        return mine(user, id)!!
    }

    /** Records how a claimed request ended (even when the call carrying it out was cancelled). */
    private suspend fun record(id: UUID, status: ActionStatus, result: CustomerRequestResult?, error: String?) =
        withContext(NonCancellable) {
            ctx.db.tx { conn ->
                conn.update(
                    "UPDATE customer_agent_requests SET status = ?, result = ?, error = ? WHERE id = ?",
                    status.key, result?.let { Jsonb(ApiJson.encodeToString(serializer<CustomerRequestResult>(), it)) }, error, id,
                )
            }
        }

    /** Declines a pending request (the customer here, or the app dropping its own); idempotent. */
    suspend fun decline(user: CurrentUser, id: UUID): CustomerRequestRow {
        ctx.db.tx { conn ->
            val row = conn.queryOne("SELECT $COLUMNS FROM $FROM WHERE r.id = ? AND r.user_id = ? FOR UPDATE OF r", id, user.id, map = ::map)
                ?: throw Errors.notFound("Request")
            when (row.effectiveStatus(now)) {
                ActionStatus.PENDING, ActionStatus.EXPIRED -> {
                    conn.update("UPDATE customer_agent_requests SET status = 'rejected', decided_at = ? WHERE id = ?", now, id)
                    Inbox.resolve(conn, user.id, approvalKey(id), now)
                }
                ActionStatus.REJECTED -> Unit
                ActionStatus.CONFIRMED, ActionStatus.FAILED -> throw Errors.conflict("This request was already ${row.status.key}.")
            }
        }
        return mine(user, id)!!
    }

    private fun markNeedsApproval(conn: Connection, row: CustomerRequestRow, user: CurrentUser) {
        conn.update(
            "UPDATE customer_agent_requests SET needs_approval = true, expires_at = ? WHERE id = ?", now.plus(APPROVAL_TTL), row.id,
        )
        ctx.inbox.notify(
            conn,
            NewNotification(
                user.id, InboxKind.AGENT_APPROVAL, "${row.app.name} wants to: ${row.proposal.title}", row.proposal.summary,
                approvalPath(row.id), row.businessId, row.id, approvalKey(row.id),
            ),
        )
    }

    /** Runs the request through the website's own commands, as the customer, audited as the app acting for them. */
    private suspend fun execute(user: CurrentUser, row: CustomerRequestRow): CustomerRequestResult {
        val actor = Actor.oauthClient(user.id, row.app.clientId)
        val myBookings = ActionLink("Your bookings", ctx.config.urls.myBookings())
        return when (row.kind) {
            CustomerChangeKind.BOOK -> {
                val a = StrictArgs.decode(serializer<BookArgs>(), row.input)
                val email = user.verifiedEmail ?: throw Errors.policy("Verify your email address on bookanything before booking.")
                val business = ctx.db.read { conn -> BusinessRepository.findById(conn, row.businessId) }?.takeIf { it.isActive }
                    ?: throw Errors.notFound("Business")
                val (result, _) = ctx.booking.public.create(
                    business,
                    CreatePublicBooking(
                        serviceId = a.serviceId, optionId = a.optionId, addonIds = a.addonIds,
                        groupId = groupOf(user, business)?.toString(),
                        resourceId = a.resourceId, start = a.start,
                        customer = PublicCustomerInput(user.name?.takeIf { it.isNotBlank() } ?: email.substringBefore('@'), email, a.phone),
                        answers = a.answers, customerNotes = a.notes, returnUrl = null, payment = a.payment,
                    ),
                    user = user, idempotencyKey = "agent:${row.id}", source = BookingSource.API, actor = actor,
                )
                val pay = result.next.checkoutUrl?.takeIf { result.next.type == "payment_required" }
                CustomerRequestResult(
                    when (result.next.type) {
                        "payment_required" -> "Your time is held. Pay to confirm it."
                        "pending_approval" -> "Requested. ${business.name} will confirm it by email."
                        else -> "Booked. A confirmation email is on its way."
                    },
                    listOfNotNull(pay?.let { ActionLink("Pay now", it) }, myBookings),
                    result.booking.id,
                )
            }
            CustomerChangeKind.RESCHEDULE -> {
                val a = StrictArgs.decode(serializer<RescheduleArgs>(), row.input)
                val moved = ctx.booking.customer.rescheduleOwn(
                    user, parseUuid(a.bookingId, "bookingId"), a.start, a.resourceId?.let { parseUuid(it, "resourceId") }, actor,
                )
                CustomerRequestResult("Moved. A confirmation email is on its way.", listOf(myBookings), moved.id)
            }
            CustomerChangeKind.CANCEL -> {
                val a = StrictArgs.decode(serializer<CancelArgs>(), row.input)
                val id = parseUuid(a.bookingId, "bookingId")
                val before = ctx.booking.customer.ownBooking(user, id).booking.amountRefundedCents
                val cancelled = ctx.booking.customer.cancelOwn(user, id, a.reason, actor)
                val refunded = cancelled.amountRefundedCents - before
                CustomerRequestResult(
                    if (refunded > 0) "Cancelled. ${OfferText.money(refunded, cancelled.currency)} is being refunded." else "Cancelled.",
                    listOf(myBookings), cancelled.id,
                )
            }
        }
    }

    // --- Customer's own rules ---

    fun autoApprove(conn: Connection, userId: UUID): Set<CustomerAutoApprove> =
        conn.queryOne("SELECT agent_auto_approve FROM users WHERE id = ?", userId) { it.stringList("agent_auto_approve") }
            .orEmpty().mapNotNull(CustomerAutoApprove::parse).toSet()

    suspend fun settings(user: CurrentUser) = AgentSettingsDto(ctx.db.read { conn -> sorted(autoApprove(conn, user.id)) })

    suspend fun updateSettings(user: CurrentUser, input: UpdateAgentSettings): AgentSettingsDto {
        val kinds = input.autoApprove.map {
            CustomerAutoApprove.parse(it) ?: throw Errors.field("autoApprove", "Each must be bookings or cancellations")
        }.toSet()
        ctx.db.tx { conn ->
            conn.update("UPDATE users SET agent_auto_approve = ? WHERE id = ?", TextArray(sorted(kinds).map { it.key }), user.id)
        }
        return AgentSettingsDto(sorted(kinds))
    }

    private fun sorted(kinds: Set<CustomerAutoApprove>) = CustomerAutoApprove.entries.filter { it in kinds }

    fun toDto(row: CustomerRequestRow): CustomerRequestDto {
        val zone = runCatching { java.time.ZoneId.of(row.timezone) }.getOrDefault(java.time.ZoneOffset.UTC)
        return CustomerRequestDto(
            ActionDto(
                row.id.toString(), row.kind.key, row.effectiveStatus(now), row.proposal,
                row.result?.let { ActionResult(it.message, it.links) }, row.error, formatInstant(row.expiresAt, zone),
                formatInstant(row.createdAt, zone), formatInstantOrNull(row.decidedAt, zone),
            ),
            row.app.name, NamedRef(row.businessName, row.businessSlug), row.timezone, row.needsApproval, row.app.revoked,
        )
    }

    fun approvalUrl(id: UUID) = "${ctx.config.appBaseUrl}${approvalPath(id)}"

    companion object {
        /** How long a request waits for the customer's approval. */
        val APPROVAL_TTL: Duration = Duration.ofHours(24)

        /** How long the app may confirm a request the customer lets go ahead. */
        val CONFIRM_TTL: Duration = Duration.ofMinutes(30)

        private val SHOWN: Duration = Duration.ofDays(7)
        private const val MAX_SHOWN = 50

        /** A failure we can't explain: whether anything changed is unknown, so the customer is sent to check. */
        private const val UNKNOWN_OUTCOME = "Something went wrong. Check your bookings before asking again."

        private val log = LoggerFactory.getLogger(CustomerRequests::class.java)

        /** Requests are kept this long (the page shows a week), then purged ([purgeOld], `Retention`). */
        val KEPT: Duration = Duration.ofDays(90)

        fun purgeOld(conn: Connection, before: Instant, batch: Int): Int = conn.update(
            "DELETE FROM customer_agent_requests WHERE id IN (SELECT id FROM customer_agent_requests WHERE created_at < ? LIMIT ?)",
            before, batch,
        )

        /** A deleted account: the requests its apps made (with their details) go with it. */
        fun forgetUser(conn: Connection, userId: UUID) {
            conn.update("DELETE FROM customer_agent_requests WHERE user_id = ?", userId)
        }

        fun approvalPath(id: UUID) = "/my/approvals/$id"

        private fun approvalKey(id: UUID) = "customer-request:$id"

        private const val COLUMNS = "r.id, r.user_id, r.oauth_grant_id, r.business_id, r.kind, r.input::text AS input, " +
            "r.preview::text AS preview, r.needs_approval, r.status, r.result::text AS result, r.error, r.expires_at, r.created_at, " +
            "r.decided_at, g.client_id, c.client_name, g.revoked_at IS NOT NULL AS revoked, b.name AS business_name, " +
            "b.slug AS business_slug, b.timezone"
        private const val FROM = "customer_agent_requests r JOIN oauth_grants g ON g.id = r.oauth_grant_id " +
            "JOIN oauth_clients c ON c.client_id = g.client_id JOIN businesses b ON b.id = r.business_id"

        private fun get(conn: Connection, id: UUID): CustomerRequestRow? =
            conn.queryOne("SELECT $COLUMNS FROM $FROM WHERE r.id = ?", id, map = ::map)

        private fun map(rs: ResultSet) = CustomerRequestRow(
            rs.uuid("id"), rs.uuid("user_id"), rs.uuid("oauth_grant_id"), rs.uuid("business_id"), CustomerChangeKind.parse(rs.str("kind")),
            StoredJson.decodeFromString(JsonObject.serializer(), rs.str("input")),
            StoredJson.decodeFromString(serializer<Proposal>(), rs.str("preview")), rs.bool("needs_approval"),
            ActionStatus.parse(rs.str("status")),
            rs.strOrNull("result")?.let { StoredJson.decodeFromString(serializer<CustomerRequestResult>(), it) }, rs.strOrNull("error"),
            rs.instant("expires_at"), rs.instant("created_at"), rs.instantOrNull("decided_at"),
            ActionApp(rs.str("client_id"), rs.str("client_name"), rs.bool("revoked")), rs.str("business_name"), rs.str("business_slug"),
            rs.str("timezone"),
        )
    }
}
