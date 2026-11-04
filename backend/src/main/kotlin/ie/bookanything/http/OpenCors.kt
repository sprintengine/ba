package ie.bookanything.http

import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.server.plugins.cors.routing.CORS
import io.ktor.server.routing.Route

/**
 * CORS for any origin on protocol endpoints that browser-based MCP clients call directly (OAuth metadata, registration,
 * token and revocation, the MCP servers). Safe because these use bearer tokens or public data only: no cookies, no
 * credentials mode. Never install it on routes that rely on the user's web session.
 */
fun Route.openCors(methods: List<HttpMethod>, headers: List<String> = emptyList(), expose: List<String> = emptyList()) {
    install(CORS) {
        anyHost()
        methods.forEach { allowMethod(it) }
        allowHeader(HttpHeaders.ContentType)
        allowNonSimpleContentTypes = true
        headers.forEach { allowHeader(it) }
        expose.forEach { exposeHeader(it) }
        exposeHeader(HttpHeaders.XRequestId)
        maxAgeInSeconds = 600
    }
}
