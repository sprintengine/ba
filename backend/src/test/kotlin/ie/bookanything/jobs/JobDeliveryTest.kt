package ie.bookanything.jobs

import ie.bookanything.audit.Actor
import ie.bookanything.availability.AvailabilityMode
import ie.bookanything.booking.BookingSource
import ie.bookanything.booking.Cancellation
import ie.bookanything.booking.CreateCommand
import ie.bookanything.booking.CustomerSpec
import ie.bookanything.booking.PaymentChoice
import ie.bookanything.business.BusinessRepository
import ie.bookanything.notifications.NotificationKind
import ie.bookanything.notifications.Notify
import ie.bookanything.payments.CancelActor
import ie.bookanything.support.Fixtures
import ie.bookanything.support.Money
import ie.bookanything.support.TestEnv
import ie.bookanything.support.assertStatus
import ie.bookanything.support.createBusiness
import ie.bookanything.support.inParallel
import ie.bookanything.support.jsonOf
import ie.bookanything.support.runTask
import ie.bookanything.support.s
import ie.bookanything.support.testBusiness
import ie.bookanything.support.unique
import ie.bookanything.support.withApp
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.JsonObject
import java.time.Instant
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/**
 * The job queue delivers (docs/architecture.md section 8): failed jobs back off and finally fail, concurrent workers
 * never run a job twice (SKIP LOCKED), notifications exist exactly when the change that caused them committed (the
 * outbox), and booking reminders follow the booking when it moves or is cancelled.
 */
class JobDeliveryTest {
    private val salon = testBusiness("Outbox Salon") {
        val kim = person("Kim")
        service("Cut", 60) { needs("Stylist", kim) }
        service("Colour", 60) { price(5000); needs("Stylist", kim) }
    }

    private fun jobRow(id: UUID): String = Fixtures.sqlAll(
        "SELECT status || ' ' || attempts || ' ' || round(extract(epoch FROM run_at - now()))::int FROM jobs WHERE id = ?", id,
    ).single()

    private fun insertJob(kind: String, maxAttempts: Int = 8): UUID = Fixtures.sqlOne(
        "INSERT INTO jobs (kind, payload, max_attempts) VALUES (?, '{}'::jsonb, ?) RETURNING id", kind, maxAttempts,
    ) { it.getObject(1) as UUID }!!

    @Test
    fun `a failing job backs off 10, 20, 40 seconds and so on up to an hour, and fails for good after its last attempt`() {
        val env = TestEnv()
        val kind = unique("no_handler")
        val id = insertJob(kind, maxAttempts = 3)
        val worker = JobWorker(env.ctx)
        // After each failed attempt: "status attempts seconds-until-next-run".
        for (expected in listOf("pending 1 10", "pending 2 20", "failed 3 40")) {
            Fixtures.sql("UPDATE jobs SET run_at = now() WHERE id = ?", id)
            worker.drain()
            assertEquals(expected, jobRow(id))
        }
        assertTrue(Fixtures.sqlAll("SELECT last_error FROM jobs WHERE id = ?", id).single().contains("No handler for job kind $kind"))
        Fixtures.sql("UPDATE jobs SET run_at = now() WHERE id = ?", id)
        worker.drain()
        assertEquals("failed 3", jobRow(id).substringBeforeLast(' '), "a failed job is never claimed again")

        // The delay doubles per attempt and is capped at an hour.
        for ((attempts, seconds) in listOf(4 to 80, 9 to 2560, 10 to 3600, 30 to 3600)) {
            val job = insertJob(unique("no_handler"), maxAttempts = 50)
            env.db.txBlocking { JobQueue.fail(it, Job(job, "x", JsonObject(emptyMap()), attempts, 50), "boom") }
            assertEquals("pending 0 $seconds", jobRow(job), "after attempt $attempts")
        }
    }

    @Test
    fun `two workers draining at once never run the same job twice`() {
        val env = TestEnv()
        withApp(env) { api ->
            val shop = api.createBusiness(salon)
            val booking = Money.book(api, shop, "Cut", "2026-10-07T10:00:00+01:00", email = "${unique("once")}@example.test")
            val businessId = UUID.fromString(shop.id)
            val bookingId = UUID.fromString(Money.bookingId(booking))
            env.db.txBlocking { conn -> repeat(40) { Notify.booking(conn, NotificationKind.BOOKING_REMINDER, businessId, bookingId) } }
            val jobIds = Fixtures.sqlAll(
                "SELECT id::text FROM jobs WHERE payload->>'bookingId' = ?::text AND payload->>'kind' = 'booking_reminder'",
                bookingId.toString(),
            ).toSet()
            assertEquals(40, jobIds.size)

            val workers = List(2) { JobWorker(env.ctx, batchSize = 3) }
            inParallel(2) { workers[it].drain() }

            val runs = env.email.sent.mapNotNull { it.idempotencyKey?.substringBefore(':') }.filter { it in jobIds }
            assertEquals(40, runs.size, "every job ran")
            assertEquals(runs.size, runs.toSet().size, "no job ran twice")
            val states = Fixtures.sqlAll(
                "SELECT status || ' ' || attempts FROM jobs WHERE payload->>'bookingId' = ?::text AND payload->>'kind' = 'booking_reminder'",
                bookingId.toString(),
            )
            assertEquals(List(40) { "done 1" }, states)
        }
    }

