package ie.bookanything.site

import kotlin.math.pow

/**
 * WCAG 2.x colour contrast, a port of `frontend/src/lib/theme/color.ts` so the server accepts
 * exactly the palettes the frontend can render readably. sRGB `#rrggbb` in and out.
 */
object ColorContrast {
    const val WHITE = "#ffffff"
    const val INK = "#1c1917"

    /** Buttons and links on a light page. */
    const val MIN_SURFACE_CONTRAST = 3.0

    /** Text on a solid brand-coloured button. */
    const val MIN_TEXT_CONTRAST = 4.5

    private val HEX = Regex("^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")

    data class Rgb(val r: Int, val g: Int, val b: Int)

    fun isHex(value: String?): Boolean = value != null && HEX.matches(value.trim())

    fun parse(hex: String): Rgb {
        var h = HEX.find(hex.trim())?.groupValues?.get(1) ?: throw IllegalArgumentException("Invalid hex colour: $hex")
        if (h.length == 3) h = h.map { "$it$it" }.joinToString("")
        return Rgb(h.substring(0, 2).toInt(16), h.substring(2, 4).toInt(16), h.substring(4, 6).toInt(16))
    }

    /** JS `Math.round` semantics (half up), matching the frontend byte for byte. */
    private fun channelHex(n: Double): String = Math.round(n.coerceIn(0.0, 255.0)).toInt().toString(16).padStart(2, '0')

    fun toHex(r: Double, g: Double, b: Double): String = "#${channelHex(r)}${channelHex(g)}${channelHex(b)}"

    fun normalize(value: String?): String? = if (!isHex(value)) {
        null
    } else {
        parse(value!!).let {
            toHex(it.r.toDouble(), it.g.toDouble(), it.b.toDouble())
        }
    }

    private fun channel(v: Int): Double {
        val s = v / 255.0
        return if (s <= 0.03928) s / 12.92 else ((s + 0.055) / 1.055).pow(2.4)
    }

    fun luminance(hex: String): Double {
        val c = parse(hex)
        return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b)
    }

    fun contrastRatio(a: String, b: String): Double {
        val la = luminance(a)
        val lb = luminance(b)
        val hi = maxOf(la, lb)
        val lo = minOf(la, lb)
        return (hi + 0.05) / (lo + 0.05)
    }

    /** Linear sRGB-space mix: amount 0 → a, 1 → b. */
    fun mix(a: String, b: String, amount: Double): String {
        val x = parse(a)
        val y = parse(b)
        val t = amount.coerceIn(0.0, 1.0)
        return toHex(x.r + (y.r - x.r) * t, x.g + (y.g - x.g) * t, x.b + (y.b - x.b) * t)
    }

    /** Nudges [color] toward black (or white) until it reaches [ratio] against [against]. */
    fun ensureContrast(color: String, against: String, ratio: Double): String {
        if (contrastRatio(color, against) >= ratio) return normalize(color)!!
        val target = if (luminance(against) > 0.5) "#000000" else "#ffffff"
        for (i in 1..20) {
            val candidate = mix(color, target, i * 0.05)
            if (contrastRatio(candidate, against) >= ratio) return candidate
        }
        return target
    }

    /** Contrast of the best text colour (white or ink) on [bg]. */
    fun textContrast(bg: String): Double = maxOf(contrastRatio(bg, WHITE), contrastRatio(bg, INK))

    /** Why [primary] is not usable as the brand colour, or null when it is. */
    fun primaryProblem(primary: String): String? {
        val onWhite = contrastRatio(primary, WHITE)
        if (onWhite < MIN_SURFACE_CONTRAST) {
            return "Too light for buttons on a white page (${fmt(onWhite)}:1, needs 3:1). Choose a darker shade."
        }
        val text = textContrast(primary)
        if (text < MIN_TEXT_CONTRAST) {
            return "Text on this colour would be hard to read (${fmt(text)}:1, needs 4.5:1). Choose a darker shade."
        }
        return null
    }

    /** Why [accent] is not usable, or null when it is. */
    fun accentProblem(accent: String): String? {
        val onWhite = contrastRatio(accent, WHITE)
        return if (onWhite <
            MIN_SURFACE_CONTRAST
        ) {
            "Too light to stand out on a white page (${fmt(onWhite)}:1, needs 3:1). Choose a darker shade."
        } else {
            null
        }
    }

    /** The closest compliant primary colour: darkened until it passes [primaryProblem]. */
    fun compliantPrimary(color: String): String {
        var c = ensureContrast(color, WHITE, MIN_SURFACE_CONTRAST)
        if (textContrast(c) < MIN_TEXT_CONTRAST) c = ensureContrast(c, WHITE, MIN_TEXT_CONTRAST)
        return c
    }

    fun compliantAccent(color: String): String = ensureContrast(color, WHITE, MIN_SURFACE_CONTRAST)

    /** One decimal, rounded down so a failing ratio never displays as the threshold (2.96 → 2.9). */
    private fun fmt(ratio: Double): String = (kotlin.math.floor(ratio * 10) / 10).toString()
}
