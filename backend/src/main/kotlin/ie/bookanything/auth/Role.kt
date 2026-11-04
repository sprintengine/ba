package ie.bookanything.auth

/** A member's role in a business; roles rank STAFF < ADMIN < OWNER. */
enum class Role(val rank: Int) {
    STAFF(1), ADMIN(2), OWNER(3);

    val value: String get() = name.lowercase()
    fun atLeast(other: Role) = rank >= other.rank

    companion object {
        fun parse(raw: String): Role = valueOf(raw.uppercase())
        val VALUES = setOf("owner", "admin", "staff")
    }
}
