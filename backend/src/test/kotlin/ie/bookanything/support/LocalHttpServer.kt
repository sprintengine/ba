package ie.bookanything.support

import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.util.concurrent.CopyOnWriteArrayList

/** A loopback HTTP server for client tests (no external network). */
class LocalHttpServer(handler: (Request) -> Response) : AutoCloseable {
    data class Request(val method: String, val path: String, val query: String?, val headers: Map<String, String>, val body: ByteArray)
    data class Response(
        val status: Int,
        val body: String = "",
        val contentType: String = "application/json",
        val headers: Map<String, String> = emptyMap(),
    )

    val requests = CopyOnWriteArrayList<Request>()
    private val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply {
        createContext("/") { ex ->
            val req = Request(
                ex.requestMethod, ex.requestURI.rawPath, ex.requestURI.rawQuery,
                ex.requestHeaders.entries.associate { it.key.lowercase() to it.value.joinToString(",") }, ex.requestBody.readAllBytes(),
            )
            requests += req
            val res = handler(req)
            val bytes = res.body.toByteArray()
            ex.responseHeaders.add("Content-Type", res.contentType)
            res.headers.forEach { (name, value) -> ex.responseHeaders.add(name, value) }
            ex.sendResponseHeaders(res.status, if (bytes.isEmpty()) -1 else bytes.size.toLong())
            if (bytes.isNotEmpty()) ex.responseBody.use { it.write(bytes) }
            ex.close()
        }
        start()
    }

    val baseUrl: String get() = "http://127.0.0.1:${server.address.port}"

    override fun close() = server.stop(0)
}
