package ie.bookanything.http

import io.ktor.http.HttpHeaders
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.createApplicationPlugin
import io.ktor.server.request.path
import io.ktor.server.response.header
import java.time.Duration

/**
 * Lets browsers and shared caches (a CDN) keep this response for [maxAge]. Only for responses that are the same for
 * every caller and may be that stale: never anything that depends on who is signed in, or on bookings.
 */
fun ApplicationCall.cachePublicly(maxAge: Duration) {
    response.header(HttpHeaders.CacheControl, "public, max-age=${maxAge.seconds}")
}

/**
 * `Cache-Control: no-store` on every `/v1` response that does not set its own ([cachePublicly], uploaded files, Bo's event
 * stream): API answers are personal or change at once (bookings, availability), so no browser or proxy may keep them.
 */
val NoStoreByDefault = createApplicationPlugin("NoStoreByDefault") {
    onCallRespond { call, _ ->
        if (call.request.path().startsWith("/v1/") && call.response.headers[HttpHeaders.CacheControl] == null) {
            call.response.header(HttpHeaders.CacheControl, "no-store")
        }
    }
}
