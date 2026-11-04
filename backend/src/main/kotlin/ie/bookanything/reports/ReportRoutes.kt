package ie.bookanything.reports

import ie.bookanything.AppContext
import ie.bookanything.auth.Role
import ie.bookanything.businessAccess
import ie.bookanything.http.KeysetCursor
import ie.bookanything.http.queryLimit
import ie.bookanything.http.queryUuid
import ie.bookanything.http.requireQueryDateRange
import ie.bookanything.http.toPage
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get

/** The longest range one report may cover. */
private const val MAX_REPORT_RANGE_DAYS = 366L

fun Route.reportRoutes(ctx: AppContext) {
    get("/reports/summary") {
        val access = call.businessAccess(ctx, Role.ADMIN)
        val b = access.business
        val (from, to) = call.requireQueryDateRange().requireValid(MAX_REPORT_RANGE_DAYS)
        val summary = ctx.db.read(b.id) { conn -> ReportRepository.summary(conn, b, from, to) }
        call.respond(summary)
    }

    get("/audit") {
        val access = call.businessAccess(ctx, Role.ADMIN)
        val entityId = call.queryUuid("entityId")
        val limit = call.queryLimit()
        val cursor = KeysetCursor.TIME_ID.decode(call.request.queryParameters["cursor"])
        val rows = ctx.db.read(access.businessId) { AuditRepository.page(it, access.business, entityId, cursor, limit) }
        call.respond(rows.toPage(limit, { KeysetCursor.TIME_ID.encode(it.second) }) { it.first })
    }
}
