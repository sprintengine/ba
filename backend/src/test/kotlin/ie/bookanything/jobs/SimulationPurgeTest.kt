package ie.bookanything.jobs

import ie.bookanything.config.AppConfig
import ie.bookanything.config.SimulationAuthConfig
import ie.bookanything.support.Api
import ie.bookanything.support.Clinic
import ie.bookanything.support.CountingDataSource
import ie.bookanything.support.Fixtures
import ie.bookanything.support.SecurityFixtures
import ie.bookanything.support.SecurityFixtures.dublin
import ie.bookanything.support.SimulationFixtures
import ie.bookanything.support.TestConfig
import ie.bookanything.support.TestDatabase
import ie.bookanything.support.TestEnv
import ie.bookanything.support.TestUser
import ie.bookanything.support.assertStatus
import ie.bookanything.support.createBusiness
import ie.bookanything.support.devToken
import ie.bookanything.support.testBusiness
import ie.bookanything.support.unique
import ie.bookanything.support.withApp
import io.ktor.http.HttpStatusCode
import java.io.ByteArrayOutputStream
import java.io.PrintStream
import java.time.Duration
import java.time.Instant
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.test.fail

/**
 * `backend purge-simulation` deletes the simulation's old businesses and users, and nothing that might be anyone
 * else's: not a business with a real member, a real user's business with a `sim-` slug, a simulated business that is
 * still young, nor a user who has only one of the two marks of a simulation identity. Refused in production.
 */
class SimulationPurgeTest {
    private val env = TestEnv(config = TestConfig.config().copy(simulationAuth = SimulationAuthConfig(SimulationFixtures.SECRET)))
    private val tokens get() = env.ctx.simulation!!

    private fun setup(slug: String) = testBusiness("Sim Business") { service("Visit", 30) { needs("Staff", person("Ana")) } }
        .copy(slug = slug)

    private fun simSlug() = "sim-${unique("purge").lowercase()}"

    private fun age(table: String, id: String) =
        Fixtures.sql("UPDATE $table SET created_at = now() - interval '30 days' WHERE id = ?", UUID.fromString(id))

    private fun userId(sub: String): String? =
        Fixtures.sqlOne("SELECT id::text FROM users WHERE clerk_user_id = ?", sub) { it.getString(1) }

    private fun countIn(table: String, businessId: String): Int? =
        Fixtures.sqlOne("SELECT count(*) FROM $table WHERE business_id = ?", UUID.fromString(businessId)) { it.getInt(1) }
    private fun exists(table: String, id: String) =
        Fixtures.sqlOne("SELECT 1 FROM $table WHERE id = ?", UUID.fromString(id)) { true } == true

    private suspend fun Api.signIn(user: TestUser) = assertStatus(HttpStatusCode.OK, get("/v1/me", user.token))

    private class World(
        val purged: List<Clinic>, val kept: Map<String, Clinic>, val goneUsers: List<String>, val keptUsers: Map<String, String>,
    )

    /** Builds what the purge must delete and what it must keep, aged 30 days unless the case is about age. */
    private suspend fun Api.world(): World {
        fun simUser(prefix: String): Pair<String, TestUser> {
            val (sub, email) = SimulationFixtures.identity(prefix)
            return sub to TestUser(tokens.bearer(sub, email, "Sim $prefix"), email)
        }
        val (ownerSub, owner) = simUser("owner")
        val (customerSub, customer) = simUser("customer")
        val (lonelySub, lonely) = simUser("lonely")
        val (busySub, busy) = simUser("busy")
        val (youngSub, young) = simUser("young")
        listOf(customer, lonely, young).forEach { signIn(it) }

        val old = createBusiness(setup(simSlug()), owner)
        SecurityFixtures.book(this, old, "Visit", dublin(env.clock, 2, "10:00"), email = customer.email, token = customer.token)
        SecurityFixtures.book(this, old, "Visit", dublin(env.clock, 2, "11:00"))
        Fixtures.sql(
            "INSERT INTO email_log (business_id, to_address, subject, template, status) VALUES (?, ?, 'Hi', 'booking_confirmed', 'skipped')",
            UUID.fromString(old.id), customer.email,
        )

        // Kept: still young; a real owner with a sim- slug; a real member; a simulated owner but not a sim- slug.
        val youngShop = createBusiness(setup(simSlug()), simUser("youngowner").second)
        val realOwned = createBusiness(setup(simSlug()))
        val mixed = createBusiness(setup(simSlug()), simUser("mixedowner").second)
        val realMember = TestUser.create("member")
        signIn(realMember)
        Fixtures.sql(
            "INSERT INTO business_members (business_id, user_id, role, status) VALUES (?, ?, 'staff', 'active')",
            UUID.fromString(mixed.id), UUID.fromString(userId("dev_" + realMember.email.substringBefore('@'))),
        )
        val unslugged = createBusiness(setup(unique("purge-plain").lowercase()), busy)

        // A real (dev) subject with an address on the simulation's domain: one mark is not enough.
        val impostorSub = "dev_${unique("impostor").lowercase()}"
        signIn(TestUser(devToken(impostorSub, "${impostorSub.removePrefix("dev_")}@sim.bookanything.test"), "x"))

        listOf(old, realOwned, mixed, unslugged).forEach { age("businesses", it.id) }
        listOf(ownerSub, customerSub, lonelySub, busySub, impostorSub).forEach { age("users", userId(it)!!) }
        return World(
            purged = listOf(old),
            kept = mapOf("young" to youngShop, "real owner" to realOwned, "real member" to mixed, "no sim- slug" to unslugged),
            goneUsers = listOf(ownerSub, customerSub, lonelySub),
            keptUsers = mapOf("member of a kept business" to busySub, "young" to youngSub, "dev subject" to impostorSub),
        )
    }

