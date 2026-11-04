package ie.bookanything.support

import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.runInterruptible
import java.util.concurrent.Callable
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** How long a racer waits for the others at the start line, and for the whole race. */
private const val BARRIER_SECONDS = 20L
private const val RACE_SECONDS = 120L

/**
 * Runs [n] copies of [block] on their own threads, released together by a barrier so they really overlap (blocking
 * work: job workers, the credit meter, raw transactions). Returns the results in order; any failure is rethrown.
 */
fun <T> inParallel(n: Int, block: (Int) -> T): List<T> {
    val barrier = CyclicBarrier(n)
    val pool = Executors.newFixedThreadPool(n)
    try {
        val futures = (0 until n).map { i ->
            pool.submit(
                Callable {
                    barrier.await(BARRIER_SECONDS, TimeUnit.SECONDS)
                    block(i)
                },
            )
        }
        return futures.map { it.get(RACE_SECONDS, TimeUnit.SECONDS) }
    } finally {
        pool.shutdownNow()
    }
}

/** A finished HTTP call of a race: its status and body (read inside the race, while the response is alive). */
data class Outcome(val status: HttpStatusCode, val body: String) {
    val errorCode: String? get() = Regex("\"code\"\\s*:\\s*\"([A-Z_]+)\"").find(body)?.groupValues?.get(1)
}

/**
 * Sends [n] requests at once through the test client: each runs on Dispatchers.IO and waits at a barrier first, so
 * the requests overlap in the server and in Postgres.
 */
suspend fun race(n: Int, request: suspend (Int) -> HttpResponse): List<Outcome> = coroutineScope {
    val barrier = CyclicBarrier(n)
    (0 until n).map { i ->
        async(Dispatchers.IO) {
            runInterruptible { barrier.await(BARRIER_SECONDS, TimeUnit.SECONDS) }
            request(i).let { Outcome(it.status, it.bodyAsText()) }
        }
    }.awaitAll()
}
