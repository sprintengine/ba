package ie.bookanything.templates

import ie.bookanything.ai.JsonSchema.array
import ie.bookanything.ai.JsonSchema.boolean
import ie.bookanything.ai.JsonSchema.enum
import ie.bookanything.ai.JsonSchema.integer
import ie.bookanything.ai.JsonSchema.obj
import ie.bookanything.ai.JsonSchema.string
import ie.bookanything.business.Policies
import ie.bookanything.resources.RESOURCE_KINDS
import ie.bookanything.services.LOCATION_TYPES
import ie.bookanything.services.PAYMENT_MODES
import ie.bookanything.services.QUESTION_KINDS
import kotlinx.serialization.json.JsonObject

/**
 * JSON schema for structured outputs. Every property is required and non-null (empty string or 0
 * means "none") to stay within structured-output schema limits; [DraftRepair] maps these back.
 */
object DraftSchema {
    private val hold = Policies.SUGGESTED_HOLD_MINUTES.let { "${it.first}-${it.last}" }

    private val hours = obj(
        "dayOfWeek" to integer("1 = Monday … 7 = Sunday"),
        "startTime" to string("HH:mm, 24-hour"),
        "endTime" to string("HH:mm, 24-hour, after startTime"),
        "audienceGroupKeys" to array(string("customer group key"), "empty = everyone"),
    )

    val schema: JsonObject = obj(
        "name" to string("Business name"),
        "industry" to string("Short lowercase slug, e.g. physio"),
        "description" to string("One or two sentences for the booking page"),
        "timezone" to string("IANA timezone, e.g. Europe/Dublin"),
        "currency" to string("ISO 4217, e.g. EUR"),
        "locale" to string("e.g. en-IE"),
        "country" to string("ISO 3166-1 alpha-2, e.g. IE"),
        "primaryColor" to string("Hex colour like #0f766e"),
        "vocabulary" to obj(
            "resource" to string("Singular, e.g. Therapist"), "resources" to string("Plural"),
            "customer" to string("Singular, e.g. Patient"), "customers" to string("Plural"),
            "booking" to string("Singular, e.g. Appointment"), "bookings" to string("Plural"),
        ),
        "policies" to obj(
            "minNoticeMinutes" to integer("Minimum notice before a booking starts"),
            "maxAdvanceDays" to integer("How far ahead customers can book (1-730)"),
            "cancellationNoticeHours" to integer("Free cancellation up to this many hours before"),
            "lateCancellationRefundPercent" to integer("0-100, refund for later cancellations"),
            "allowCustomerCancel" to boolean("Customers may cancel online"),
            "allowCustomerReschedule" to boolean("Customers may reschedule online"),
            "holdMinutes" to integer("Minutes a slot is held while paying online ($hold)"),
            "requireCustomerPhone" to boolean("Phone number required"),
        ),
        "customerGroups" to array(
            obj(
                "key" to string("Short unique key, e.g. new_patients"),
                "name" to string("Display name"),
                "description" to string("\"\" if none"),
                "restricted" to boolean("Only bookable in hours windows that list this group"),
            ),
            "Optional customer segments",
        ),
        "resources" to array(
            obj(
                "key" to string("Short unique key, e.g. therapist_1"),
                "kind" to enum(RESOURCE_KINDS, "person, space or equipment"),
                "name" to string("Display name"),
                "description" to string("\"\" if none"),
                "capacity" to integer("Usually 1"),
                "weeklyHours" to array(hours, "Weekly opening hours"),
            ),
            "Bookable resources",
        ),
        "services" to array(
            obj(
                "name" to string("Unique service name"),
                "description" to string("Short description, \"\" if none"),
                "category" to string("\"\" if none"),
                "durationMinutes" to integer("Base duration, multiple of 5"),
                "bufferBeforeMinutes" to integer("0 if none"),
                "bufferAfterMinutes" to integer("0 if none"),
                "slotIntervalMinutes" to integer("Start-time step; 0 = the duration"),
                "capacity" to integer("Seats per slot; 1 unless a group session"),
                "priceCents" to integer("Base price in minor units"),
                "paymentMode" to enum(PAYMENT_MODES, "full, deposit, at_venue or free"),
                "depositCents" to integer("Deposit when paymentMode is deposit, else 0"),
                "requiresApproval" to boolean("Business must accept each booking"),
                "locationType" to enum(LOCATION_TYPES, "business, customer or online"),
                "options" to array(
                    obj(
                        "name" to string("Variant name"), "description" to string("\"\" if none"),
                        "durationMinutes" to integer("Duration for this variant"), "priceCents" to integer("Price for this variant"),
                    ),
                    "Mutually exclusive variants; empty if none",
                ),
                "addons" to array(
                    obj(
                        "name" to string("Extra name"), "description" to string("\"\" if none"),
                        "extraMinutes" to integer("Added minutes"), "priceCents" to integer("Added price"),
                    ),
                    "Optional extras",
                ),
                "requirements" to array(
                    obj(
                        "label" to string("e.g. Therapist"),
                        "quantity" to integer("How many from the pool, usually 1"),
                        "customerSelectable" to boolean("Customer picks which one (at most one requirement per service)"),
                        "resourceKeys" to array(string("resource key"), "The pool"),
                    ),
                    "Resources each booking needs; at least one",
                ),
                "allowedGroupKeys" to array(string("customer group key"), "Empty = everyone"),
            ),
            "Bookable services",
        ),
        "questions" to array(
            obj(
                "label" to string("Question text"),
                "helpText" to string("\"\" if none"),
                "kind" to enum(QUESTION_KINDS, "Field type"),
                "options" to array(string("choice"), "Choices for select, else empty"),
                "required" to boolean("Must be answered"),
                "sensitive" to boolean("Health or other personal details"),
                "serviceName" to string("Name of the one service it applies to, \"\" = all services"),
            ),
            "Booking form questions (name, email and phone are always collected)",
        ),
    )
}