    @Test
    fun `a booking's notifications are enqueued in its own transaction and vanish when it rolls back`() {
        val env = TestEnv()
        withApp(env) { api ->
            val shop = api.createBusiness(salon)
            val businessId = UUID.fromString(shop.id)
            val business = env.db.txBlocking { BusinessRepository.findById(it, businessId)!! }
            fun command(email: String, time: String) = CreateCommand(
                serviceId = UUID.fromString(shop.service("Cut")), optionId = null, addonIds = emptyList(), groupId = null,
                selectedResourceId = null, forcedResourceIds = null, start = Instant.parse(time),
                customer = CustomerSpec(name = "Out Box", email = email), answers = emptyMap(), customerNotes = null, internalNotes = null,
                source = BookingSource.PUBLIC, mode = AvailabilityMode.PUBLIC, payment = PaymentChoice.AUTO, notifyCustomer = true,
                idempotencyKey = null, actor = Actor.GUEST, user = null, returnUrl = null,
            )
            fun notifications(bookingId: String) =
                Fixtures.sqlAll(
                    "SELECT payload->>'kind' FROM jobs WHERE payload->>'bookingId' = ?::text ORDER BY payload->>'kind'", bookingId,
                )

            // Committed: invisible to everyone else until the commit, then both emails are queued.
            var seenOutside = listOf("not checked")
            val created = env.db.txBlocking(businessId) { conn ->
                val cmd = command("${unique("kept")}@example.test", "2026-10-07T09:00:00Z")
                env.ctx.booking.engine.create(conn, business, cmd, env.clock.instant()).booking
                    .also { seenOutside = notifications(it.id.toString()) }
            }
            assertEquals(emptyList(), seenOutside)
            assertEquals(listOf("booking_confirmed", "new_booking_for_business"), notifications(created.id.toString()))

            // Rolled back after the booking was made: no booking and no email.
            fun businessJobs() = Fixtures.sqlAll("SELECT id::text FROM jobs WHERE payload->>'businessId' = ?::text", shop.id).size
            val jobsBefore = businessJobs()
            val email = "${unique("rolled.back")}@example.test"
            assertFailsWith<IllegalStateException> {
                env.db.txBlocking(businessId) { conn ->
                    env.ctx.booking.engine.create(conn, business, command(email, "2026-10-07T11:00:00Z"), env.clock.instant())
                    error("something later in the request failed")
                }
            }
            val rolledBack =
                Fixtures.sqlAll("SELECT b.id::text FROM bookings b JOIN customers c ON c.id = b.customer_id WHERE c.email = ?", email)
            assertEquals(emptyList(), rolledBack)
            assertEquals(jobsBefore, businessJobs())

            // The same for a cancellation: rolled back, the booking stays confirmed and nobody is told it was cancelled.
            assertFailsWith<IllegalStateException> {
                env.db.txBlocking(businessId) { conn ->
                    env.ctx.booking.lifecycle.cancel(
                        conn, business, created.id, Cancellation(CancelActor.BUSINESS, Actor.SYSTEM, "test"), env.clock.instant(),
                    )
                    error("rolled back")
                }
            }
            assertEquals(listOf("booking_confirmed", "new_booking_for_business"), notifications(created.id.toString()))
            assertEquals("confirmed", Fixtures.sqlAll("SELECT status::text FROM bookings WHERE id = ?", created.id.toString()).single())
        }
    }

    @Test
    fun `a reminder queued before the booking was cancelled is not sent`() {
        val env = TestEnv()
        withApp(env) { api ->
            val shop = api.createBusiness(salon)
            val worker = JobWorker(env.ctx)
            val email = "${unique("late.cancel")}@example.test"
            val booking = Money.book(api, shop, "Cut", "2026-10-06T09:00:00+01:00", email = email)
            // The reminder is queued (say the email provider is down and the job is retrying), then the customer cancels.
            assertEquals(1, worker.periodicTasks.single { it.name == "send-reminders" }.run(env.ctx))
            assertStatus(HttpStatusCode.OK, api.post("/v1/public/manage/${booking.s("manageToken")}/cancel"))
            worker.drain()
            assertEquals(1, env.email.sent.count { it.to == email && it.template == "booking_cancelled" })
            assertEquals(0, env.email.sent.count { it.to == email && it.template == "booking_reminder" })
        }
    }

