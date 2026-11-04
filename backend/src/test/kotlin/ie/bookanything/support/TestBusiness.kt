package ie.bookanything.support

import ie.bookanything.business.Policies
import ie.bookanything.http.ApiJson
import ie.bookanything.services.ServiceAddonInput
import ie.bookanything.services.ServiceOptionInput
import ie.bookanything.templates.BusinessSetup
import ie.bookanything.templates.SetupGroup
import ie.bookanything.templates.SetupQuestion
import ie.bookanything.templates.SetupRequirement
import ie.bookanything.templates.SetupResource
import ie.bookanything.templates.SetupService
import ie.bookanything.templates.SetupWeeklyHours
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.serializer

/**
 * A test-data builder for businesses: name only what the test is about, the rest has defaults that never get in the
 * way (no notice period, two months of advance booking, customers may cancel and reschedule).
 *
 * ```
 * val carWash = testBusiness("Suds") {
 *     val bay = space("Bay")
 *     service("Wash", 30) { price(2000); option("Large car", 45, 2500); addon("Wax", 15, 800); needs("Bay", bay) }
 * }
 * val clinic = api.createBusiness(carWash)
 * ```
 */
fun testBusiness(name: String = "Test Business", block: TestBusinessBuilder.() -> Unit): BusinessSetup =
    TestBusinessBuilder(name).apply(block).build()

/** Weekday opening hours (Monday to Friday), optionally only for [groups]. */
fun weekdays(start: String = "09:00", end: String = "17:00", groups: List<String> = emptyList()): List<SetupWeeklyHours> =
    (1..5).map { SetupWeeklyHours(it, start, end, groups) }

/** Opening hours on every day of the week. */
fun everyDay(start: String = "09:00", end: String = "17:00"): List<SetupWeeklyHours> = (1..7).map { SetupWeeklyHours(it, start, end) }

class TestBusinessBuilder(private val name: String) {
    var industry = "generic"
    var timezone = "Europe/Dublin"
    var currency = "EUR"
    var policies = Policies(
        minNoticeMinutes = 0, maxAdvanceDays = 60, cancellationNoticeHours = 24, lateCancellationRefundPercent = 50,
        allowCustomerCancel = true, allowCustomerReschedule = true, holdMinutes = 15, requireCustomerPhone = false,
    )
    private val groups = mutableListOf<SetupGroup>()
    private val resources = mutableListOf<SetupResource>()
    private val services = mutableListOf<SetupService>()
    private val questions = mutableListOf<SetupQuestion>()

    /** A customer group; returns its key. Restricted groups only see hours and services meant for them. */
    fun group(name: String, restricted: Boolean = false): String =
        key(name).also { groups += SetupGroup(it, name, null, restricted) }

    /** A person (therapist, teacher, doctor); returns its key. */
    fun person(name: String, hours: List<SetupWeeklyHours> = weekdays()): String = resource("person", name, 1, hours)

    /** A room, bay or other space; returns its key. */
    fun space(name: String, capacity: Int = 1, hours: List<SetupWeeklyHours> = weekdays()): String =
        resource("space", name, capacity, hours)

    fun equipment(name: String, hours: List<SetupWeeklyHours> = weekdays()): String = resource("equipment", name, 1, hours)

    private fun resource(kind: String, name: String, capacity: Int, hours: List<SetupWeeklyHours>): String =
        key(name).also { resources += SetupResource(it, kind, name, capacity = capacity, weeklyHours = hours) }

    /** A free service of [minutes] unless [block] sets a price. */
    fun service(name: String, minutes: Int, block: TestServiceBuilder.() -> Unit = {}) {
        services += TestServiceBuilder(name, minutes).apply(block).build()
    }

    fun question(
        label: String, kind: String = "text", options: List<String> = emptyList(), required: Boolean = false,
        sensitive: Boolean = false, forService: String? = null,
    ) {
        questions +=
            SetupQuestion(label, kind = kind, options = options, required = required, sensitive = sensitive, serviceName = forService)
    }

