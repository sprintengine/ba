package ie.bookanything.db

import ie.bookanything.audit.ActorType
import ie.bookanything.booking.BookingStatus
import ie.bookanything.business.Plan
import ie.bookanything.http.ApiJson
import ie.bookanything.payments.CancelActor
import ie.bookanything.payments.PaymentStatus
import ie.bookanything.support.TestDatabase
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.serializer
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.TestFactory
import kotlin.test.assertEquals

/**
 * The Kotlin enums that mirror Postgres enum types: their `wire` values, their JSON names and the database labels must be
 * the same list, so the API, the database and the code cannot drift apart.
 */
class DatabaseEnumsTest {
    private class Case<E : Enum<E>>(
        val pgType: String,
        val entries: List<E>,
        val serializer: KSerializer<E>,
        val wire: (E) -> String,
        val parse: (String) -> E,
    )

    private val cases = listOf(
        Case("booking_status", BookingStatus.entries, serializer<BookingStatus>(), { it.wire }, BookingStatus::parse),
        Case("payment_status", PaymentStatus.entries, serializer<PaymentStatus>(), { it.wire }, PaymentStatus::parse),
        Case("actor_type", ActorType.entries, serializer<ActorType>(), { it.wire }, ActorType::parse),
        Case("cancelled_by", CancelActor.entries, serializer<CancelActor>(), { it.wire }, CancelActor::parse),
        Case("business_plan", Plan.entries, serializer<Plan>(), { it.wire }, Plan::parse),
    )

    @TestFactory
    fun `wire values, JSON names and database labels agree`() = cases.map { case -> DynamicTest.dynamicTest(case.pgType) { check(case) } }

    private fun <E : Enum<E>> check(case: Case<E>) {
        val wires = case.entries.map(case.wire)
        assertEquals(labels(case.pgType), wires, "${case.pgType}: Postgres labels (in order) vs wire values")
        assertEquals(wires, case.entries.map { ApiJson.encodeToJsonElement(case.serializer, it).jsonPrimitive.content }, "JSON names")
        assertEquals(case.entries, wires.map(case.parse), "parse(wire) round-trips")
    }

    private fun labels(pgType: String): List<String> = TestDatabase.dataSource.connection.use { conn ->
        conn.query(
            "SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = ? ORDER BY e.enumsortorder",
            pgType,
        ) { it.str("enumlabel") }
    }
}