    @Test
    fun `a booking made or moved within a day gets its confirmation and no reminder minutes later`() {
        val env = TestEnv()
        withApp(env) { api ->
            val shop = api.createBusiness(salon)
            val worker = JobWorker(env.ctx)
            fun reminders(email: String) = env.email.sent.count { it.to == email && it.template == "booking_reminder" }
            val sameDay = "${unique("same.day")}@example.test"
            val movedIn = "${unique("moved.in")}@example.test"
            val quietMove = "${unique("quiet.move")}@example.test"
            Money.book(api, shop, "Cut", "2026-10-05T14:00:00+01:00", email = sameDay) // in five hours
            val later = Money.book(api, shop, "Cut", "2026-10-08T10:00:00+01:00", email = movedIn)
            val quiet = Money.book(api, shop, "Cut", "2026-10-08T12:00:00+01:00", email = quietMove)
            suspend fun move(booking: kotlinx.serialization.json.JsonObject, start: String, notify: Boolean) = assertStatus(
                HttpStatusCode.OK,
                api.post(
                    "${shop.base}/bookings/${Money.bookingId(booking)}/reschedule", jsonOf("start" to start, "notifyCustomer" to notify),
                    shop.owner.token,
                ),
            )
            move(later, "2026-10-05T15:00:00+01:00", notify = true) // the customer is told the new time
            move(quiet, "2026-10-05T16:00:00+01:00", notify = false) // not told: the reminder still tells them
            worker.runTask(env.ctx, "send-reminders")
            worker.runTask(env.ctx, "send-reminders")
            assertEquals(1, env.email.sent.count { it.to == sameDay && it.template == "booking_confirmed" })
            assertEquals(0, reminders(sameDay))
            assertEquals(1, env.email.sent.count { it.to == movedIn && it.template == "booking_rescheduled" })
            assertEquals(0, reminders(movedIn))
            assertEquals(1, reminders(quietMove))
        }
    }

    @Test
    fun `reminders are sent 24 hours ahead, again after a move, and never for cancelled or unpaid bookings`() {
        val env = TestEnv()
        withApp(env) { api ->
            val shop = api.createBusiness(salon)
            val worker = JobWorker(env.ctx)
            suspend fun book(service: String, start: String, email: String) = Money.book(api, shop, service, start, email = email)
            fun reminders(email: String) = env.email.sent.filter { it.to == email && it.template == "booking_reminder" }
            fun tick() = worker.runTask(env.ctx, "send-reminders")

            val moved = "${unique("moved")}@example.test"
            val cancelled = "${unique("cancelled")}@example.test"
            val unpaid = "${unique("unpaid")}@example.test"
            val booking = book("Cut", "2026-10-06T09:00:00+01:00", moved) // tomorrow morning: due now
            val gone = book("Cut", "2026-10-06T11:00:00+01:00", cancelled)
            book("Colour", "2026-10-06T13:00:00+01:00", unpaid) // held for payment
            assertStatus(HttpStatusCode.OK, api.post("/v1/public/manage/${gone.s("manageToken")}/cancel"))
            tick()
            tick()
            assertEquals(1, reminders(moved).size)
            assertTrue(reminders(moved).single().text.contains("Tuesday 6 October 2026 at 09:00"), reminders(moved).single().text)
            assertEquals(0, reminders(cancelled).size)
            assertEquals(0, reminders(unpaid).size)

            // Moved to Friday 10:00: not due yet, then due exactly 24 hours before the new time.
            assertStatus(
                HttpStatusCode.OK,
                api.post(
                    "${shop.base}/bookings/${Money.bookingId(booking)}/reschedule", jsonOf("start" to "2026-10-09T10:00:00+01:00"),
                    shop.owner.token,
                ),
            )
            tick()
            assertEquals(1, reminders(moved).size)
            env.clock.instant = Instant.parse("2026-10-08T08:59:00Z")
            tick()
            assertEquals(1, reminders(moved).size)
            env.clock.instant = Instant.parse("2026-10-08T09:00:00Z")
            tick()
            tick()
            assertEquals(2, reminders(moved).size)
            assertTrue(reminders(moved).last().text.contains("Friday 9 October 2026 at 10:00"), reminders(moved).last().text)
        }
    }
}
