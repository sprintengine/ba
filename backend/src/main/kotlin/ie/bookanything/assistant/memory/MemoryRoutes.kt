package ie.bookanything.assistant.memory

import ie.bookanything.AppContext
import ie.bookanything.auth.Role
import ie.bookanything.businessAccess
import ie.bookanything.http.pathUuid
import ie.bookanything.http.receiveBody
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.patch
import io.ktor.server.routing.post

/** `/v1/businesses/{businessId}/assistant/memory`: everyone on the team can read it; owners and admins edit it. */
fun Route.memoryRoutes(ctx: AppContext) {
    get("/assistant/memory") {
        val access = call.businessAccess(ctx, Role.STAFF)
        call.respond(
            ctx.db.read(access.businessId) { conn ->
                MemoryRepository.list(
                    conn,
                    access.businessId,
                ).map { it.toDto(access.business.zone) }
            },
        )
    }

    post("/assistant/memory") {
        val access = call.businessAccess(ctx, Role.ADMIN)
        val input = call.receiveBody<MemoryInput>()
        val row = ctx.db.tx(access.businessId) { conn -> MemoryCommands.add(conn, access, input.text, access.actor, ctx.now()) }
        call.respond(HttpStatusCode.Created, row.toDto(access.business.zone))
    }

    patch("/assistant/memory/{memoryId}") {
        val access = call.businessAccess(ctx, Role.ADMIN)
        val id = call.pathUuid("memoryId")
        val input = call.receiveBody<MemoryInput>()
        val row = ctx.db.tx(access.businessId) { conn -> MemoryCommands.update(conn, access, id, input.text, access.actor, ctx.now()) }
        call.respond(row.toDto(access.business.zone))
    }

    delete("/assistant/memory/{memoryId}") {
        val access = call.businessAccess(ctx, Role.ADMIN)
        val id = call.pathUuid("memoryId")
        ctx.db.tx(access.businessId) { conn -> MemoryCommands.delete(conn, access, id, access.actor) }
        call.respond(HttpStatusCode.NoContent)
    }
}
