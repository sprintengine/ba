package ie.bookanything.site

import ie.bookanything.ai.AiModule
import ie.bookanything.db.Db
import ie.bookanything.site.ai.AiSiteGenerator
import ie.bookanything.site.stock.StockImageProvider
import ie.bookanything.storage.AssetStorage
import ie.bookanything.templates.WebsiteFetcher
import java.time.Clock

/**
 * The site builder (docs/architecture.md section 15): plans, versions and publishing ([service]) and the AI commands
 * ([ai]). Without a model the template generator stands in for the AI one.
 */
class SiteModule(
    db: Db,
    clock: Clock,
    storage: AssetStorage,
    stockImages: StockImageProvider,
    aiModule: AiModule,
    websiteFetcher: WebsiteFetcher,
) {
    val generator: SiteGenerator = TemplateSiteGenerator().let { templates ->
        aiModule.model?.let { AiSiteGenerator(it, websiteFetcher, templates) } ?: templates
    }
    private val store = SiteStore(clock, storage, stockImages, generator, aiModule.usage)
    val service = SiteService(store)
    val ai = SiteAiService(db, store, generator, aiModule.meter)
}
