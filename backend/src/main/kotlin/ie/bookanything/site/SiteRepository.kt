package ie.bookanything.site

import ie.bookanything.audit.Actor
import ie.bookanything.audit.ActorType
import ie.bookanything.db.Jsonb
import ie.bookanything.db.exists
import ie.bookanything.db.instant
import ie.bookanything.db.instantOrNull
import ie.bookanything.db.int
import ie.bookanything.db.intOrNull
import ie.bookanything.db.query
import ie.bookanything.db.queryOne
import ie.bookanything.db.str
import ie.bookanything.db.strOrNull
import ie.bookanything.db.update
import ie.bookanything.http.ApiJson
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.serializer
import java.sql.Connection
import java.sql.ResultSet
import java.time.Instant
import java.util.UUID

data class SiteRow(
    val draft: SitePlan,
    val draftVersion: Int,
    val published: SitePlan?,
    val publishedVersion: Int?,
    val publishedAt: Instant?,
    val updatedAt: Instant,
)

/** A plan to save as draft [version]: who made it ([actor], [source], the owner's [instruction]) and what changed. */
data class NewSiteVersion(
    val version: Int,
    val plan: SitePlan,
    val source: SiteVersionSource,
    val instruction: String?,
    val changes: List<String>,
    val actor: Actor,
)

data class SiteVersionRow(
    val version: Int,
    val source: SiteVersionSource,
    val instruction: String?,
    val changes: List<String>,
    val actorType: ActorType,
    val actorName: String?,
    val createdAt: Instant,
    val plan: SitePlan?,
)

/** SQL for `business_sites` and `site_versions`. Plans are stored in normalized JSON. */
object SiteRepository {
    /** Stored plans were validated on write; decoding tolerates fields added later. */
    private val stored = Json { ignoreUnknownKeys = true; explicitNulls = false; coerceInputValues = true }
    private val changesSerializer = ListSerializer(String.serializer())

    fun decodePlan(json: String): SitePlan = stored.decodeFromString(serializer<SitePlan>(), json)
    fun encodePlan(plan: SitePlan) = Jsonb(ApiJson.encodeToString(serializer<SitePlan>(), plan))

    /** Serializes site writes per business for the rest of the transaction. */
    fun lock(conn: Connection, businessId: UUID) {
        conn.queryOne("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", "site:$businessId") { }
    }

    fun find(conn: Connection, businessId: UUID): SiteRow? = conn.queryOne(
        """
        SELECT draft::text AS draft, draft_version, published::text AS published, published_version, published_at, updated_at
        FROM business_sites WHERE business_id = ?
        """.trimIndent(),
        businessId,
    ) { rs ->
        SiteRow(
            draft = decodePlan(rs.str("draft")), draftVersion = rs.int("draft_version"),
            published = rs.strOrNull("published")?.let(::decodePlan), publishedVersion = rs.intOrNull("published_version"),
            publishedAt = rs.instantOrNull("published_at"), updatedAt = rs.instant("updated_at"),
        )
    }

    /** The published plan alone (the public page never needs the draft, often the bigger of the two). */
    fun published(conn: Connection, businessId: UUID): SitePlan? = conn.queryOne(
        "SELECT published::text AS published FROM business_sites WHERE business_id = ? AND published IS NOT NULL", businessId,
    ) { decodePlan(it.str("published")) }

    /** Whether the business has published its site, without reading either plan. */
    fun isPublished(conn: Connection, businessId: UUID): Boolean =
        conn.exists("SELECT 1 FROM business_sites WHERE business_id = ? AND published IS NOT NULL", businessId)

    fun saveDraft(conn: Connection, businessId: UUID, plan: SitePlan, version: Int, userId: UUID?, now: Instant) {
        conn.update(
            """
            INSERT INTO business_sites (business_id, draft, draft_version, updated_at, updated_by_user_id) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (business_id) DO UPDATE SET draft = EXCLUDED.draft, draft_version = EXCLUDED.draft_version,
                updated_at = EXCLUDED.updated_at, updated_by_user_id = EXCLUDED.updated_by_user_id
            """.trimIndent(),
            businessId, encodePlan(plan), version, now, userId,
        )
    }

    fun publishDraft(conn: Connection, businessId: UUID, userId: UUID?, now: Instant) {
        conn.update(
            """
            UPDATE business_sites SET published = draft, published_version = draft_version, published_at = ?, updated_at = ?, updated_by_user_id = ?
            WHERE business_id = ?
            """.trimIndent(),
            now, now, userId, businessId,
        )
    }

    fun insertVersion(conn: Connection, businessId: UUID, v: NewSiteVersion, now: Instant) {
        conn.update(
            """
            INSERT INTO site_versions (business_id, version, plan, source, instruction, changes, actor_type, actor_user_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?::actor_type, ?, ?)
            """.trimIndent(),
            businessId, v.version, encodePlan(v.plan), v.source.key, v.instruction,
            Jsonb(ApiJson.encodeToString(changesSerializer, v.changes)), v.actor.type, v.actor.userId, now,
        )
    }

    /** Keeps the newest [keep] versions plus the published one. */
    fun prune(conn: Connection, businessId: UUID, keep: Int) {
        conn.update(
            """
            DELETE FROM site_versions v
            WHERE v.business_id = ?
              AND v.version <= (SELECT max(version) FROM site_versions WHERE business_id = ?) - ?
              AND v.version IS DISTINCT FROM (SELECT published_version FROM business_sites WHERE business_id = ?)
            """.trimIndent(),
            businessId, businessId, keep, businessId,
        )
    }

    private const val VERSION_COLUMNS = """
        v.version, v.source, v.instruction, v.changes::text AS changes, v.actor_type::text AS actor_type, u.name AS actor_name, v.created_at
    """

    private fun mapVersion(rs: ResultSet, withPlan: Boolean) = SiteVersionRow(
        version = rs.int("version"),
        source = keyed<SiteVersionSource>(rs.str("source")) ?: SiteVersionSource.OWNER,
        instruction = rs.strOrNull("instruction"),
        changes = ApiJson.decodeFromString(changesSerializer, rs.str("changes")),
        actorType = ActorType.parse(rs.str("actor_type")),
        actorName = rs.strOrNull("actor_name"),
        createdAt = rs.instant("created_at"),
        plan = if (withPlan) decodePlan(rs.str("plan")) else null,
    )

    fun versions(conn: Connection, businessId: UUID): List<SiteVersionRow> = conn.query(
        "SELECT $VERSION_COLUMNS FROM site_versions v LEFT JOIN users u ON u.id = v.actor_user_id WHERE v.business_id = ? ORDER BY " +
            "v.version DESC",
        businessId,
    ) { mapVersion(it, withPlan = false) }

    fun version(conn: Connection, businessId: UUID, version: Int): SiteVersionRow? = conn.queryOne(
        "SELECT $VERSION_COLUMNS, v.plan::text AS plan FROM site_versions v LEFT JOIN users u ON u.id = v.actor_user_id WHERE " +
            "v.business_id = ? AND v.version = ?",
        businessId, version,
    ) { mapVersion(it, withPlan = true) }
}
