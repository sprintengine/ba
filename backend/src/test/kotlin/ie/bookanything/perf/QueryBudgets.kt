package ie.bookanything.perf

/**
 * SQL statements each hot endpoint may run per request: every statement executed through JDBC counts, including
 * transaction setup (`set_config` for row-level security) but not BEGIN/COMMIT. [QueryBudgetTest] fails when an
 * endpoint runs more statements than its budget (a new query, or a query per row) and also when it runs fewer, so the
 * budget is always the real number.
 *
 * Changing a budget is a deliberate decision: when a change adds a statement on purpose, raise the budget in the same
 * commit and say why in the message; when it saves some, lower it. The failure message lists the statements run.
 * Endpoints whose cost must not grow with the data (lists, search) are also checked against a bigger data set in
 * [QueryBudgetTest], so a query per booking or per listing fails even if the budget is raised.
 */
object QueryBudgets {
    val BUDGETS: Map<String, Int> = mapOf(
        // Public site and booking flow (anonymous).
        "public business" to 6,
        "public business, default site" to 10,
        "public services" to 8,
        // Availability and booking read the business's release schedules (one statement, section 21).
        "public availability" to 13,
        // A Free business's booking also takes its monthly-count lock, so bookings at once count one after another.
        "public booking" to 29,
        "manage booking" to 3,
        "templates" to 0,
        // Marketplace (/explore).
        "marketplace search" to 13,
        "marketplace search, cached times" to 7,
        "marketplace meta" to 1,
        // Signed in.
        "me" to 4,
        "me bookings" to 6,
        "dashboard business" to 5,
        "dashboard overview" to 11,
        "dashboard bookings" to 6,
        "dashboard booking" to 8,
        "dashboard availability" to 14,
        "dashboard reports" to 12,
        "dashboard services" to 8,
        "dashboard resources" to 5,
        "dashboard customers" to 5,
        "dashboard offer preview" to 18,
        "dashboard releases" to 17,
        "dashboard site" to 12,
        "assistant panel, nudges re-evaluated" to 24,
        "assistant panel" to 7,
        "assistant threads" to 5,
    )
}
