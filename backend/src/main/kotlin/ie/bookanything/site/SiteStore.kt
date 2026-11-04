package ie.bookanything.site

import ie.bookanything.ai.usage.AiUsageService
import ie.bookanything.audit.Actor
import ie.bookanything.business.BusinessRow
import ie.bookanything.http.formatInstantOrNull
import ie.bookanything.site.stock.StockImageProvider
import ie.bookanything.storage.AssetStorage
import ie.bookanything.storage.ImageSanitizer
import java.sql.Connection
import java.time.Clock
import java.time.Instant
import java.time.LocalDate

/** One business's site data, loaded in a transaction. */
data class LoadedSite(val business: BusinessRow, val inputs: SiteInputs, val refs: SiteRefs, val row: SiteRow?) {
    val defaultPlan: SitePlan by lazy { DefaultSitePlan.build(inputs) }

    /** The draft, or the default plan when the site was never saved. */
    val draft: SitePlan get() = row?.draft ?: defaultPlan
    val draftVersion: Int? get() = row?.draftVersion
}

data class Commit(val version: Int, val changes: List<String>)

/**
 * Loading, versioning and state building shared by the site commands. Callers hold the
 * transaction (and [SiteRepository.lock] for writes).
 */
class SiteStore(
    private val clock: Clock,
    private val storage: AssetStorage,
    private val stock: StockImageProvider,
    private val generator: SiteGenerator,
    private val aiUsage: AiUsageService,
) {
    /** [row] is the business's site row when the caller has already read it. */
    fun load(conn: Connection, business: BusinessRow, row: SiteRow? = SiteRepository.find(conn, business.id)): LoadedSite {
        val inputs = SiteInputs.load(conn, business, today(business))
        return LoadedSite(business, inputs, inputs.refs(storage.publicPrefix(business.id)), row)
    }

    /** The live context shown next to a plan (team, today's opening hours), without the rest of [SiteInputs]. */
    fun context(conn: Connection, business: BusinessRow): SiteContext = SiteInputs.context(conn, business, today(business))

    private fun today(business: BusinessRow): LocalDate = LocalDate.ofInstant(clock.instant(), business.zone)

    fun now(): Instant = clock.instant()

    fun reload(conn: Connection, site: LoadedSite) = site.copy(row = SiteRepository.find(conn, site.business.id))

    /** Saves [plan] as the next draft version with its change list against the current draft. */
    fun commit(conn: Connection, site: LoadedSite, plan: SitePlan, source: SiteVersionSource, instruction: String?, actor: Actor): Commit {
        val businessId = site.business.id
        val version = (site.draftVersion ?: 0) + 1
        val changes = SiteDiff.changes(site.draft, plan)
        val now = clock.instant()
        SiteRepository.insertVersion(conn, businessId, NewSiteVersion(version, plan, source, instruction, changes, actor), now)
        SiteRepository.saveDraft(conn, businessId, plan, version, actor.userId, now)
        SiteRepository.prune(conn, businessId, KEEP_VERSIONS)
        return Commit(version, changes)
    }

    fun state(conn: Connection, site: LoadedSite): SiteState {
        val b = site.business
        val row = site.row
        return SiteState(
            draft = site.draft,
            draftVersion = row?.draftVersion,
            published = row?.published,
            publishedVersion = row?.publishedVersion,
            publishedAt = formatInstantOrNull(row?.publishedAt, b.zone),
            updatedAt = formatInstantOrNull(row?.updatedAt, b.zone),
            hasUnpublishedChanges = row != null && row.draftVersion != row.publishedVersion,
            context = site.inputs.context,
            ai = SiteAiStatusDto(generator.usesModel, aiUsage.credits(conn, b)),
            stock = StockStatusDto(stock.enabled),
            uploads = UploadStatusDto(storage.enabled, ImageSanitizer.MAX_BYTES),
        )
    }

    companion object {
        const val KEEP_VERSIONS = 50
    }
}
