package ie.bookanything.support

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import org.slf4j.LoggerFactory

/** Collects what one class logs while a test runs; [close] detaches it. */
class LogCapture private constructor(private val logger: Logger, level: Level? = null) : AutoCloseable {
    private val appender = ListAppender<ILoggingEvent>().also { it.start(); logger.addAppender(it) }
    private val previousLevel = logger.level.also { if (level != null) logger.level = level }

    fun messages(): List<String> = appender.list.toList().map { it.formattedMessage }

    /** Each event's message with its MDC (request id, business, `simulation`…). */
    fun events(): List<Pair<String, Map<String, String>>> = appender.list.toList().map { it.formattedMessage to it.mdcPropertyMap }

    override fun close() {
        logger.detachAppender(appender)
        appender.stop()
        logger.level = previousLevel
    }

    companion object {
        fun of(type: Class<*>) = LogCapture(LoggerFactory.getLogger(type) as Logger)

        /**
         * Everything logged at [level] or above while it is open, whoever logs it (Ktor's request lines come from a logger the
         * test host names). The tests' configuration logs warnings only, so this lowers the root level until [close].
         */
        fun root(level: Level = Level.INFO) = LogCapture(LoggerFactory.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME) as Logger, level)
    }
}
