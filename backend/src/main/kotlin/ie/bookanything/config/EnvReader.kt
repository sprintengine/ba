package ie.bookanything.config

/**
 * Typed reads of environment variables. Values are trimmed and an empty value counts as unset; a value that doesn't
 * parse is a [ConfigException] naming the variable, so a bad deployment fails at startup.
 */
class EnvReader(private val env: Map<String, String>) {
    fun str(key: String): String? = env[key]?.trim()?.takeIf { it.isNotEmpty() }

    fun bool(key: String, default: Boolean): Boolean = when (str(key)?.lowercase()) {
        null -> default
        "true", "1", "yes" -> true
        "false", "0", "no" -> false
        else -> throw ConfigException("$key must be true or false.")
    }

    fun int(key: String, default: Int): Int =
        str(key)?.let { it.toIntOrNull() ?: throw ConfigException("$key must be an integer.") } ?: default

    /** A whole number ≥ 0. */
    fun long(key: String, default: Long): Long =
        str(key)?.let { raw -> raw.toLongOrNull()?.takeIf { it >= 0 } ?: throw ConfigException("$key must be a whole number ≥ 0.") }
            ?: default

    /** A comma-separated list: each entry trimmed, then [clean]ed; empty entries are dropped. Null when unset. */
    fun list(key: String, clean: (String) -> String = { it }): List<String>? =
        str(key)?.split(',')?.map { clean(it.trim()) }?.filter { it.isNotEmpty() }

    /** One of [choices] by lower-case name ([null] when unset), else a [ConfigException] with [message]. */
    fun <T> choice(key: String, choices: Map<String?, T>, message: String): T =
        choices.getOrElse(str(key)?.lowercase()) { throw ConfigException(message) }
}
