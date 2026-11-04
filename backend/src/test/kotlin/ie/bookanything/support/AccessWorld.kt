package ie.bookanything.support

import ie.bookanything.assistant.ConversationRepository
import ie.bookanything.assistant.actions.ActionRepository
import ie.bookanything.assistant.actions.NewAction
import ie.bookanything.assistant.memory.MemoryRepository
import ie.bookanything.assistant.tools.Proposal
import ie.bookanything.auth.DevTokenVerifier
import ie.bookanything.auth.UserRepository
import ie.bookanything.jobs.JobWorker
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.time.DayOfWeek
import java.time.Duration
import java.time.LocalDate
import java.util.UUID

/** Every kind of caller the access matrix asks about. Members are of the world's business; staff are linked to Alex. */
enum class Caller(val label: String) {
    ANONYMOUS("anonymous"),
    CUSTOMER("customer"),
    OTHER_OWNER("another business's owner"),
    STAFF("staff (linked to Alex)"),
    ADMIN("admin"),
    OWNER("owner"),
    ;

    val isMember: Boolean get() = this == STAFF || this == ADMIN || this == OWNER
}

/**
 * A business with one of everything, the people around it, and a second business owned by someone else, for tests
 * that call every route as every kind of caller ([Caller]). The customer has booked with Alex (whom the staff member is
 * linked to); a guest has booked with Blake. [params] fills the `{name}` segments of a route template.
 */
