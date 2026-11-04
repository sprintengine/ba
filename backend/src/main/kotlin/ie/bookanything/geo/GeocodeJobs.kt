package ie.bookanything.geo

import ie.bookanything.business.BusinessRepository
import ie.bookanything.db.Db
import ie.bookanything.jobs.Job
import ie.bookanything.jobs.JobHandler
import ie.bookanything.jobs.JobQueue
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.sql.Connection
import java.time.Clock
import java.util.UUID

/**
 * Geocoding runs on the job queue: enqueued in the same transaction as an address change (or when a business
 * lists itself), then the worker calls the [Geocoder] outside any transaction and stores the result.
 */
object GeocodeJobs {
    const val KIND = "geocode_business"

    fun enqueue(conn: Connection, businessId: UUID) {
        JobQueue.enqueue(conn, KIND, buildJsonObject { put("businessId", JsonPrimitive(businessId.toString())) }, maxAttempts = 5)
    }

    /** Geocodes one business now (the job handler; also used by the demo seed). Returns the stored location. */
    fun run(db: Db, geocoder: Geocoder, clock: Clock, businessId: UUID): StoredLocation? {
        val business = db.txBlocking { BusinessRepository.findById(it, businessId) } ?: return null
        val query = LocationRepository.queryFor(business)
        if (query.isEmpty) {
            db.txBlocking(businessId) { LocationRepository.delete(it, businessId) }
            return null
        }
        val current = db.txBlocking(businessId, readOnly = true) { LocationRepository.get(it, businessId) }
        if (current != null && current.addressKey == query.key) return current
        val result = geocoder.geocode(query)
        return db.txBlocking(businessId) { conn ->
            LocationRepository.save(conn, businessId, query.key, result, "none", clock.instant())
            LocationRepository.get(conn, businessId)
        }
    }

    fun handler(db: Db, geocoder: Geocoder, clock: Clock) = JobHandler { job: Job ->
        val id = UUID.fromString(job.payload["businessId"]!!.jsonPrimitive.content)
        run(db, geocoder, clock, id)
    }
}
