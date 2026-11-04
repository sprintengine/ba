package ie.bookanything.mcp.customer

import ie.bookanything.AppContext
import ie.bookanything.http.ApiException
import ie.bookanything.http.Errors
import ie.bookanything.http.pathUuid
import ie.bookanything.http.receiveBody
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.patch
import io.ktor.server.routing.post

/**
 * `/v1/me/agent-requests…` and `/v1/me/agent-settings` (section 20.8): what the customer's own AI apps asked to do, for
 * them to approve or decline while signed in, and which kinds they let go ahead without that. An app's access token is
 * only valid at the MCP, so an app can't approve its own request.
 */
fun Route.customerRequestRoutes(ctx: AppContext) {
    val requests = CustomerRequests(ctx)

    get("/me/agent-requests") {
        val user = ctx.auth.requireUser(call)
        call.respond(CustomerRequestList(requests.recent(user).map(requests::toDto)))
    }

    get("/me/agent-requests/{id}") {
        val user = ctx.auth.requireUser(call)
        val id = call.pathUuid("id")
        // Shown as it would happen now; one that can't go ahead any more is shown as it was (approving says why).
        try {
            requests.refresh(user, id)
        } catch (e: ApiException) {
            if (e.status.value == NOT_FOUND) throw e
        }
        call.respond(requests.toDto(requests.mine(user, id) ?: throw Errors.notFound("Request")))
    }

    post("/me/agent-requests/{id}/approve") {
        val user = ctx.auth.requireUser(call)
        val id = call.pathUuid("id")
        // The customer approves what will happen: if it changed since they saw it, they see it again first.
        if (requests.refresh(user, id)) {
            throw Errors.conflict(
                "This is different now from when it was prepared (a time, a price or a refund changed). Check it again, then approve.",
            )
        }
        call.respond(requests.toDto(requests.carryOut(user, id, byApp = false)))
    }

    post("/me/agent-requests/{id}/decline") {
        val user = ctx.auth.requireUser(call)
        call.respond(requests.toDto(requests.decline(user, call.pathUuid("id"))))
    }

    get("/me/agent-settings") {
        call.respond(requests.settings(ctx.auth.requireUser(call)))
    }

    patch("/me/agent-settings") {
        val user = ctx.auth.requireUser(call)
        call.respond(requests.updateSettings(user, call.receiveBody<UpdateAgentSettings>()))
    }
}

private const val NOT_FOUND = 404
