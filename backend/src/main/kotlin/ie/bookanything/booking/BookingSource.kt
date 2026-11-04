package ie.bookanything.booking

/** Where a booking was made; [wire] is the `booking_source` database value and the JSON `source`. */
enum class BookingSource(val wire: String) {
    /** The public booking page (and the anonymous booking API it uses). */
    PUBLIC("public"),

    /** A team member in the dashboard. */
    DASHBOARD("dashboard"),

    /** An AI assistant acting for a signed-in customer (the customer MCP). */
    API("api"),

    /** Bo, on a team member's behalf. */
    AI("ai"),
    ;

    /** Made by the customer themselves (the booking page or their AI assistant), not by the business. */
    val byCustomer: Boolean get() = this == PUBLIC || this == API

    companion object {
        fun parse(wire: String): BookingSource = entries.first { it.wire == wire }
    }
}