    fun build() = BusinessSetup(
        name = name, slug = unique("test"), industry = industry, timezone = timezone, currency = currency, policies = policies,
        customerGroups = groups.toList(), resources = resources.toList(), services = services.toList(), questions = questions.toList(),
    )

    private fun key(name: String) = name.lowercase().replace(Regex("[^a-z0-9]+"), "-").trim('-')
}

class TestServiceBuilder(name: String, minutes: Int) {
    private var service = SetupService(name = name, durationMinutes = minutes, paymentMode = "free")
    private val options = mutableListOf<ServiceOptionInput>()
    private val addons = mutableListOf<ServiceAddonInput>()
    private val requirements = mutableListOf<SetupRequirement>()

    /** Paid online in full. */
    fun price(cents: Int) {
        service = service.copy(priceCents = cents, paymentMode = "full", depositCents = null)
    }

    /** A [deposit] online, the rest of [cents] at the venue. */
    fun deposit(cents: Int, deposit: Int) {
        service = service.copy(priceCents = cents, paymentMode = "deposit", depositCents = deposit)
    }

    /** Paid at the venue. */
    fun atVenue(cents: Int) {
        service = service.copy(priceCents = cents, paymentMode = "at_venue", depositCents = null)
    }

    /** Public bookings wait for the business to approve them. */
    fun approval() {
        service = service.copy(requiresApproval = true)
    }

    /** Seats per session (a class or group lesson). */
    fun capacity(seats: Int) {
        service = service.copy(capacity = seats)
    }

    fun buffers(before: Int = 0, after: Int = 0) {
        service = service.copy(bufferBeforeMinutes = before, bufferAfterMinutes = after)
    }

    /** Start times every [minutes] (default: the duration). */
    fun every(minutes: Int) {
        service = service.copy(slotIntervalMinutes = minutes)
    }

    fun notice(minutes: Int) {
        service = service.copy(minNoticeMinutes = minutes)
    }

    /** Only these customer groups may book it. */
    fun onlyFor(vararg groupKeys: String) {
        service = service.copy(allowedGroupKeys = groupKeys.toList())
    }

    /** A variant with its own duration and price (replaces the service's). */
    fun option(name: String, minutes: Int, cents: Int) {
        options += ServiceOptionInput(name = name, durationMinutes = minutes, priceCents = cents, sortOrder = options.size)
    }

    fun addon(name: String, extraMinutes: Int, cents: Int) {
        addons += ServiceAddonInput(name = name, extraMinutes = extraMinutes, priceCents = cents, sortOrder = addons.size)
    }

    /** [quantity] of the resources in [pool] (keys), one booking each; [choosable] lets the customer pick. */
    fun needs(label: String, vararg pool: String, quantity: Int = 1, choosable: Boolean = false) {
        requirements += SetupRequirement(label, quantity, choosable, pool.toList())
    }

    fun build() = service.copy(options = options.toList(), addons = addons.toList(), requirements = requirements.toList())
}

/** Creates [setup] through the API as [owner] and resolves the ids of everything in it by name. */
suspend fun Api.createBusiness(setup: BusinessSetup, owner: TestUser = TestUser.create("owner", "Olive Owner")): Clinic {
    val res = post("/v1/businesses", ApiJson.encodeToString(serializer<BusinessSetup>(), setup), owner.token)
    assertStatus(HttpStatusCode.Created, res)
    val business = res.obj()
    val base = "/v1/businesses/${business.s("id")}"
    suspend fun byName(collection: String, name: String = "name") =
        get("$base/$collection", owner.token).arr().associate { it.s(name) to it.s("id") }
    return Clinic(
        business.s("id"), business.s("slug"), owner, byName("services"), byName("resources"), byName("customer-groups"),
        byName("questions", "label"),
    )
}
