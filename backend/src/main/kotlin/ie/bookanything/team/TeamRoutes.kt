package ie.bookanything.team

import ie.bookanything.AppContext
import ie.bookanything.auth.Role
import ie.bookanything.businessAccess
import ie.bookanything.http.Patch
import ie.bookanything.http.pathUuid
import ie.bookanything.http.receiveBody
import ie.bookanything.http.receiveObject
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.patch
import io.ktor.server.routing.post

fun Route.teamRoutes(ctx: AppContext) {
    val team = TeamCommands(ctx.tokens)

    get("/team") {
        val access = call.businessAccess(ctx, Role.STAFF)
        call.respond(ctx.db.read(access.businessId) { TeamRepository.list(it, access.businessId, access.business.zone) })
    }

    post("/team/invitations") {
        val access = call.businessAccess(ctx, Role.ADMIN)
        val input = call.receiveBody<InvitationInput>()
        call.respond(HttpStatusCode.Created, ctx.db.tx(access.businessId) { conn -> team.invite(conn, access, input) })
    }

    patch("/team/{memberId}") {
        val access = call.businessAccess(ctx, Role.ADMIN)
        val id = call.pathUuid("memberId")
        val patch = Patch(call.receiveObject())
        call.respond(ctx.db.tx(access.businessId) { conn -> team.update(conn, access, id, patch) })
    }

    delete("/team/{memberId}") {
        val access = call.businessAccess(ctx, Role.ADMIN)
        val id = call.pathUuid("memberId")
        ctx.db.tx(access.businessId) { conn -> team.remove(conn, access, id) }
        call.respond(HttpStatusCode.NoContent)
    }
}