    @Test
    fun `it deletes old simulated businesses and users, and only those`() = withApp(env) { api ->
        val world = api.world()
        val cutoff = Instant.now().minus(Duration.ofDays(7))
        assertEquals(2, countIn("bookings", world.purged[0].id))
        assertEquals(1, countIn("email_log", world.purged[0].id))

        val dry = SimulationPurge.purge(env.db, cutoff, dryRun = true)
        assertEquals(SimulationPurge.Result(businesses = 1, users = 3), dry)
        assertTrue(world.purged.all { exists("businesses", it.id) }, "a dry run deletes nothing")
        assertTrue(world.goneUsers.all { userId(it) != null })

        assertEquals(dry, SimulationPurge.purge(env.db, cutoff))
        world.purged.forEach { shop ->
            assertTrue(!exists("businesses", shop.id))
            listOf("bookings", "customers", "email_log", "business_members").forEach { assertEquals(0, countIn(it, shop.id), it) }
        }
        world.kept.forEach { (case, shop) -> assertTrue(exists("businesses", shop.id), case) }
        world.goneUsers.forEach { assertEquals(null, userId(it), it) }
        world.keptUsers.forEach { (case, sub) -> if (userId(sub) == null) fail("$case was deleted") }
        assertEquals(SimulationPurge.Result(0, 0), SimulationPurge.purge(env.db, cutoff), "nothing left to do")
    }

    private fun run(config: AppConfig, vararg args: String): Triple<Int, String, String> {
        val out = ByteArrayOutputStream()
        val err = ByteArrayOutputStream()
        var opened = false
        val code = SimulationPurge.command(config, args.toList(), PrintStream(out), PrintStream(err)) {
            opened = true
            CountingDataSource(TestDatabase.dataSource) // Not closeable: the command must not close the shared pool.
        }
        if (code != 0) assertTrue(!opened, "a refused command never opens the database")
        return Triple(code, out.toString(), err.toString())
    }

    @Test
    fun `the command is refused in production and takes a number of days and a dry run`() {
        val production = AppConfig.fromEnvironment(
            mapOf(
                "DATABASE_URL" to "jdbc:postgresql://db.internal/bookanything", "TOKEN_SECRET" to "a-very-long-production-secret",
                "CLERK_ISSUER" to "https://clerk.bookanything.test", "CLERK_AUTHORIZED_PARTIES" to "https://bookanything.ie",
            ),
        )
        val (refused, _, why) = run(production, "--dry-run")
        assertEquals(2, refused)
        assertTrue("refused in production" in why, why)

        val staging = SimulationFixtures.stagingConfig(simulation = null)
        val (code, out, _) = run(staging, "--older-than-days", "3650", "--dry-run")
        assertEquals(0, code)
        assertTrue(out.startsWith("purge-simulation: would delete 0 businesses and 0 users created before "), out)
        listOf(listOf("--older-than-days"), listOf("--older-than-days", "0"), listOf("--older-than-days", "x"), listOf("--everything"))
            .forEach { args -> assertEquals(2, run(staging, *args.toTypedArray()).first, args.toString()) }
    }
}
