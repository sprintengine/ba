package ie.bookanything.support

import kotlinx.serialization.json.Json
import java.io.File
import kotlin.test.assertEquals
import kotlin.test.fail

/**
 * Golden files for JSON that must not change by accident (tool schemas sit in a cached prompt prefix or are seen by MCP
 * clients). The file under `src/test/resources/snapshots/` is pretty-printed for review; the check compares the compact
 * form byte for byte, so key order and number formatting count. Run with `UPDATE_SNAPSHOTS=true` to rewrite the files
 * after a deliberate change, then review the diff.
 */
object Snapshots {
    private val pretty = Json { prettyPrint = true }

    fun assertMatches(name: String, compactJson: String) {
        val actual = Json.parseToJsonElement(compactJson)
        if (System.getenv("UPDATE_SNAPSHOTS") == "true") {
            File("src/test/resources/snapshots/$name.json").writeText(pretty.encodeToString(actual) + "\n")
            return
        }
        val stored = Snapshots::class.java.getResource("/snapshots/$name.json")?.readText()
            ?: fail("No snapshot $name.json: run the test with UPDATE_SNAPSHOTS=true and review the new file")
        assertEquals(Json.encodeToString(Json.parseToJsonElement(stored)), compactJson, "$name.json changed")
    }
}
