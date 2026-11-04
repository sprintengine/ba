package ie.bookanything.business

import java.sql.Connection
import java.util.UUID

object SlugService {
    /** First free variant of [base]: base, base-2, base-3, … */
    fun suggest(conn: Connection, base: String, exceptId: UUID? = null): String {
        val root = base.take(45).trim('-')
        if (ReservedSlugs.problem(root) == null && !BusinessRepository.slugExists(conn, root, exceptId)) return root
        for (i in 2..200) {
            val candidate = "$root-$i"
            if (ReservedSlugs.problem(candidate) == null && !BusinessRepository.slugExists(conn, candidate, exceptId)) return candidate
        }
        return "$root-${UUID.randomUUID().toString().take(6)}"
    }
}
