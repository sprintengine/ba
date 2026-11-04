package ie.bookanything.customers

import ie.bookanything.support.Fixtures
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.sOrNull
import ie.bookanything.support.withApp
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlin.test.Test
import kotlin.test.assertEquals

class CustomerListPagingTest {
    @Test
    fun `paging through customers returns each once, whatever lower-casing does to their names`() = withApp { api ->
        // Regression: the cursor carried Kotlin's lowercase() of the last name while the list ordered by Postgres's
        // lower(). They differ for some letters ("İ" is "i̇" in Kotlin, "i" in Postgres), so the next page could start
        // past rows that sort right after it: here "Ia", which sorts with "İa" as "ia" but after it by id, was skipped.
        val clinic = Fixtures.clinic(api)
        val names = listOf(
            "00000000-0000-4000-8000-000000000001" to "İa",
            "00000000-0000-4000-8000-000000000002" to "Ia",
            "00000000-0000-4000-8000-000000000003" to "İb",
            "00000000-0000-4000-8000-000000000004" to "ib",
            "00000000-0000-4000-8000-000000000005" to "ΟΔΟΣ",
            "00000000-0000-4000-8000-000000000006" to "οδοσ",
            "00000000-0000-4000-8000-000000000007" to "Straße",
            "00000000-0000-4000-8000-000000000008" to "STRASSE",
        )
        for ((id, name) in names) {
            Fixtures.sql("INSERT INTO customers (id, business_id, name) VALUES (?::uuid, ?::uuid, ?)", id, clinic.id, name)
        }
        val t = clinic.owner.token
        val all = api.get("${clinic.base}/customers?limit=100", t).obj()["items"]!!.jsonArray.map { it.jsonObject.s("id") }
        check(names.all { (id) -> id in all }) { all }

        val paged = mutableListOf<String>()
        var cursor: String? = null
        do {
            val page = api.get("${clinic.base}/customers?limit=1" + cursor?.let { "&cursor=$it" }.orEmpty(), t).obj()
            paged += page["items"]!!.jsonArray.map { it.jsonObject.s("id") }
            cursor = page.sOrNull("nextCursor")
        } while (cursor != null && paged.size <= all.size)

        assertEquals(all, paged)
    }
}
