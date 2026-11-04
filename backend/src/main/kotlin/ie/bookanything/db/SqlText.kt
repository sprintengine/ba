package ie.bookanything.db

// Pieces of SQL text built from code, for what a bind parameter can't express or the planner must see.

/** A `LIKE` pattern matching values that contain [text] literally: `%`, `_` and `\` in it match only themselves. */
fun likeContains(text: String): String = "%" + text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"

private val ENUM_LABEL = Regex("[a-z_]+")

/**
 * `column IN ('a', 'b')` over fixed Postgres enum labels, inlined (not bound) so the planner sees the values. Only for
 * labels from code (an enum's `wire`), never input: anything but `[a-z_]` is refused.
 */
fun sqlIn(column: String, labels: Collection<String>): String {
    require(labels.isNotEmpty() && labels.all { ENUM_LABEL.matches(it) }) { "Not enum labels: $labels" }
    return labels.joinToString(", ", prefix = "$column IN (", postfix = ")") { "'$it'" }
}
