package ie.bookanything.services

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

fun Route.questionRoutes(ctx: AppContext) {
    get("/questions") {
        val access = call.businessAccess(ctx, Role.STAFF)
        call.respond(ctx.db.read(access.businessId) { QuestionRepository.list(it, access.businessId) })
    }
    post("/questions") {
        val access = call.businessAccess(ctx, Role.ADMIN)
        val input = call.receiveBody<FormQuestionInput>()
        val created = ctx.db.tx(access.businessId) { conn -> QuestionCommands.create(conn, access, input, access.actor) }
        call.respond(HttpStatusCode.Created, created)
    }
    patch("/questions/{questionId}") {
        val access = call.businessAccess(ctx, Role.ADMIN)
        val id = call.pathUuid("questionId")
        val patch = Patch(call.receiveObject())
        call.respond(ctx.db.tx(access.businessId) { conn -> QuestionCommands.update(conn, access, id, patch, access.actor) })
    }
    delete("/questions/{questionId}") {
        val access = call.businessAccess(ctx, Role.ADMIN)
        val id = call.pathUuid("questionId")
        ctx.db.tx(access.businessId) { conn -> QuestionCommands.remove(conn, access, id, access.actor) }
        call.respond(HttpStatusCode.NoContent)
    }
}
