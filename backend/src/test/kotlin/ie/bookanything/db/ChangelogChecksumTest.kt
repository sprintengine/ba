package ie.bookanything.db

import ie.bookanything.config.DatabaseConfig
import ie.bookanything.support.Fixtures
import ie.bookanything.support.TestDatabase
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFails

/**
 * Developers' databases keep the checksum of every changeset they ran. When a released changeset's text changes (a
 * reworded comment), the changeset lists its previous checksum with `--validCheckSum` so those databases still migrate.
 */
class ChangelogChecksumTest {
    /** Changesets edited after they ran, with the checksum databases migrated before the edit hold. */
    private val previousChecksums = mapOf("0010a-ai-usage-ledger" to "9:ee90921ace09d52fbace684a748776d8")

    @Test
    fun `a database migrated before a changeset was edited still validates, and an unknown checksum does not`() {
        withFreshDatabase { db ->
            Migrations.migrate(db.dataSource)
            fun checksum(id: String, value: String) =
                assertEquals(1, db.txBlocking { it.update("UPDATE databasechangelog SET md5sum = ? WHERE id = ?", value, id) }, id)
            previousChecksums.forEach { (id, previous) ->
                checksum(id, "9:00000000000000000000000000000000")
                assertFails("$id: a checksum the changelog does not know fails validation") { Migrations.migrate(db.dataSource) }
                checksum(id, previous)
                Migrations.migrate(db.dataSource)
            }
        }
    }
}

/** Creates an empty database on the test Postgres server, runs [block] against it and drops it afterwards. */
internal fun withFreshDatabase(block: (Db) -> Unit) {
    val name = "fresh_db_" + UUID.randomUUID().toString().replace("-", "").take(12)
    Fixtures.sql("CREATE DATABASE $name")
    try {
        val url = TestDatabase.jdbcUrl.replace(Regex("/[^/?]+(\\?|$)")) { "/$name${it.groupValues[1]}" }
        createDataSource(DatabaseConfig(url, TestDatabase.username, TestDatabase.password, 2)).use { ds -> block(Db(ds)) }
    } finally {
        Fixtures.sql("DROP DATABASE IF EXISTS $name WITH (FORCE)")
    }
}