class AccessWorld private constructor(
    val env: TestEnv,
    val api: Api,
    val clinic: Clinic,
    val users: Map<Caller, TestUser>,
    /** The ids every route template may need, for this world's business. */
    val params: Map<String, String>,
    /** The same kinds of ids in the other business (for "someone else's id in my own route" checks). */
    val foreign: Map<String, String>,
) {
    fun token(caller: Caller): String? = users[caller]?.token

    /** The resource fresh bookings and time off are made on: Alex (the staff member's), or Blake for scoping checks. */
    var side: String = "Alex"

    /** The user id of [caller] (created on first use, like a first sign-in). */
    suspend fun userId(caller: Caller): UUID = userId(users.getValue(caller))

    suspend fun userId(user: TestUser): UUID {
        val identity = checkNotNull(DevTokenVerifier().verify(user.token))
        return env.db.tx { conn -> UserRepository.upsert(conn, identity) }.id
    }

    /** A new public booking with [resource] for [service]; returns the booking JSON with `manageToken`. */
    suspend fun booking(
        resource: String = side, service: String = "Consult", start: String = nextStart(), by: Caller? = null,
    ): JsonObject {
        val email = by?.let { users.getValue(it).email }
        return Fixtures.book(
            api, clinic, service, start, token = by?.let(::token), email = email, resourceId = clinic.resource(resource),
        )
    }

    private var hour = 0

    /** A distinct free weekday hour (Alex and Blake both work 13:00-17:00 on weekdays) per call, from two weeks out. */
    fun nextStart(): String {
        val weekdays = generateSequence(LocalDate.of(2026, 10, 19)) { it.plusDays(1) }
            .filter { it.dayOfWeek != DayOfWeek.SATURDAY && it.dayOfWeek != DayOfWeek.SUNDAY }
        val day = weekdays.elementAt(hour / 4)
        val time = 13 + hour % 4
        hour++
        val offset = if (day.isBefore(LocalDate.of(2026, 10, 25))) "+01:00" else "Z" // Dublin's summer time ends on 25 Oct
        return "${day}T${time.toString().padStart(2, '0')}:00:00$offset"
    }

    /**
     * A pending Bo proposal that [caller] asked for in their own thread (proposals belong to the member who asked): time
     * off for Alex, a tool every member may run (staff are linked to Alex).
     */
    suspend fun action(caller: Caller): String {
        val userId = userId(if (caller.isMember) caller else Caller.OWNER)
        val now = env.clock.instant()
        val business = UUID.fromString(clinic.id)
        val input = JsonObject(
            mapOf(
                "resourceId" to JsonPrimitive(clinic.resource("Alex")), "date" to JsonPrimitive(nextOffDay()),
                "startTime" to JsonNull, "endTime" to JsonNull, "reason" to JsonPrimitive("Training"),
            ),
        )
        return env.db.tx(business) { conn ->
            val thread = ConversationRepository.createThread(conn, business, userId, "Matrix", now)
            val proposal = Proposal("Block time", "Alex is off for training")
            ActionRepository.insert(
                conn, business,
                NewAction(thread.id, userId, "block_time", unique("toolu"), input, proposal, now.plus(Duration.ofMinutes(30))), now,
            ).id.toString()
        }
    }

    private var offDays = 0

    /** A distinct far-off date for time off (beyond every booking the world makes). */
    fun nextOffDay(): String = LocalDate.of(2026, 11, 2).plusDays((offDays++).toLong()).toString()

    /** A Bo thread of [caller]'s own (threads are private to the member). */
    suspend fun thread(caller: Caller): String {
        val userId = userId(if (caller.isMember) caller else Caller.OWNER)
        return env.db.tx(UUID.fromString(clinic.id)) { conn ->
            ConversationRepository.createThread(conn, UUID.fromString(clinic.id), userId, "Matrix", env.clock.instant()).id.toString()
        }
    }

    suspend fun memory(): String = env.db.tx(UUID.fromString(clinic.id)) { conn ->
        MemoryRepository.insert(conn, UUID.fromString(clinic.id), "Closed on bank holidays", null, env.clock.instant()).toString()
    }

    private val invitations = mutableMapOf<String, String>()

    /** A pending invitation for [user]'s email (one per world); returns the token from the invitation email. */
    suspend fun invitation(user: TestUser, role: String = "staff"): String = invitations[user.email] ?: run {
        val res = api.post("${clinic.base}/team/invitations", jsonOf("email" to user.email, "role" to role), clinic.owner.token)
        assertStatus(HttpStatusCode.Created, res)
        JobWorker(env.ctx).drain()
        val mail = env.email.sent.last { it.template == "team_invitation" && it.to == user.email }
        Regex("/invitations/([A-Za-z0-9_-]+)").find(mail.text)!!.groupValues[1].also { invitations[user.email] = it }
    }

    /** A new member with [role] (the target of team changes, so the world's own members stay as they are). */
    suspend fun member(role: String): String {
        val user = Roles.member(api, clinic, role)
        return api.get("${clinic.base}/team", clinic.owner.token).arr().first { it.s("email") == user.email }.s("id")
    }

    suspend fun group(): String =
        created("customer-groups", jsonOf("name" to unique("Group"), "description" to null, "restricted" to false))

    suspend fun question(): String = created("questions", jsonOf("label" to unique("Question"), "kind" to "text"))

    suspend fun service(): String = created(
        "services",
        jsonOf(
            "name" to unique("Service"), "durationMinutes" to 30,
            "requirements" to listOf(mapOf("label" to "Therapist", "resourceIds" to listOf(clinic.resource("Blake")))),
        ),
    )

    suspend fun offer(): String = created("offers", offerBody(clinic))

    /** A schedule on a new service (a service and its customers can be in only one schedule). */
    suspend fun releaseSchedule(): String = created("release-schedules", releaseScheduleBody(service(), unique("Release")))

    private suspend fun created(collection: String, body: String): String {
        val res = api.post("${clinic.base}/$collection", body, clinic.owner.token)
        assertStatus(HttpStatusCode.Created, res)
        return res.obj().s("id")
    }

    suspend fun resource(): String {
        val res = api.post("${clinic.base}/resources", jsonOf("kind" to "equipment", "name" to unique("Kit")), clinic.owner.token)
        assertStatus(HttpStatusCode.Created, res)
        return res.obj().s("id")
    }

    suspend fun override(resource: String = side): String {
        val res = api.post(
            "${clinic.base}/resources/${clinic.resource(resource)}/overrides",
            jsonOf("date" to nextOffDay(), "isAvailable" to false, "reason" to "Course"), clinic.owner.token,
        )
        assertStatus(HttpStatusCode.Created, res)
        return res.obj().s("id")
    }

    suspend fun customer(): String = created("customers", jsonOf("name" to "Erin Erase", "email" to "${unique("erase")}@example.test"))

    companion object {
        fun offerBody(clinic: Clinic) = jsonOf(
            "name" to unique("Quiet Tuesdays"), "description" to null, "serviceIds" to listOf(clinic.service("Paid consult")),
            "discount" to mapOf("type" to "percent", "percent" to 20),
            "schedule" to mapOf(
                "daysOfWeek" to listOf(2), "timeWindows" to listOf(mapOf("start" to "13:00", "end" to "17:00")), "lastMinuteHours" to null,
            ),
            "validFrom" to null, "validUntil" to null, "maxRedemptions" to null, "active" to true,
        )

        /** A paused schedule (it closes nothing, so other routes' probes book as usual). */
        fun releaseScheduleBody(serviceId: String, name: String = "Next day") = jsonOf(
            "name" to name, "serviceIds" to listOf(serviceId), "everyone" to true, "cadence" to "daily",
            "time" to "17:00", "daysBefore" to 1, "active" to false,
        )

        suspend fun create(env: TestEnv, api: Api): AccessWorld {
            val (clinic, users, params) = business(env, api, otherOwner = null)
            val (_, _, foreign) = business(env, api, otherOwner = users.getValue(Caller.OTHER_OWNER))
            return AccessWorld(env, api, clinic, users, params, foreign)
        }

        /** One business with everything in it; [otherOwner] owns it when given (the second business). */
        private suspend fun business(
            env: TestEnv,
            api: Api,
            otherOwner: TestUser?,
        ): Triple<Clinic, Map<Caller, TestUser>, Map<String, String>> {
            val clinic = if (otherOwner != null) Fixtures.clinic(api, otherOwner) else Fixtures.clinic(api)
            Fixtures.sql("UPDATE businesses SET plan = 'business' WHERE id = ?::uuid", clinic.id) // room for the extra members
            val customer = TestUser.create("customer", "Casey Customer")
            val users = mapOf(
                Caller.OWNER to clinic.owner,
                Caller.ADMIN to Roles.member(api, clinic, "admin"),
                Caller.STAFF to Roles.member(api, clinic, "staff", "Alex"),
                Caller.CUSTOMER to customer,
                Caller.OTHER_OWNER to (otherOwner ?: TestUser.create("other", "Otto Other")),
            )
            val own = Fixtures.book(
                api, clinic, "Consult", "2026-10-12T10:00:00+01:00", token = customer.token, email = customer.email,
                resourceId = clinic.resource("Alex"),
            )
            val ownId = own["booking"]!!.s("id")
            val detail = api.get("${clinic.base}/bookings/$ownId", clinic.owner.token).obj()
            val team = api.get("${clinic.base}/team", clinic.owner.token).arr()
            val offer = api.post("${clinic.base}/offers", offerBody(clinic), clinic.owner.token)
            assertStatus(HttpStatusCode.Created, offer)
            val schedule = api.post(
                "${clinic.base}/release-schedules", releaseScheduleBody(clinic.service("Paid consult")), clinic.owner.token,
            )
            assertStatus(HttpStatusCode.Created, schedule)
            val override = api.post(
                "${clinic.base}/resources/${clinic.resource("Alex")}/overrides",
                jsonOf("date" to "2026-11-30", "isAvailable" to false, "reason" to "Course"), clinic.owner.token,
            )
            assertStatus(HttpStatusCode.Created, override)
            assertStatus(HttpStatusCode.OK, api.post("${clinic.base}/site/publish", null, clinic.owner.token)) // site version 1
            val paid = Fixtures.book(api, clinic, "Paid consult", "2026-10-13T14:00:00+01:00", resourceId = clinic.resource("Alex"))
            val blake = Fixtures.book(api, clinic, "Consult", "2026-10-12T14:00:00+01:00", resourceId = clinic.resource("Blake"))
            val blakeId = blake["booking"]!!.s("id")
            val blakeOff = api.post(
                "${clinic.base}/resources/${clinic.resource("Blake")}/overrides",
                jsonOf("date" to "2026-11-30", "isAvailable" to false, "reason" to "Course"), clinic.owner.token,
            )
            assertStatus(HttpStatusCode.Created, blakeOff)
            val blakeParams = mapOf(
                "bookingId" to blakeId,
                "customerId" to api.get("${clinic.base}/bookings/$blakeId", clinic.owner.token).obj()["customer"]!!.s("id"),
                "resourceId" to clinic.resource("Blake"),
                "overrideId" to blakeOff.obj().s("id"),
            ).mapKeys { (k, _) -> "blake.$k" }
            val params = blakeParams + mapOf(
                "businessId" to clinic.id,
                "slug" to clinic.slug,
                "bookingId" to ownId,
                "token" to own.s("manageToken"),
                "customerId" to detail["customer"]!!.s("id"),
                "resourceId" to clinic.resource("Alex"),
                "serviceId" to clinic.service("Consult"),
                "groupId" to clinic.groups.getValue("Members"),
                "questionId" to clinic.questions.getValue("Referred by"),
                "overrideId" to override.obj().s("id"),
                "memberId" to team.first { it.s("role") == "staff" }.s("id"),
                "offerId" to offer.obj().s("id"),
                "scheduleId" to schedule.obj().s("id"),
                "date" to "2026-10-20",
                "paymentId" to paid["next"]!!.s("checkoutUrl").substringAfterLast('/'),
                "version" to "1",
                "key" to "physio",
                "template" to "booking_confirmed",
                "file" to "missing.png",
                "nudgeId" to UUID.randomUUID().toString(),
                "actionId" to UUID.randomUUID().toString(),
                "id" to UUID.randomUUID().toString(),
                "memoryId" to env.db.tx(UUID.fromString(clinic.id)) { conn ->
                    MemoryRepository.insert(conn, UUID.fromString(clinic.id), "Parking is round the back", null, env.clock.instant())
                }.toString(),
            )
            return Triple(clinic, users, params)
        }
    }
}
