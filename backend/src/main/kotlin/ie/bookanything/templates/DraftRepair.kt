package ie.bookanything.templates

import ie.bookanything.business.Branding
import ie.bookanything.business.Policies
import ie.bookanything.business.Vocabulary
import ie.bookanything.http.zoneOrNull
import ie.bookanything.resources.RESOURCE_KINDS
import ie.bookanything.services.LOCATION_TYPES
import ie.bookanything.services.PAYMENT_MODES
import ie.bookanything.services.QUESTION_KINDS
import ie.bookanything.services.ServiceAddonInput
import ie.bookanything.services.ServiceOptionInput
import java.time.LocalTime
import java.util.Currency
import java.util.Locale

/**
 * Repairs and clamps model output into a [BusinessSetup]: unknown timezone → Europe/Dublin,
 * negative prices → 0, durations rounded to 5 minutes and clamped, unknown keys dropped,
 * inconsistent payment settings fixed, missing requirements added. Returns null when nothing
 * bookable remains.
 */
object DraftRepair {
    private val PALETTE = listOf("#0ea5e9", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#6366f1", "#14b8a6", "#ec4899")
    private val TIME = Regex("^(\\d{1,2}):(\\d{2})$")
    private val CONTROL = Regex("[\\p{Cntrl}&&[^\\n\\t]]")
    private val LOCALE = Regex("^[a-z]{2,3}(-[A-Z]{2})?$")
    private val COUNTRY = Regex("^[A-Z]{2}$")
    private val COLOR = Regex("^#[0-9a-fA-F]{6}$")
    private val NOT_KEY = Regex("[^a-z0-9_-]+")
    private const val MAX_PRICE_CENTS = 10_000_000
    private val DEFAULTS = BusinessSetup(name = "x")

    fun toSetup(ai: AiSetup, request: BusinessDraftRequest): BusinessSetup? {
        val vocabulary = vocabulary(ai.vocabulary)
        val groupKeys = DraftKeys()
        val groups = ai.customerGroups.take(20).mapIndexedNotNull { i, g -> group(i, g, groupKeys) }
        val resourceKeys = DraftKeys()
        val resources = ai.resources.take(50).mapIndexedNotNull { i, r -> resource(i, r, resourceKeys, groupKeys) }
        val refs = ServiceRefs(resources, resourceKeys, groupKeys, vocabulary)
        val services = if (resources.isEmpty()) emptyList() else services(ai.services, refs)
        if (services.isEmpty()) return null
        val serviceByLower = services.associateBy { it.name.lowercase() }
        return BusinessSetup(
            source = "ai", name = text(ai.name, 100) ?: TemplateDraftGenerator().generate(request).name, slug = null,
            industry = key(ai.industry, "generic").take(50), description = text(ai.description, 2000) ?: text(request.description, 500),
            timezone = timezone(ai.timezone), currency = currency(ai.currency), locale = locale(ai.locale), country = country(ai.country),
            vocabulary = vocabulary, branding = Branding(primaryColor = color(ai.primaryColor)), policies = policies(ai.policies),
            customerGroups = groups, resources = resources, services = services,
            questions = ai.questions.take(30).mapNotNull { question(it, serviceByLower) },
        )
    }

    // ---- Business settings ----

    /** A region zone id (e.g. Europe/London); anything else, including UTC and raw offsets, is the default. */
    internal fun timezone(raw: String): String = raw.trim().takeIf { it.contains('/') && zoneOrNull(it) != null } ?: DEFAULTS.timezone

    internal fun currency(raw: String): String =
        raw.trim().uppercase().takeIf { c -> c.length == 3 && runCatching { Currency.getInstance(c) }.isSuccess } ?: DEFAULTS.currency

    internal fun locale(raw: String): String = raw.trim().takeIf { LOCALE.matches(it) } ?: DEFAULTS.locale

    internal fun country(raw: String): String = raw.trim().uppercase().takeIf { COUNTRY.matches(it) } ?: DEFAULTS.country

    internal fun color(raw: String): String = raw.trim().takeIf { COLOR.matches(it) }?.lowercase() ?: Branding.DEFAULT_PRIMARY_COLOR

    private fun vocabulary(v: AiVocabulary): Vocabulary {
        val d = Vocabulary()
        return Vocabulary(
            resource = text(v.resource, 40) ?: d.resource, resources = text(v.resources, 40) ?: d.resources,
            customer = text(v.customer, 40) ?: d.customer, customers = text(v.customers, 40) ?: d.customers,
            booking = text(v.booking, 40) ?: d.booking, bookings = text(v.bookings, 40) ?: d.bookings,
        )
    }

    /** The model's policies kept to sensible values (the hold to the range the schema and prompt ask for). */
    internal fun policies(p: AiPolicies): Policies {
        val d = Policies()
        return Policies(
            minNoticeMinutes = (p.minNoticeMinutes ?: d.minNoticeMinutes).coerceIn(0, 60 * 24 * 90),
            maxAdvanceDays = (p.maxAdvanceDays ?: d.maxAdvanceDays).coerceIn(1, 730),
            cancellationNoticeHours = (p.cancellationNoticeHours ?: d.cancellationNoticeHours).coerceIn(0, 24 * 60),
            lateCancellationRefundPercent = (p.lateCancellationRefundPercent ?: d.lateCancellationRefundPercent).coerceIn(0, 100),
            allowCustomerCancel = p.allowCustomerCancel ?: d.allowCustomerCancel,
            allowCustomerReschedule = p.allowCustomerReschedule ?: d.allowCustomerReschedule,
            holdMinutes = (p.holdMinutes ?: d.holdMinutes).coerceIn(Policies.SUGGESTED_HOLD_MINUTES),
            requireCustomerPhone = p.requireCustomerPhone ?: d.requireCustomerPhone,
        )
    }

    // ---- Groups and resources ----

    private fun group(i: Int, g: AiGroup, keys: DraftKeys): SetupGroup? {
        val name = text(g.name, 100) ?: return null
        return SetupGroup(keys.assign(g.key, key(g.key.ifBlank { name }, "group_${i + 1}")), name, text(g.description, 500), g.restricted)
    }

    private fun resource(i: Int, r: AiResource, keys: DraftKeys, groupKeys: DraftKeys): SetupResource? {
        val name = text(r.name, 100) ?: return null
        val k = keys.assign(r.key, key(r.key.ifBlank { name }, "resource_${i + 1}"))
        val hours = r.weeklyHours.take(28).mapNotNull { hours(it, groupKeys) }.distinct()
        return SetupResource(
            k, r.kind.trim().lowercase().takeIf { it in RESOURCE_KINDS } ?: "person", name, text(r.description, 1000),
            r.capacity.coerceIn(1, 1000), hours,
        )
    }

    private fun hours(h: AiHours, groupKeys: DraftKeys): SetupWeeklyHours? {
        val start = time(h.startTime)
        val end = time(h.endTime)
        if (start == null || end == null || h.dayOfWeek !in 1..7 || !end.isAfter(start)) return null
        return SetupWeeklyHours(h.dayOfWeek, fmt(start), fmt(end), groupKeys.resolve(h.audienceGroupKeys))
    }

    // ---- Services ----

    /** What a service may refer to: the repaired resources and the keys the model used for them and for groups. */
    private class ServiceRefs(
        val resources: List<SetupResource>, val resourceKeys: DraftKeys, val groupKeys: DraftKeys, val vocabulary: Vocabulary,
    )

    private fun services(raw: List<AiService>, refs: ServiceRefs): List<SetupService> {
        val names = mutableSetOf<String>()
        return raw.take(40).mapIndexedNotNull { i, s ->
            val name = text(s.name, 120)?.takeIf { names.add(it.lowercase()) } ?: return@mapIndexedNotNull null
            service(name, PALETTE[i % PALETTE.size], s, refs)
        }
    }

    private fun service(name: String, color: String, s: AiService, refs: ServiceRefs): SetupService {
        val price = s.priceCents.coerceIn(0, MAX_PRICE_CENTS)
        val options = options(s.options)
        val addons = addons(s.addons)
        val anyPrice = price > 0 || options.any { it.priceCents > 0 } || addons.any { it.priceCents > 0 }
        val payment = payment(s.paymentMode, price, anyPrice, s.depositCents)
        return SetupService(
            name = name, description = text(s.description, 2000), category = text(s.category, 60), color = color,
            durationMinutes = roundTo5(s.durationMinutes).coerceIn(5, 1440),
            bufferBeforeMinutes = roundTo5(s.bufferBeforeMinutes).coerceIn(0, 480),
            bufferAfterMinutes = roundTo5(s.bufferAfterMinutes).coerceIn(0, 480),
            slotIntervalMinutes = s.slotIntervalMinutes.takeIf { it > 0 }?.let { roundTo5(it).coerceIn(5, 1440) },
            capacity = s.capacity.coerceIn(1, 1000), priceCents = price, paymentMode = payment.mode, depositCents = payment.depositCents,
            requiresApproval = s.requiresApproval,
            locationType = s.locationType.trim().lowercase().takeIf { it in LOCATION_TYPES } ?: "business",
            isPublic = true, options = options, addons = addons, requirements = requirements(s.requirements, refs),
            allowedGroupKeys = refs.groupKeys.resolve(s.allowedGroupKeys),
        )
    }

    private fun options(raw: List<AiOption>): List<ServiceOptionInput> {
        val names = mutableSetOf<String>()
        return raw.take(30).mapIndexedNotNull { j, o ->
            val n = text(o.name, 120)?.takeIf { names.add(it.lowercase()) } ?: return@mapIndexedNotNull null
            ServiceOptionInput(
                name = n, description = text(o.description, 500), durationMinutes = roundTo5(o.durationMinutes).coerceIn(5, 1440),
                priceCents = o.priceCents.coerceIn(0, MAX_PRICE_CENTS), sortOrder = j,
            )
        }
    }

    private fun addons(raw: List<AiAddon>): List<ServiceAddonInput> {
        val names = mutableSetOf<String>()
        return raw.take(30).mapIndexedNotNull { j, a ->
            val n = text(a.name, 120)?.takeIf { names.add(it.lowercase()) } ?: return@mapIndexedNotNull null
            ServiceAddonInput(
                name = n, description = text(a.description, 500), extraMinutes = roundTo5(a.extraMinutes).coerceIn(0, 480),
                priceCents = a.priceCents.coerceIn(0, MAX_PRICE_CENTS), sortOrder = j,
            )
        }
    }

    internal data class Payment(val mode: String, val depositCents: Int?)

    /**
     * A payment mode consistent with the prices: free exactly when nothing has a price (a priced "free" service is paid at
     * the venue), and a deposit only when it is between 1 and the price (otherwise the full price is paid online).
     */
    internal fun payment(raw: String, priceCents: Int, anyPrice: Boolean, depositCents: Int): Payment {
        val given = raw.trim().lowercase()
        val mode = when {
            !anyPrice -> "free"
            given == "free" -> "at_venue"
            given in PAYMENT_MODES -> given
            else -> "full"
        }
        if (mode != "deposit") return Payment(mode, null)
        val deposit = depositCents.coerceAtLeast(0)
        return if (deposit in 1..priceCents) Payment(mode, deposit) else Payment("full", null)
    }

    /** At most one customer-selectable requirement (and only over a real choice); none given → the people, or everything. */
    private fun requirements(raw: List<AiRequirement>, refs: ServiceRefs): List<SetupRequirement> {
        var selectableUsed = false
        return raw.take(10).mapNotNull { r ->
            val pool = refs.resourceKeys.resolve(r.resourceKeys)
            if (pool.isEmpty()) return@mapNotNull null
            val selectable = r.customerSelectable && !selectableUsed && pool.size > 1
            if (selectable) selectableUsed = true
            SetupRequirement(text(r.label, 100) ?: refs.vocabulary.resource, r.quantity.coerceIn(1, minOf(20, pool.size)), selectable, pool)
        }.ifEmpty {
            val people = refs.resources.filter { it.kind == "person" }.map { it.key }
            val pool = people.ifEmpty { refs.resources.map { it.key } }
            listOf(SetupRequirement(refs.vocabulary.resource, 1, people.isNotEmpty() && pool.size > 1, pool))
        }
    }

    private fun question(q: AiQuestion, serviceByLower: Map<String, SetupService>): SetupQuestion? {
        val label = text(q.label, 200) ?: return null
        val opts = q.options.mapNotNull { text(it, 100) }.distinct().take(20)
        val given = q.kind.trim().lowercase().takeIf { it in QUESTION_KINDS } ?: "text"
        val kind = if (given == "select" && opts.isEmpty()) "text" else given
        return SetupQuestion(
            label, text(q.helpText, 500), kind, if (kind == "select") opts else emptyList(), q.required, q.sensitive,
            q.serviceName.trim().lowercase().takeIf { it.isNotEmpty() }?.let { serviceByLower[it]?.name },
        )
    }

    // ---- Values ----

    /** Model text without control characters (newlines and tabs stay), trimmed and cut to [max]; null when empty. */
    internal fun text(s: String?, max: Int): String? = s?.replace(CONTROL, "")?.trim()?.take(max)?.trim()?.takeIf { it.isNotEmpty() }

    /** A lowercase key of letters, digits, `_` and `-` (at most 50), or [fallback] when nothing is left. */
    internal fun key(raw: String, fallback: String): String =
        raw.lowercase().replace(NOT_KEY, "_").trim('_').take(50).ifEmpty { fallback }

    internal fun roundTo5(v: Int) = ((v + 2) / 5) * 5

    /** "9:30" or "09:30" (24:00 means end of day, 23:59); null when it isn't a time. */
    internal fun time(raw: String): LocalTime? {
        val m = TIME.find(raw.trim()) ?: return null
        val h = m.groupValues[1].toInt()
        val min = m.groupValues[2].toInt()
        return when {
            h == 24 && min == 0 -> LocalTime.of(23, 59)
            h in 0..23 && min in 0..59 -> LocalTime.of(h, min)
            else -> null
        }
    }

    private fun fmt(t: LocalTime) = "%02d:%02d".format(Locale.ROOT, t.hour, t.minute)

    /** Unique keys for the model's ids: each id the model used, and each assigned key, resolves to the assigned key. */
    private class DraftKeys {
        private val taken = mutableSetOf<String>()
        private val byRaw = HashMap<String, String>()

        fun assign(raw: String, base: String): String {
            var k = base
            var i = 2
            while (!taken.add(k)) k = "${base.take(46)}_${i++}"
            byRaw[raw] = k
            byRaw[k] = k
            return k
        }

        fun resolve(raw: List<String>): List<String> = raw.mapNotNull { byRaw[it] ?: byRaw[key(it, "")] }.distinct()
    }
}
