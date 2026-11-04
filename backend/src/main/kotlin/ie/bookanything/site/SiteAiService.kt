package ie.bookanything.site

import ie.bookanything.ai.AiCaller
import ie.bookanything.ai.AiFeature
import ie.bookanything.ai.usage.AiMeter
import ie.bookanything.audit.Actor
import ie.bookanything.audit.Audit
import ie.bookanything.auth.BusinessAccess
import ie.bookanything.db.Db
import ie.bookanything.http.Errors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.sql.Connection

/**
 * AI site generation and conversational edits (section 15.6): a credit check before the model is called (the model
 * call itself is metered by the shared seam), generation outside any transaction, then a versioned and audited
 * commit. The audit actor is `ai` (the copilot acting for the requesting user). Without a model the built-in
 * designer answers and nothing is metered.
 *
 * [generate] and [edit] are workflows, not commands: a model call can take a minute and must not hold a transaction
 * (or row locks) open, so they read in one short transaction and commit in another. The commit step itself
 * ([commitGeneration]) takes the caller's [Connection] like every other command.
 */
class SiteAiService(private val db: Db, private val store: SiteStore, private val generator: SiteGenerator, private val meter: AiMeter) {

    suspend fun generate(access: BusinessAccess, prompt: String?, websiteUrl: String?): SiteAiResult {
        val before = db.read(access.businessId) { conn ->
            requireCredits(conn, access)
            store.load(conn, access.business)
        }
        val current = PlanSanitizer.sanitize(before.draft, before.refs)
        val caller = AiCaller(AiFeature.SITE_GENERATE, access.businessId, access.user.id)
        val generation = withContext(Dispatchers.IO) {
            generator.generate(GenerateRequest(before.inputs, before.refs, current, prompt, websiteUrl, caller))
        }
        val source = if (generation.source == GenerationSource.AI) SiteVersionSource.AI_GENERATE else SiteVersionSource.TEMPLATE
        return db.tx(access.businessId) { conn ->
            // Like an edit: if the owner saved while the generator ran, keep their work and ask them to try again.
            commitGeneration(conn, access, generation, Commit(source, prompt, "site.generated", before.draftVersion, checkBase = true))
        }
    }

    suspend fun edit(access: BusinessAccess, instruction: String, baseVersion: Int?): SiteAiResult {
        val before = db.read(access.businessId) { conn ->
            val site = store.load(conn, access.business)
            SiteService.requireBase(site, baseVersion)
            requireCredits(conn, access)
            site
        }
        val current = PlanSanitizer.sanitize(before.draft, before.refs)
        val caller = AiCaller(AiFeature.SITE_EDIT, access.businessId, access.user.id)
        val generation = withContext(Dispatchers.IO) {
            generator.edit(EditRequest(before.inputs, before.refs, current, instruction, caller))
        }
        return db.tx(access.businessId) { conn ->
            val commit =
                Commit(SiteVersionSource.AI_EDIT, instruction, "site.edited", expectedDraft = before.draftVersion, checkBase = true)
            commitGeneration(conn, access, generation, commit)
        }
    }

    /** 409 AI_LIMIT_REACHED up front, so an owner out of credits is told so instead of getting the fallback design. */
    private fun requireCredits(conn: Connection, access: BusinessAccess) {
        if (generator.usesModel) meter.requireAllowed(conn, access.business)
    }

    /** How a generation is saved: its version [source], the owner's [instruction], the audit [action]. */
    data class Commit(
        val source: SiteVersionSource,
        val instruction: String?,
        val action: String,
        /** The draft version the generator started from; with [checkBase], a different draft now is a conflict. */
        val expectedDraft: Int?,
        val checkBase: Boolean = false,
    )

    /**
     * Saves the generated plan as a new version unless it equals the draft (then nothing is saved). For edits the
     * draft must not have changed while the generator ran.
     */
    fun commitGeneration(conn: Connection, access: BusinessAccess, generation: Generation, commit: Commit): SiteAiResult {
        val (source, instruction, action) = commit
        SiteRepository.lock(conn, access.businessId)
        val site = store.load(conn, access.business)
        if (commit.checkBase && site.draftVersion != commit.expectedDraft) {
            throw Errors.conflict("The site changed while the assistant was working. Please try again.")
        }
        val plan = SiteValidator(site.refs).check(generation.plan)
        if (plan == site.draft) {
            return SiteAiResult(
                store.state(conn, site), generation.source.key, emptyList(), site.draftVersion,
                generation.message ?: "Your site already matches this, so nothing was changed.",
            )
        }
        val actor = Actor.ai(access.user.id)
        val saved = store.commit(conn, site, plan, source, instruction, actor)
        Audit.record(
            conn, access.businessId, actor, action, SiteService.ENTITY, access.businessId,
            mapOf("version" to saved.version, "source" to generation.source.key, "instruction" to instruction, "changes" to saved.changes),
        )
        return SiteAiResult(
            store.state(conn, store.reload(conn, site)), generation.source.key, saved.changes, site.draftVersion, generation.message,
        )
    }
}
