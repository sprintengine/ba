package ie.bookanything.db

import kotlin.test.Test
import kotlin.test.assertEquals

class SqlTextTest {
    @Test
    fun `a contains pattern escapes LIKE wildcards and the escape character`() {
        assertEquals("%robin%", likeContains("robin"))
        assertEquals("%50\\% off\\_now\\\\%", likeContains("50% off_now\\"))
    }
}
