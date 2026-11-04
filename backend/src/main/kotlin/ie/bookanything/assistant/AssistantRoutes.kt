package ie.bookanything.assistant

import ie.bookanything.AppContext
import ie.bookanything.assistant.actions.ActionOrigin
import ie.bookanything.assistant.actions.AgentRequestList
import ie.bookanything.assistant.memory.memoryRoutes
import ie.bookanything.auth.Role
import ie.bookanything.businessAccess
import ie.bookanything.http.ApiException
import ie.bookanything.http.ApiJson
import ie.bookanything.http.Errors
import ie.bookanything.http.RateLimiter
import ie.bookanything.http.pathUuid
import ie.bookanything.http.receiveBody
import ie.bookanything.http.receiveOptionalBody
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.server.plugins.callid.callId
import io.ktor.server.response.header
import io.ktor.server.response.respond
import io.ktor.server.response.respondBytesWriter
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.utils.io.writeStringUtf8
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.serializer
import org.slf4j.LoggerFactory

private val log = LoggerFactory.getLogger("ie.bookanything.assistant.AssistantRoutes")

/** Turns run here, not in the request's scope, so a reply is still stored if the browser goes away mid-stream. */
private val turns = CoroutineScope(SupervisorJob() + Dispatchers.IO)

/** One server-sent event: `event: <type>` and the event as JSON. */
fun sseFrame(event: TurnEvent): String {
    val json = ApiJson.encodeToJsonElement(serializer<TurnEvent>(), event)
    return "event: ${json.jsonObject["type"]!!.jsonPrimitive.content}\ndata: $json\n\n"
}

/**
 * `/v1/businesses/{businessId}/agent-requests…` (section 20.8): the proposals the member's own AI apps made here, for
 * them to approve or decline while signed in. Only the member who connected the app sees and decides them; an app's
 * access token is not accepted here (it is only valid at the MCP), so an app can't approve its own proposal.
 */
private fun Route.agentRequestRoutes(ctx: AppContext) {
    val actions = ctx.assistant.actions

    get("/agent-requests") {
        val access = call.businessAccess(ctx, Role.STAFF)
        call.respond(AgentRequestList(ctx.db.read(access.businessId) { conn -> actions.forMemberApps(conn, access) }))
    }

    get("/agent-requests/{actionId}") {
        val access = call.businessAccess(ctx, Role.STAFF)
        val id = call.pathUuid("actionId")
        // Shown as it would happen now; one that can't go ahead any more is shown as it was (approving says why).
        withContext(Dispatchers.IO) {
            try {
                actions.refresh(access, id)
            } catch (_: ApiException) {
            }
        }
        call.respond(ctx.db.read(access.businessId) { conn -> actions.forMemberApp(conn, access, id) })
    }

    post("/agent-requests/{actionId}/approve") {
        val access = call.businessAccess(ctx, Role.STAFF)
        val id = call.pathUuid("actionId")
        // The member approves what will happen: if it changed since they saw it, they see it again first.
        if (withContext(Dispatchers.IO) { actions.refresh(access, id) }) {
            throw Errors.conflict(
                "This change is different now from when it was prepared (a time, a price or a refund changed). Check it again, then approve.",
            )
        }
        val row = ctx.db.tx(access.businessId) { conn -> actions.confirmRow(conn, access, id, ActionOrigin.Approval) }
        call.respond(actions.request(row, access))
    }

    post("/agent-requests/{actionId}/decline") {
        val access = call.businessAccess(ctx, Role.STAFF)
        val id = call.pathUuid("actionId")
        val row = ctx.db.tx(access.businessId) { conn -> actions.rejectRow(conn, access, id, ActionOrigin.Approval) }
        call.respond(actions.request(row, access))
    }
}

/** `/v1/businesses/{businessId}/assistant…`: Bo, for every member (nudges and memory edits for owners and admins). */
fun Route.assistantRoutes(ctx: AppContext) {
    val bo = ctx.assistant.service

    get("/assistant") {
        call.respond(bo.state(call.businessAccess(ctx, Role.STAFF)))
    }

    get("/assistant/threads") {
        call.respond(bo.threads(call.businessAccess(ctx, Role.STAFF)))
    }

    post("/assistant/threads") {
        val access = call.businessAccess(ctx, Role.STAFF)
        val input = call.receiveOptionalBody(serializer<CreateThreadInput>(), CreateThreadInput())
        call.respond(HttpStatusCode.Created, bo.createThread(access, input.title))
    }

    get("/assistant/threads/{threadId}") {
        val access = call.businessAccess(ctx, Role.STAFF)
        call.respond(bo.thread(access, call.pathUuid("threadId")))
    }

    delete("/assistant/threads/{threadId}") {
        val access = call.businessAccess(ctx, Role.STAFF)
        bo.deleteThread(access, call.pathUuid("threadId"))
        call.respond(HttpStatusCode.NoContent)
    }

    post("/assistant/threads/{threadId}/messages") {
        val access = call.businessAccess(ctx, Role.STAFF)
        val threadId = call.pathUuid("threadId")
        ctx.rateLimiter.check(call, RateLimiter.ASSISTANT, ctx.now())
        val input = call.receiveBody<SendMessageInput>()
        val claim = bo.begin(access, threadId, input.text)
        val requestId = call.callId
        val events = Channel<TurnEvent>(Channel.UNLIMITED)
        turns.launch {
            try {
                bo.run(access, threadId, claim, requestId) { events.trySend(it) }
            } catch (e: CancellationException) {
                throw e
            } catch (@Suppress("TooGenericExceptionCaught") e: Exception) { // Turn boundary: any failure becomes an error event.
                log.error("assistant turn failed", e)
                events.trySend(TurnEvent.Error("INTERNAL_SERVER_ERROR", "Something went wrong. Please try again."))
            } finally {
                events.close()
            }
        }
        call.response.header(HttpHeaders.CacheControl, "no-cache, no-transform")
        call.response.header("X-Accel-Buffering", "no")
        call.respondBytesWriter(ContentType.Text.EventStream) {
            writeStringUtf8(": Bo is thinking\n\n")
            flush()
            for (event in events) {
                writeStringUtf8(sseFrame(event))
                flush()
            }
        }
    }

    post("/assistant/actions/{actionId}/confirm") {
        val access = call.businessAccess(ctx, Role.STAFF)
        val id = call.pathUuid("actionId")
        call.respond(ctx.db.tx(access.businessId) { conn -> ctx.assistant.actions.confirm(conn, access, id) })
    }

    post("/assistant/actions/{actionId}/reject") {
        val access = call.businessAccess(ctx, Role.STAFF)
        val id = call.pathUuid("actionId")
        call.respond(ctx.db.tx(access.businessId) { conn -> ctx.assistant.actions.reject(conn, access, id) })
    }

    agentRequestRoutes(ctx)

    post("/assistant/nudges/{nudgeId}/dismiss") {
        val access = call.businessAccess(ctx, Role.ADMIN)
        bo.dismissNudge(access, call.pathUuid("nudgeId"))
        call.respond(HttpStatusCode.NoContent)
    }

    memoryRoutes(ctx)
}
