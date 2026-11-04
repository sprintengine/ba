package ie.bookanything.site

import ie.bookanything.audit.Actor
import ie.bookanything.audit.Audit
import ie.bookanything.auth.BusinessAccess
import ie.bookanything.business.BusinessRepository
import ie.bookanything.business.BusinessRow
import ie.bookanything.http.Errors
import ie.bookanything.http.formatInstant
import kotlinx.serialization.json.JsonElement
import java.sql.Connection

/**
 * The owner's site commands (section 15.5): read state, save a draft version, publish, list and
 * restore versions. Every mutation is versioned and audited. Also the public facade for the site
 * shown on the business's page. Like every command, they run in the caller's transaction ([Connection]), so a
 * site change can be part of a larger unit of work (a Bo action, the demo seeder).
 */
class SiteService(private val store: SiteStore) {

    /** The published plan, or the default plan when nothing is published. For the public business view. */
    fun publicSite(conn: Connection, business: BusinessRow): PublicSite {
        // A published plan only needs the live context; the services and the rest are for building the default plan.
        SiteRepository.published(conn, business.id)?.let {
            return PublicSite(plan = it, isDefault = false, context = store.context(conn, business))
        }
        val site = store.load(conn, business, row = null)
        return PublicSite(plan = site.defaultPlan, isDefault = true, context = site.inputs.context)
    }

    fun state(conn: Connection, access: BusinessAccess): SiteState = store.state(conn, store.load(conn, access.business))

    fun save(conn: Connection, access: BusinessAccess, plan: JsonElement?, baseVersion: Int?): SiteState {
        SiteRepository.lock(conn, access.businessId)
        var site = store.load(conn, access.business)
        requireBase(site, baseVersion)
        if (plan == null) throw Errors.field("plan", "Required")
        val next = SiteValidator(site.refs).parse(plan)
        if (next != site.draft) {
            val commit = store.commit(conn, site, next, SiteVersionSource.OWNER, null, access.actor)
            Audit.record(
                conn, access.businessId, access.actor, "site.updated", ENTITY, access.businessId,
                mapOf("version" to commit.version, "changes" to commit.changes),
            )
            site = store.reload(conn, site)
        }
        return store.state(conn, site)
    }

    fun publish(conn: Connection, access: BusinessAccess): SiteState {
        SiteRepository.lock(conn, access.businessId)
        var site = store.load(conn, access.business)
        if (site.row == null) {
            // Publishing a never-saved site pins the default plan as version 1.
            store.commit(conn, site, SiteValidator(site.refs).check(site.defaultPlan), SiteVersionSource.TEMPLATE, null, access.actor)
            site = store.reload(conn, site)
        }
        val row = site.row!!
        if (row.publishedVersion != row.draftVersion) {
            SiteRepository.publishDraft(conn, access.businessId, access.user.id, store.now())
            BusinessRepository.setPrimaryColor(conn, access.businessId, row.draft.palette.primaryColor)
            Audit.record(
                conn, access.businessId, access.actor, "site.published", ENTITY, access.businessId, mapOf("version" to row.draftVersion),
            )
            site = store.reload(conn, site)
        }
        return store.state(conn, site)
    }

    fun versions(conn: Connection, access: BusinessAccess): SiteVersionList {
        val row = SiteRepository.find(conn, access.businessId)
        return SiteVersionList(
            SiteRepository.versions(conn, access.businessId).map { v ->
                SiteVersionDto(
                    v.version, v.source, v.instruction, v.changes, v.actorType, v.actorName,
                    formatInstant(
                        v.createdAt, access.business.zone,
                    ),
                    isPublished = v.version == row?.publishedVersion, isDraft = v.version == row?.draftVersion,
                )
            },
        )
    }

    fun version(conn: Connection, access: BusinessAccess, version: Int): SiteVersionDetailDto {
        val row = SiteRepository.find(conn, access.businessId)
        val v = SiteRepository.version(conn, access.businessId, version) ?: throw Errors.notFound("Version")
        return SiteVersionDetailDto(
            v.version, v.source, v.instruction, v.changes, v.actorType, v.actorName,
            formatInstant(
                v.createdAt, access.business.zone,
            ),
            isPublished = v.version == row?.publishedVersion, isDraft = v.version == row?.draftVersion, plan = v.plan!!,
        )
    }

    /** Copies an older version into a new draft version; references to deleted services or people are dropped. */
    fun restore(conn: Connection, access: BusinessAccess, version: Int): SiteState {
        SiteRepository.lock(conn, access.businessId)
        var site = store.load(conn, access.business)
        val old = SiteRepository.version(conn, access.businessId, version) ?: throw Errors.notFound("Version")
        val plan = SiteValidator(site.refs).check(PlanSanitizer.sanitize(old.plan!!, site.refs))
        if (plan != site.draft) {
            val commit = store.commit(conn, site, plan, SiteVersionSource.RESTORE, null, access.actor)
            Audit.record(
                conn, access.businessId, access.actor, "site.restored", ENTITY, access.businessId,
                mapOf("fromVersion" to version, "version" to commit.version, "changes" to commit.changes),
            )
            site = store.reload(conn, site)
        }
        return store.state(conn, site)
    }

    /**
     * Development seed: saves [build]'s plan as version 1 (source `seed`) and publishes it, unless the
     * business already has a site. Invalid plans fail loudly.
     */
    fun seedIfMissing(conn: Connection, business: BusinessRow, build: (SiteInputs) -> SitePlan?): Boolean {
        SiteRepository.lock(conn, business.id)
        val site = store.load(conn, business)
        if (site.row != null) return false
        val raw = build(site.inputs) ?: return false
        val problems = SiteValidator(site.refs).problems(raw)
        check(problems.isEmpty()) { "Seeded site for ${business.slug} is invalid: $problems" }
        val plan = SiteValidator(site.refs).check(raw)
        store.commit(conn, site, plan, SiteVersionSource.SEED, null, Actor.SYSTEM)
        SiteRepository.publishDraft(conn, business.id, null, store.now())
        BusinessRepository.setPrimaryColor(conn, business.id, plan.palette.primaryColor)
        return true
    }

    companion object {
        const val ENTITY = "site"

        /** 409 when the client edited an older draft than the current one. */
        fun requireBase(site: LoadedSite, baseVersion: Int?) {
            if (baseVersion != null && baseVersion != site.draftVersion) {
                throw Errors.conflict(
                    "The site was changed elsewhere (now version ${site.draftVersion ?: "none"}). Reload to get the latest draft.",
                )
            }
        }
    }
}
