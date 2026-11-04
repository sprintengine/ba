package ie.bookanything.auth

import io.ktor.http.HttpHeaders
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.createApplicationPlugin
import io.ktor.server.application.hooks.CallSetup
import io.ktor.util.AttributeKey

/**
 * A request from the reliability simulation: signed in with a simulation token, or anonymous with a valid
 * `X-Simulation-Token` header. [rateLimitKey] is its rate-limit bucket: the identity's for a signed-in bot, `guest` for
 * an anonymous one (the limiter adds the client address).
 */
data class SimulationCaller(val rateLimitKey: String, val signedIn: Boolean)

private val SimulationCallerKey = AttributeKey<SimulationCaller>("bookanything.simulationCaller")

/** The simulation caller this request is from, or null: always null unless the simulation sign-in is configured. */
val ApplicationCall.simulationCaller: SimulationCaller? get() = attributes.getOrNull(SimulationCallerKey)

/** Whether this request is the simulation's, for the `simulation` metrics label and log field. */
val ApplicationCall.isSimulation: Boolean get() = attributes.contains(SimulationCallerKey)

class SimulationTrafficConfig {
    var tokens: SimulationTokens? = null
}

/**
 * Recognises the simulation's requests when they arrive, before routing, so the rate limiter, metrics and logs can tell
 * them apart. Installed only when `SIMULATION_AUTH_SECRET` is configured (never in production). A bearer `sim.…` token
 * marks the request only when it verifies; the guest header counts only on a request with no `Authorization` header,
 * so it never changes how a signed-in user (a real one included) is treated. Nothing here signs anyone in: that is the
 * [Authenticator]'s, through [SimulationAwareVerifier].
 */
val SimulationTraffic = createApplicationPlugin("SimulationTraffic", ::SimulationTrafficConfig) {
    val tokens = requireNotNull(pluginConfig.tokens) { "SimulationTraffic needs tokens" }
    on(CallSetup) { call -> classify(call, tokens)?.let { call.attributes.put(SimulationCallerKey, it) } }
}

private fun classify(call: ApplicationCall, tokens: SimulationTokens): SimulationCaller? {
    val authorization = call.request.headers[HttpHeaders.Authorization]
    if (authorization == null) {
        val guest = call.request.headers[SimulationTokens.GUEST_HEADER]
        return SimulationCaller("guest", signedIn = false).takeIf { guest != null && tokens.verifyGuest(guest.trim()) }
    }
    val bearer = authorization.takeIf { it.startsWith("Bearer ", ignoreCase = true) }?.substring(7)?.trim()
    return bearer?.let(tokens::verifyBearer)?.let { SimulationCaller("user:${it.subject}", signedIn = true) }
}
