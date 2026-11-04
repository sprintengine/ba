package ie.bookanything.templates

import ie.bookanything.AppContext
import ie.bookanything.business.SetupInstaller
import ie.bookanything.http.RateLimiter
import ie.bookanything.http.Validator
import ie.bookanything.http.receiveBody
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.post
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

fun Route.aiRoutes(ctx: AppContext) {
    post("/ai/business-draft") {
        val user = ctx.auth.requireUser(call)
        // Per address and per user: each draft is a metered model call, and an account can move between addresses.
        ctx.rateLimiter.check(call, RateLimiter.AI_DRAFT, ctx.now())
        ctx.rateLimiter.checkKey("user:${user.id}", RateLimiter.AI_DRAFT, ctx.now())
        val input = call.receiveBody<BusinessDraftRequest>()
        val v = Validator()
        v.requireText(input.description, "description", 4000)
        v.url(input.websiteUrl, "websiteUrl")
        v.throwIfInvalid()
        val setup = withContext(Dispatchers.IO) { ctx.draftGenerator.generate(input, user.id) }
        // Drafts are validated exactly like user input; an invalid draft falls back to the template generator.
        val safe = if (SetupInstaller.validate(setup).isValid) setup else TemplateDraftGenerator().generate(input)
        call.respond(safe)
    }
}
