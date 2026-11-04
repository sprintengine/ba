package ie.bookanything.ai.usage

import ie.bookanything.AppContext
import ie.bookanything.auth.Role
import ie.bookanything.businessAccess
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get

/** `/v1/businesses/{businessId}/ai/usage` (owner/admin). */
fun Route.aiUsageRoutes(ctx: AppContext) {
    get("/ai/usage") {
        call.respond(ctx.ai.usage.usage(call.businessAccess(ctx, Role.ADMIN)))
    }
}
