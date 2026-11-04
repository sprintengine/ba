package ie.bookanything.assistant.memory

import ie.bookanything.http.formatInstant
import kotlinx.serialization.Serializable
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

/** One business memory entry: a fact or preference the owner wants Bo to know ("We close early on Fridays"). */
@Serializable
data class MemoryEntryDto(val id: String, val text: String, val createdBy: String?, val createdAt: String, val updatedAt: String)

@Serializable
data class MemoryInput(val text: String? = null)

data class MemoryRow(val id: UUID, val text: String, val createdBy: String?, val createdAt: Instant, val updatedAt: Instant) {
    fun toDto(zone: ZoneId) = MemoryEntryDto(id.toString(), text, createdBy, formatInstant(createdAt, zone), formatInstant(updatedAt, zone))
}
