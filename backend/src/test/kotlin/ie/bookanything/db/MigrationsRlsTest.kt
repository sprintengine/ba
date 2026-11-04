package ie.bookanything.db

import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Tenant isolation is a property of the schema, so it is checked on the schema: every Liquibase changeset is applied to
 * a fresh, empty database, then the catalog must show row-level security (enabled and forced, with a policy on
 * `app.business_id`) on every table that has a `business_id` column. New tables are covered without touching this test.
 */
class MigrationsRlsTest {
    /** Tables with a `business_id` column that deliberately have no tenant policy, and why. Keep it short. */
    private val allowList: Map<String, String> = emptyMap()

    private data class TableSecurity(
        val table: String, val enabled: Boolean, val forced: Boolean, val tenantPolicies: Int, val allPolicies: Int,
    )

    @Test
    fun `every table with a business_id has forced row-level security with a tenant policy, on a freshly migrated database`() {
        withFreshDatabase { db ->
            Migrations.migrate(db.dataSource)
            val tables = db.txBlocking { conn ->
                conn.query(
                    """
                    SELECT c.relname AS name, c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced,
                        (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid AND p.polcmd = '*'
                            AND pg_get_expr(p.polqual, p.polrelid) LIKE '%business_id%'
                            AND pg_get_expr(p.polqual, p.polrelid) LIKE '%current_setting(''app.business_id''%')::int AS tenant,
                        (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid)::int AS policies
                    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
                      AND EXISTS (SELECT 1 FROM pg_attribute a
                                  WHERE a.attrelid = c.oid AND a.attname = 'business_id' AND NOT a.attisdropped)
                    ORDER BY c.relname
                    """.trimIndent(),
                ) {
                    TableSecurity(
                        it.getString("name"), it.getBoolean("enabled"), it.getBoolean("forced"), it.getInt("tenant"), it.getInt("policies"),
                    )
                }
            }
            assertTrue(tables.size >= 25, "the catalog query found only ${tables.map { it.table }}")
            assertTrue(tables.any { it.table == "bookings" } && tables.any { it.table == "payments" }, tables.toString())
            assertEquals(emptyList(), allowList.keys.filter { name -> tables.none { it.table == name } }, "stale allow-list entries")

            val unprotected = tables.filter { it.table !in allowList }
                .filterNot { it.enabled && it.forced && it.tenantPolicies >= 1 && it.tenantPolicies == it.allPolicies }
            assertEquals(emptyList(), unprotected, "tables with business_id but without forced tenant isolation")

            // The setting reads '' after a scoped transaction on the same connection: the uuid cast must not see it.
            val castingEmpty = db.txBlocking { conn ->
                conn.query(
                    "SELECT c.relname FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid " +
                        "WHERE pg_get_expr(p.polqual, p.polrelid) NOT LIKE '%NULLIF(current_setting(''app.business_id''%' ORDER BY 1",
                ) { it.getString(1) }
            }
            assertEquals(emptyList(), castingEmpty, "tenant policies that cast app.business_id without nullif(..., '')")

            emailLogIsolated(db)

            // Applying the changelog again is a no-op (nothing pending, no checksum errors).
            val applied = db.txBlocking { it.queryOne("SELECT count(*) FROM databasechangelog") { r -> r.getInt(1) } }
            Migrations.migrate(db.dataSource)
            assertEquals(applied, db.txBlocking { it.queryOne("SELECT count(*) FROM databasechangelog") { r -> r.getInt(1) } })
        }
    }

    /**
     * The email log (the last table to get its policy, 0014) seen by a non-superuser role scoped to one business, then
     * unscoped on the same connection.
     */
    private fun emailLogIsolated(db: Db) {
        val role = "rls_probe_" + UUID.randomUUID().toString().replace("-", "").take(8)
        val (a, b) = List(2) { UUID.randomUUID() }
        db.txBlocking { conn ->
            for (id in listOf(a, b)) {
                conn.update("INSERT INTO businesses (id, slug, name) VALUES (?, ?, 'Probe')", id, "probe-$id")
                conn.update(
                    "INSERT INTO email_log (business_id, to_address, subject, template, status) " +
                        "VALUES (?, 'x@example.test', 's', 't', 'sent')",
                    id,
                )
            }
            conn.update("CREATE ROLE $role NOLOGIN")
            conn.update("GRANT SELECT ON email_log TO $role")
        }
        try {
            db.dataSource.connection.use { conn ->
                conn.autoCommit = false
                try {
                    conn.update("SET LOCAL ROLE $role")
                    conn.queryOne("SELECT set_config('app.business_id', ?, true)", a.toString()) { }
                    assertEquals(listOf(a), conn.query("SELECT business_id FROM email_log") { it.getObject(1) as UUID })
                    conn.commit()
                    // Regression: on the same connection the setting now reads '', and the policy's uuid cast failed
                    // ("invalid input syntax for type uuid") for every unscoped query.
                    conn.update("SET LOCAL ROLE $role")
                    assertEquals(setOf(a, b), conn.query("SELECT business_id FROM email_log") { it.getObject(1) as UUID }.toSet())
                    conn.commit()
                } finally {
                    conn.rollback()
                    conn.autoCommit = true
                }
            }
        } finally {
            db.txBlocking { conn ->
                conn.update("DROP OWNED BY $role")
                conn.update("DROP ROLE $role")
            }
        }
    }
}
