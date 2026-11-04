package ie.bookanything.jobs

import ie.bookanything.support.DEFAULT_NOW
import ie.bookanything.support.Fixtures
import ie.bookanything.support.TestEnv
import ie.bookanything.support.runTask
import ie.bookanything.support.unique
import ie.bookanything.support.withApp
import java.sql.Timestamp
import java.time.Duration
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals

class RetentionTest {
    private fun ago(days: Long, hours: Long = 0): Timestamp = Timestamp.from(DEFAULT_NOW.minus(Duration.ofDays(days).plusHours(hours)))

    private fun left(sql: String, vararg keys: String): List<String> =
        Fixtures.sqlAll("$sql ORDER BY 1", *keys).toList()

    @Test
    fun `the daily purge deletes expired OAuth codes and tokens, old applied events and old failed jobs`() {
        val env = TestEnv()
        withApp(env) { _ ->
            val key = unique("purge")
            // OAuth: a grant with codes and tokens either side of the cutoff (expired more than a day ago).
            val userId =
                Fixtures.sqlOne("INSERT INTO users (clerk_user_id) VALUES (?) RETURNING id", "user_$key") { it.getObject(1) as UUID }!!
            Fixtures.sql(
                "INSERT INTO oauth_clients (client_id, kind, client_name, redirect_uris) VALUES (?, 'dynamic', 'Purge', '{https://a.test/cb}')",
                "client_$key",
            )
            val grantId = Fixtures.sqlOne(
                "INSERT INTO oauth_grants (user_id, client_id, scopes, resource, consented_redirect_uri, consented_at) " +
                    "VALUES (?, ?, '{bookings:read}', 'https://api.test/mcp', 'https://a.test/cb', now()) RETURNING id",
                userId, "client_$key",
            ) { it.getObject(1) as UUID }!!
            fun code(name: String, expires: Timestamp) = Fixtures.sql(
                "INSERT INTO oauth_codes (code_hash, grant_id, redirect_uri, code_challenge, scopes, resource, expires_at) " +
                    "VALUES (?, ?, 'https://a.test/cb', 'c', '{bookings:read}', 'r', ?)",
                "$key-$name", grantId, expires,
            )
            fun token(name: String, kind: String, expires: Timestamp, used: Timestamp? = null) = Fixtures.sql(
                "INSERT INTO oauth_tokens (token_hash, grant_id, kind, scopes, resource, expires_at, used_at) " +
                    "VALUES (?, ?, ?, '{bookings:read}', 'r', ?, ?)",
                "$key-$name", grantId, kind, expires, used,
            )
            code("code-old", ago(2))
            code("code-recent", ago(0, 1))
            token("access-old", "access", ago(1, 1))
            token("access-recent", "access", ago(0, 23))
            token("refresh-used", "refresh", Timestamp.from(DEFAULT_NOW.plus(Duration.ofDays(20))), used = ago(5))
            token("refresh-used-expired", "refresh", ago(3), used = ago(40))

            // Webhook events: applied ones go after 90 days, unapplied ones stay.
            fun event(name: String, received: Timestamp, processed: Boolean) = Fixtures.sql(
                "INSERT INTO provider_events (id, provider, type, payload, received_at, processed_at) VALUES (?, 'stripe', 't', '{}', ?, " +
                    "CASE WHEN ? THEN ?::timestamptz END)",
                "$key-$name", received, processed, received,
            )
            event("event-old", ago(91), processed = true)
            event("event-recent", ago(89), processed = true)
            event("event-old-unapplied", ago(200), processed = false)

            // Jobs: failed ones go after 90 days; pending ones never.
            fun job(name: String, status: String, created: Timestamp) = Fixtures.sql(
                "INSERT INTO jobs (kind, payload, status, created_at) VALUES ('purge_test', jsonb_build_object('key', ?::text), ?::job_status, ?)",
                "$key-$name", status, created,
            )
            job("failed-old", "failed", ago(91))
            job("failed-recent", "failed", ago(30))
            job("pending-old", "pending", ago(120))

            // Batches of one: every table needs several rounds.
            val deleted = Retention.purge(env.db, env.clock.instant(), batch = 1)
            assertEquals(true, deleted >= 5, "deleted $deleted")

            assertEquals(listOf("$key-code-recent"), left("SELECT code_hash FROM oauth_codes WHERE grant_id = ?::uuid", grantId.toString()))
            assertEquals(
                listOf("$key-access-recent", "$key-refresh-used"),
                left("SELECT token_hash FROM oauth_tokens WHERE grant_id = ?::uuid", grantId.toString()),
            )
            assertEquals(
                listOf("$key-event-old-unapplied", "$key-event-recent"),
                left("SELECT id FROM provider_events WHERE id LIKE ?", "$key-%"),
            )
            assertEquals(
                listOf("$key-failed-recent", "$key-pending-old"),
                left("SELECT payload->>'key' FROM jobs WHERE kind = 'purge_test' AND payload->>'key' LIKE ?", "$key-%"),
            )

            // It is the worker's daily task.
            event("event-old-2", ago(95), processed = true)
            val worker = JobWorker(env.ctx)
            assertEquals(Duration.ofDays(1), worker.periodicTasks.single { it.name == "purge-expired" }.every)
            worker.runTask(env.ctx, "purge-expired")
            assertEquals(emptyList(), left("SELECT id FROM provider_events WHERE id = ?", "$key-event-old-2"))
        }
    }
}
