package ie.bookanything.notifications

import ie.bookanything.notifications.EmailTemplates.Content

/**
 * The HTML version of an email: table-based with inline styles (works in Gmail, Outlook and Apple Mail), at most
 * 560px wide and fluid below that, in the business's colour. Every value is escaped.
 */
object EmailHtml {
    private const val FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

    /** The brand colour and the text colour that reads on it. */
    private class Colors(val brand: String, val onBrand: String)

    fun render(brand: EmailBrand, c: Content): String {
        val color = safeColor(brand.primaryColor)
        val colors = Colors(color, if (isLight(color)) "#111827" else "#ffffff")
        return buildString {
            open(c)
            header(brand, colors)
            body(c)
            details(c.details)
            c.callout?.let { callout(it, colors) }
            c.button?.let { (label, url) -> button(label, url, colors) }
            c.secondaryLink?.let { (label, url) -> secondaryLink(label, url, colors) }
            closing(c.closing)
            contact(brand)
            close(brand, c)
        }
    }

    /** Document head, the hidden preheader (the inbox preview line) and the outer tables. */
    private fun StringBuilder.open(c: Content) {
        append("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">")
        append("<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"color-scheme\" content=\"light\">")
        append("<title>").append(esc(c.subject)).append("</title></head>")
        append("<body style=\"margin:0;padding:0;background:#f4f5f7;font-family:$FONT;color:#111827;-webkit-text-size-adjust:100%\">")
        append(
            "<div style=\"display:none;max-height:0;overflow:hidden;opacity:0;color:transparent\">",
        ).append(esc(c.preheader)).append("</div>")
        append(
            "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#f4f5f7\"><tr><td " +
                "align=\"center\" style=\"padding:24px 12px\">",
        )
        append(
            "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" " +
                "style=\"max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb\">",
        )
    }

    /** The business's logo (https only) or name on its colour. */
    private fun StringBuilder.header(brand: EmailBrand, colors: Colors) {
        append("<tr><td style=\"background:${colors.brand};padding:20px 28px\">")
        val logo = brand.logoUrl?.takeIf { it.startsWith("https://") }
        if (logo != null) {
            append("<img src=\"").append(esc(logo)).append("\" alt=\"").append(esc(brand.businessName))
                .append("\" height=\"40\" style=\"display:block;height:40px;max-width:200px;border:0\">")
        } else {
            append("<div style=\"font-size:18px;font-weight:600;color:${colors.onBrand}\">")
            append(esc(brand.businessName)).append("</div>")
        }
        append("</td></tr>")
    }

    private fun StringBuilder.body(c: Content) {
        append("<tr><td style=\"padding:28px 28px 8px\">")
        append(
            "<h1 style=\"margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:700;color:#111827\">",
        ).append(esc(c.headline)).append("</h1>")
        c.paragraphs.forEach {
            append("<p style=\"margin:0 0 14px;font-size:15px;line-height:1.6;color:#374151\">").append(esc(it)).append("</p>")
        }
        append("</td></tr>")
    }

    /** The booking details as a two-column table. */
    private fun StringBuilder.details(details: List<Pair<String, String>>) {
        if (details.isEmpty()) return
        append(
            "<tr><td style=\"padding:4px 28px 8px\"><table role=\"presentation\" width=\"100%\" cellpadding=\"0\" " +
                "cellspacing=\"0\" style=\"background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px\">",
        )
        details.forEachIndexed { i, (k, v) ->
            val border = if (i < details.size - 1) "border-bottom:1px solid #eef0f3;" else ""
            append(
                "<tr><td style=\"${border}padding:10px 14px;font-size:13px;color:#6b7280;width:32%;vertical-align:top\">",
            ).append(esc(k)).append("</td>")
            append(
                "<td style=\"${border}padding:10px 14px;font-size:14px;color:#111827;font-weight:500;vertical-align:top\">",
            ).append(esc(v)).append("</td></tr>")
        }
        append("</table></td></tr>")
    }

    private fun StringBuilder.callout(text: String, colors: Colors) {
        append(
            "<tr><td style=\"padding:12px 28px 0\"><div style=\"border-left:4px solid ${colors.brand};background:#f9fafb;padding:12px " +
                "14px;font-size:14px;line-height:1.5;color:#374151;border-radius:0 8px 8px 0\">",
        )
        append(esc(text)).append("</div></td></tr>")
    }

    /** The main action, with the link spelled out for clients that hide buttons. */
    private fun StringBuilder.button(label: String, url: String, colors: Colors) {
        append(
            "<tr><td style=\"padding:24px 28px 4px\"><table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\"><tr><td " +
                "style=\"border-radius:8px;background:${colors.brand}\">",
        )
        append("<a href=\"").append(esc(url)).append(
            "\" style=\"display:inline-block;padding:12px " +
                "22px;font-size:15px;font-weight:600;color:${colors.onBrand};text-decoration:none;border-radius:8px\">",
        )
        append(esc(label)).append("</a></td></tr></table>")
        append("<p style=\"margin:10px 0 0;font-size:12px;line-height:1.5;color:#9ca3af;word-break:break-all\">Or open this link: ")
        append("<a href=\"").append(esc(url)).append("\" style=\"color:#6b7280\">").append(esc(url)).append("</a></p></td></tr>")
    }

    private fun StringBuilder.secondaryLink(label: String, url: String, colors: Colors) {
        append(
            "<tr><td style=\"padding:12px 28px 0;font-size:14px\"><a href=\"",
        ).append(esc(url)).append("\" style=\"color:${colors.brand};font-weight:600\">")
        append(esc(label)).append("</a></td></tr>")
    }

    private fun StringBuilder.closing(paragraphs: List<String>) {
        if (paragraphs.isEmpty()) return
        append("<tr><td style=\"padding:16px 28px 0\">")
        paragraphs.forEach {
            append("<p style=\"margin:0 0 12px;font-size:14px;line-height:1.6;color:#374151\">").append(esc(it)).append("</p>")
        }
        append("</td></tr>")
    }

    /** The business's name and contact details. */
    private fun StringBuilder.contact(brand: EmailBrand) {
        append(
            "<tr><td style=\"padding:20px 28px 24px\"><div style=\"border-top:1px solid " +
                "#e5e7eb;padding-top:16px;font-size:13px;line-height:1.6;color:#6b7280\">",
        )
        append("<strong style=\"color:#374151\">").append(esc(brand.businessName)).append("</strong>")
        brand.contactLine?.let { append("<br>").append(esc(it)) }
        brand.address?.let { append("<br>").append(esc(it)) }
        append("</div></td></tr>")
    }

    /** The footer note under the card, and the closing tags. */
    private fun StringBuilder.close(brand: EmailBrand, c: Content) {
        append("</table>")
        append("<p style=\"max-width:560px;margin:16px auto 0;font-size:12px;line-height:1.5;color:#9ca3af;text-align:center\">")
        append(esc(c.footerNote))
        if (brand !=
            EmailTemplates.PLATFORM_BRAND
        ) {
            append("<br>Sent by bookanything on behalf of ").append(esc(brand.businessName)).append(".")
        }
        append("</p>")
        append("</td></tr></table></body></html>")
    }

    fun safeColor(raw: String) = raw.takeIf { Regex("^#[0-9a-fA-F]{6}$").matches(it) }?.lowercase() ?: "#4f46e5"

    /** Relative luminance above ~0.5 means dark text reads better on the brand colour. */
    fun isLight(hex: String): Boolean {
        val c = hex.removePrefix("#")
        fun ch(i: Int): Double {
            val v = c.substring(i, i + 2).toInt(16) / 255.0
            return if (v <= 0.03928) v / 12.92 else Math.pow((v + 0.055) / 1.055, 2.4)
        }
        val l = 0.2126 * ch(0) + 0.7152 * ch(2) + 0.0722 * ch(4)
        return l > 0.45
    }

    fun esc(s: String) = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&#39;")
}
