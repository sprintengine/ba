package ie.bookanything.site

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ColorContrastTest {
    /** Expected values computed with frontend/src/lib/theme/color.ts (byte-for-byte parity). */
    @Test
    fun `matches the frontend colour functions`() {
        assertEquals("#a4922e", ColorContrast.ensureContrast("#fde047", "#ffffff", 3.0))
        assertEquals("#7f7024", ColorContrast.ensureContrast("#fde047", "#ffffff", 4.5))
        assertEquals("#1a9eb3", ColorContrast.ensureContrast("#22d3ee", "#ffffff", 3.0))
        assertEquals("#0f766e", ColorContrast.ensureContrast("#0F766E", "#ffffff", 3.0), "a passing colour is returned normalized")
        assertEquals("#8c8c8c", ColorContrast.ensureContrast("#ffffff", "#ffffff", 3.0))
        assertEquals("#8e8c8b", ColorContrast.ensureContrast("#1c1917", "#1c1917", 4.5), "dark backgrounds push toward white")
        assertEquals("#a3e635", ColorContrast.ensureContrast("#a3e635", "#0c0a09", 4.5))
        assertEquals("#808080", ColorContrast.mix("#000000", "#ffffff", 0.5), "JS Math.round rounds halves up")
        assertEquals("#0a4d48", ColorContrast.mix("#0f766e", "#000000", 0.35))
        assertEquals(17.488342, ColorContrast.contrastRatio("#1c1917", "#ffffff"), 1e-6)
        assertEquals(3.033470, ColorContrast.contrastRatio("#949494", "#ffffff"), 1e-6)
        assertEquals(4.542225, ColorContrast.contrastRatio("#767676", "#ffffff"), 1e-6)
        assertEquals(21.0, ColorContrast.contrastRatio("#000000", "#fff"), 1e-9)
    }

    @Test
    fun `hex parsing and normalization`() {
        assertEquals("#aabbcc", ColorContrast.normalize("#ABC"))
        assertEquals("#0f766e", ColorContrast.normalize("0F766E"))
        assertNull(ColorContrast.normalize("teal"))
        assertNull(ColorContrast.normalize(null))
        assertNull(ColorContrast.normalize("#12345"))
    }

    @Test
    fun `primary and accent rules with helpful messages`() {
        assertNull(ColorContrast.primaryProblem("#0f766e"))
        assertEquals(
            "Too light for buttons on a white page (1.8:1, needs 3:1). Choose a darker shade.", ColorContrast.primaryProblem("#22d3ee"),
        )
        assertTrue(ColorContrast.primaryProblem("#777777")!!.contains("hard to read (4.4:1, needs 4.5:1)"))
        assertNull(ColorContrast.accentProblem("#9a6b3f"))
        assertNotNull(ColorContrast.accentProblem("#fde047"))
    }

    @Test
    fun `compliant colours always pass the rules`() {
        val samples = listOf("#ffffff", "#fde047", "#22d3ee", "#a3e635", "#777777", "#f472b6", "#4f46e5", "#000000", "#0f766e", "#ea580c")
        samples.forEach { c ->
            assertNull(ColorContrast.primaryProblem(ColorContrast.compliantPrimary(c)), "primary from $c")
            assertNull(ColorContrast.accentProblem(ColorContrast.compliantAccent(c)), "accent from $c")
        }
        assertEquals("#0f766e", ColorContrast.compliantPrimary("#0f766e"), "compliant colours are kept")
        SiteTheme.entries.mapNotNull(SiteThemes::accent).forEach { assertNull(ColorContrast.accentProblem(it), it) }
    }
}
