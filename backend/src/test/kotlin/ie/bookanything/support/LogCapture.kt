package ie.bookanything.support

import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import org.slf4j.LoggerFactory

/** Collects what one class logs while a test runs; [close] detaches it. */
class LogCapture private constructor(private val logger: Logger) : AutoCloseable {
    private val appender = ListAppender<ILoggingEvent>().also { it.start(); logger.addAppender(it) }

    fun messages(): List<String> = appender.list.toList().map { it.formattedMessage }

    override fun close() {
        logger.detachAppender(appender)
        appender.stop()
    }

    companion object {
        fun of(type: Class<*>) = LogCapture(LoggerFactory.getLogger(type) as Logger)
    }
}
