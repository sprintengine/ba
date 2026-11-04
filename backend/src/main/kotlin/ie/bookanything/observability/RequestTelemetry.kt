package ie.bookanything.observability

import ie.bookanything.BusinessIdAttribute
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.createApplicationPlugin
import io.ktor.server.application.hooks.CallSetup
import io.ktor.server.application.hooks.ResponseSent
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.httpMethod
import io.ktor.server.routing.PathSegmentConstantRouteSelector
import io.ktor.server.routing.PathSegmentOptionalParameterRouteSelector
import io.ktor.server.routing.PathSegmentParameterRouteSelector
import io.ktor.server.routing.PathSegmentTailcardRouteSelector
import io.ktor.server.routing.PathSegmentWildcardRouteSelector
import io.ktor.server.routing.RoutingNode
import io.ktor.server.routing.RoutingRoot
import io.ktor.util.AttributeKey
import java.time.Duration

/**
 * Counts and times every request by its route template, as matched by routing (`/v1/public/manage/{token}`), so ids and
 * tokens never become labels; a request no route matched is [UNMATCHED]. With traces sampled, each request is also a
 * Sentry trace named after its template.
 */
val RequestTelemetry = createApplicationPlugin("RequestTelemetry") {
    on(CallSetup) { call -> call.attributes.put(StartKey, System.nanoTime()) }
    application.monitor.subscribe(RoutingRoot.RoutingCallStarted) { call ->
        val route = RouteLabels.routeTemplate(call.route)
        call.attributes.put(RouteKey, route)
        Telemetry.errors.startTrace("${AppMetrics.methodLabel(call.request.httpMethod.value)} $route", emptyMap())
            ?.let { call.attributes.put(TraceKey, it) }
    }
    on(ResponseSent) { call ->
        val start = call.attributes.getOrNull(StartKey) ?: return@on
        val status = call.response.status()?.value
        Telemetry.metrics.request(call.routeTemplate, call.request.httpMethod.value, status, Duration.ofNanos(System.nanoTime() - start))
        call.attributes.getOrNull(TraceKey)?.finish(status)
    }
}

private val StartKey = AttributeKey<Long>("bookanything.metrics.start")
private val RouteKey = AttributeKey<String>("bookanything.metrics.route")
private val TraceKey = AttributeKey<ErrorReporter.Trace>("bookanything.metrics.trace")

/** The route template this call matched, or [RouteLabels.UNMATCHED]. */
val ApplicationCall.routeTemplate: String get() = attributes.getOrNull(RouteKey) ?: RouteLabels.UNMATCHED

/** What an error report about this call is tagged with: its request id, business and route template (no personal data). */
fun ApplicationCall.errorTags(): Map<String, String> = buildMap {
    callId?.let { put("requestId", it) }
    attributes.getOrNull(BusinessIdAttribute)?.let { put("businessId", it) }
    put("route", routeTemplate)
    put("method", AppMetrics.methodLabel(request.httpMethod.value))
}

object RouteLabels {
    const val UNMATCHED = "unmatched"

    /** The path part of a route: its literal and `{parameter}` segments, without method or plugin selectors. */
    fun routeTemplate(node: RoutingNode): String =
        "/" + generateSequence(node) { it.parent }.mapNotNull { segment(it) }.toList().asReversed().joinToString("/")

    private fun segment(node: RoutingNode): String? = when (val selector = node.selector) {
        is PathSegmentConstantRouteSelector, is PathSegmentParameterRouteSelector, is PathSegmentOptionalParameterRouteSelector,
        is PathSegmentTailcardRouteSelector, is PathSegmentWildcardRouteSelector,
        -> selector.toString()
        else -> null
    }

    /**
     * The part of the product a route serves, for the latency histogram: a handful of values, so a slow AI call or a
     * streamed assistant reply doesn't hide (or fake) a slow booking page.
     */
    fun area(route: String): String = when {
        route == UNMATCHED -> UNMATCHED
        route == "/v1/health" -> "health"
        route.startsWith("/v1/public/") -> "public"
        route.startsWith("/v1/ai/") || route.startsWith("/v1/businesses/{businessId}/assistant") || "/ai/" in "$route/" -> "ai"
        route.startsWith("/v1/businesses") -> "dashboard"
        route.startsWith("/v1/mcp") -> "mcp"
        route.startsWith("/v1/oauth") || route.startsWith("/.well-known") -> "oauth"
        route.startsWith("/v1/webhooks/") -> "webhooks"
        else -> "account"
    }
}
