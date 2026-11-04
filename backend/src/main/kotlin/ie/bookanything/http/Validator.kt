package ie.bookanything.http

import java.time.LocalTime
import java.time.ZoneId
import java.util.Currency
import java.util.UUID

/** Accumulates field errors; call [throwIfInvalid] to raise a single 400 with all of them. */
class Validator(private val prefix: String = "") {
    private val errors = LinkedHashMap<String, String>()
    private var timezoneError = false

    val isValid get() = errors.isEmpty()

    fun error(field: String, message: String) {
        errors.putIfAbsent(prefix + field, message)
    }

    fun check(condition: Boolean, field: String, message: String) {
        if (!condition) error(field, message)
    }

    fun nested(prefix: String) = Validator(this.prefix + prefix).also { children.add(it) }
    private val children = mutableListOf<Validator>()

    /** Every field problem collected so far (including nested validators). */
    fun errors(): Map<String, String> = all()

    private fun all(): Map<String, String> {
        val out = LinkedHashMap(errors)
        children.forEach { out.putAll(it.all()) }
        return out
    }

    fun requireText(value: String?, field: String, max: Int = 200, required: Boolean = true): String? {
        val v = value?.trim()
        if (v.isNullOrEmpty()) {
            if (required) error(field, "Required")
            return null
        }
        if (v.length > max) error(field, "Must be at most $max characters")
        if (v.any { it.isISOControl() && it != '\n' && it != '\r' && it != '\t' }) error(field, "Contains invalid characters")
        return v
    }

    fun range(value: Int?, field: String, min: Int, max: Int) {
        if (value != null && (value < min || value > max)) error(field, "Must be between $min and $max")
    }

    fun time(raw: String?, field: String, required: Boolean = true): LocalTime? {
        if (raw == null) {
            if (required) error(field, "Required")
            return null
        }
        return try { parseTime(raw, field) } catch (_: ApiException) { error(field, "Must be a time in HH:mm format"); null }
    }

    fun date(raw: String?, field: String): java.time.LocalDate? {
        if (raw == null) return null
        return try { parseDate(raw, field) } catch (_: ApiException) { error(field, "Must be a date in YYYY-MM-DD format"); null }
    }

    fun uuid(raw: String?, field: String): UUID? {
        if (raw == null) return null
        return parseUuidOrNull(raw) ?: run { error(field, "Must be a valid id"); null }
    }

    fun uuids(raw: List<String>?, field: String): List<UUID> =
        raw.orEmpty().mapIndexedNotNull { i, s -> uuid(s, "$field[$i]") }.distinct()

    fun <T> oneOf(raw: String?, field: String, allowed: Set<String>, required: Boolean = true, map: (String) -> T): T? {
        if (raw == null) {
            if (required) error(field, "Required")
            return null
        }
        if (raw !in allowed) {
            error(field, "Must be one of: ${allowed.joinToString(", ")}")
            return null
        }
        return map(raw)
    }

    fun color(raw: String?, field: String, required: Boolean = true): String? {
        if (raw == null) {
            if (required) error(field, "Required")
            return null
        }
        if (!COLOR.matches(raw)) { error(field, "Must be a hex colour like #4f46e5"); return null }
        return raw.lowercase()
    }

    fun email(raw: String?, field: String, required: Boolean): String? {
        val v = raw?.trim()
        if (v.isNullOrEmpty()) {
            if (required) error(field, "Required")
            return null
        }
        if (v.length > 254 || !EMAIL.matches(v)) { error(field, "Must be a valid email address"); return null }
        return v
    }

    fun phone(raw: String?, field: String, required: Boolean): String? {
        val v = raw?.trim()
        if (v.isNullOrEmpty()) {
            if (required) error(field, "Required")
            return null
        }
        if (!PHONE.matches(v)) { error(field, "Must be a valid phone number"); return null }
        return v
    }

    fun url(raw: String?, field: String): String? {
        val v = raw?.trim()
        if (v.isNullOrEmpty()) return null
        if (v.length > 500 || !(v.startsWith("https://") || v.startsWith("http://")) || v.any { it.isWhitespace() }) {
            error(field, "Must be an http(s) URL"); return null
        }
        return v
    }

    fun zone(raw: String?, field: String): ZoneId? = try {
        parseZone(raw, field)
    } catch (e: ApiException) {
        if (e.code == "INVALID_TIMEZONE") timezoneError = true
        error(field, if (raw.isNullOrBlank()) "Required" else "Unknown timezone")
        null
    }

    fun currency(raw: String?, field: String): String? {
        if (raw == null || raw.length != 3 || raw.uppercase() != raw) { error(field, "Must be an ISO 4217 code like EUR"); return null }
        return try { Currency.getInstance(raw).currencyCode } catch (e: IllegalArgumentException) { error(field, "Unknown currency"); null }
    }

    fun country(raw: String?, field: String): String? {
        if (raw == null || !Regex("^[A-Z]{2}$").matches(raw)) { error(field, "Must be an ISO 3166 country code like IE"); return null }
        return raw
    }

    fun locale(raw: String?, field: String): String? {
        if (raw == null || !Regex("^[a-z]{2,3}(-[A-Z]{2})?$").matches(raw)) { error(field, "Must be a locale like en-IE"); return null }
        return raw
    }

    fun throwIfInvalid(message: String = "Please fix the highlighted fields.") {
        val all = all()
        if (all.isNotEmpty()) {
            if (timezoneError && all.size == 1) throw Errors.invalidTimezone(all.keys.single())
            throw Errors.invalid(message, all)
        }
    }

    companion object {
        val COLOR = Regex("^#[0-9a-fA-F]{6}$")
        val EMAIL = Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")
        val PHONE = Regex("^\\+?[0-9 ()\\-]{6,20}$")
    }
}

inline fun validate(block: Validator.() -> Unit) {
    val v = Validator()
    v.block()
    v.throwIfInvalid()
}
