package ie.bookanything.site

/**
 * The small rule-based interpreter for conversational edits used without an AI model (section 15.6):
 * theme names and mood words, "move X higher/lower/to the top", "hide/show X", "add a FAQ about Y"
 * and headline changes with quoted text. Pure: the plan and instruction in, the edited plan out.
 */
object SiteRuleEditor {
    data class Result(val plan: SitePlan, val applied: List<String>, val notes: List<String>)

    const val HELP = "Without the AI assistant I understand requests like \"make it calmer\", \"use the bold theme\", " +
        "\"move reviews higher\", \"hide the team\", \"show the FAQ\", \"add a FAQ about parking\" and " +
        "\"change the headline to 'Welcome in'\"."

    fun apply(plan: SitePlan, instruction: String, inputs: SiteInputs): Result {
        val edit = RuleEdit(plan, inputs)
        var text = instruction.trim()
        text = edit.headline(text)
        text = edit.faqAbout(text)
        val lower = text.lowercase()
        edit.showOrAdd(lower)
        edit.hide(lower)
        edit.move(lower)
        edit.theme(lower)
        return Result(edit.plan(), edit.applied, edit.notes)
    }
}

private enum class MoveDirection { UP, DOWN, TOP, BOTTOM, ABOVE, BELOW }

private class RuleEdit(private val original: SitePlan, private val inputs: SiteInputs) {
    private var theme = original.theme
    private var palette = original.palette
    private val sections = original.sections.toMutableList()
    val applied = ArrayList<String>()
    val notes = ArrayList<String>()
    private val aliases = SectionAliases(inputs)
    private val defaults get() = SectionDefaults.Context(inputs, theme)

    fun plan() = original.copy(theme = theme, palette = palette, sections = sections.toList())

    // ---- headline ----

    private val quotedHeadline = Regex("(?i)\\b(?:headline|main heading|title)\\b[^\"“”'‘’]{0,20}?[\"“”'‘’](.+?)[\"“”'‘’]")
    private val plainHeadline = Regex("(?i)\\b(?:headline|main heading|title)\\s+(?:to|as)\\s+(.+)$")

    fun headline(text: String): String {
        val m = quotedHeadline.find(text) ?: plainHeadline.find(text) ?: return text
        val value = SiteText.clean(m.groupValues[1].trim().trimEnd('.', '!', ' '), multiline = false)?.let { SiteText.truncate(it, 90) }
        if (!value.isNullOrEmpty()) {
            val i = sections.indexOfFirst { it.type == SectionType.HERO }
            if (i >= 0) {
                val hero = sections[i].content as HeroContent
                if (hero.headline != value) sections[i] = sections[i].copy(content = hero.copy(headline = value))
            } else {
                val hero = SectionRegistry.spec(SectionType.HERO).defaultSection(defaults, PlanSections.uniqueId(sections, "hero"))
                sections.add(0, hero.copy(content = (hero.content as HeroContent).copy(headline = value)))
            }
            applied += "changed the headline"
        }
        return text.removeRange(m.range)
    }

    // ---- "add a FAQ about parking" ----

    private val faqAbout = Regex(
        "(?i)\\b(?:add|include|create|answer|put in)\\s+(?:a\\s+|an\\s+|another\\s+|one\\s+more\\s+)?(?:faq|frequently asked " +
            "question|question|q&a)(?:\\s+(?:item|entry))?\\s+(?:about|on|for|regarding|covering)\\s+([^.,;!?\\n]+)",
    )
    private val topicEnd = Regex("(?i)\\s+(?:and|then)\\s+(?:move|hide|show|add|make|use|change|remove|put|switch)\\b.*$")

    fun faqAbout(text: String): String {
        val m = faqAbout.find(text) ?: return text
        val group = m.groups[1]!!
        // "… about parking and move reviews higher": the topic ends where the next command starts.
        val topicLength = topicEnd.find(group.value)?.range?.first ?: group.value.length
        val rest = text.removeRange(m.range.first, group.range.first + topicLength)
        val topic = SiteText.clean(group.value.take(topicLength), multiline = false)?.let { SiteText.truncate(it, 60) }
        if (topic.isNullOrEmpty()) return rest
        val item = FaqItem(SiteText.truncate("Can you tell me about $topic?", 140), "Get in touch and we'll be happy to help with $topic.")
        if (CopyGuard.flags(item.question) || CopyGuard.flags(item.answer)) {
            notes += "I can't add that question automatically; add it in the FAQ section instead."
            return rest
        }
        var i = sections.indexOfFirst { it.type == SectionType.FAQ }
        if (i < 0) {
            i = PlanSections.insertIndex(sections, SectionType.FAQ)
            sections.add(i, SectionRegistry.spec(SectionType.FAQ).defaultSection(defaults, PlanSections.uniqueId(sections, "faq")))
        }
        val faq = sections[i].content as FaqContent
        when {
            faq.items.any { it.question.equals(item.question, ignoreCase = true) } -> notes += "There's already a question about $topic."
            faq.items.size >= 12 -> notes += "The FAQ already has 12 questions, the most it can hold."
            else -> {
                sections[i] = sections[i].copy(enabled = true, content = faq.copy(items = faq.items + item))
                applied += "added a question about $topic"
            }
        }
        return rest
    }

    // ---- show / hide ----

    private val showVerbs = "(?:show|add|enable|turn on|include|bring back|display|put back|unhide)"
    private val hideVerbs = "(?:hide|remove|disable|delete|drop|turn off|get rid of|take out|take away)"
    private val article = "(?:a\\s+|an\\s+|the\\s+|our\\s+|my\\s+|some\\s+|all\\s+)?"

    fun showOrAdd(text: String) {
        Regex("\\b$showVerbs\\s+$article(${aliases.pattern})(?:\\s+section)?\\b").findAll(text).forEach { m ->
            val type = aliases.type(m.groupValues[1]) ?: return@forEach
            val matching = sections.withIndex().filter { it.value.type == type }
            if (matching.isEmpty()) {
                val section = SectionRegistry.spec(type).defaultSection(defaults, PlanSections.uniqueId(sections, type.key))
                sections.add(PlanSections.insertIndex(sections, type), section)
                applied += "added the ${type.label} section"
                if (type == SectionType.TESTIMONIALS) notes += "Testimonials appear once you've added some in the editor."
                return@forEach
            }
            if (type == SectionType.TESTIMONIALS && matching.all { (it.value.content as TestimonialsContent).items.isEmpty() }) {
                notes += "Testimonials appear once you've added some in the editor."
                return@forEach
            }
            matching.filter { !it.value.enabled }.forEach { sections[it.index] = it.value.copy(enabled = true) }
            if (matching.any { !it.value.enabled }) applied += "showed ${type.label}"
        }
    }

    fun hide(text: String) {
        Regex("\\b$hideVerbs\\s+$article(${aliases.pattern})(?:\\s+section)?\\b").findAll(text).forEach { m ->
            val type = aliases.type(m.groupValues[1]) ?: return@forEach
            val matching = sections.withIndex().filter { it.value.type == type && it.value.enabled }
            matching.forEach { sections[it.index] = it.value.copy(enabled = false) }
            if (matching.isNotEmpty()) applied += "hid ${type.label}"
        }
    }

    // ---- moves ----

    private val directions = "(to the top|at the top|to the start|first|higher up|higher|further up|up|to the bottom|at the bottom|to " +
        "the end|last|lower down|lower|further down|down|above|below|before|after)"

    fun move(text: String) {
        val verbMove = Regex(
            "\\b(?:move|put|bring|place|shift|push)\\s+(?:the\\s+|our\\s+|my\\s+)?(${aliases.pattern})(?:\\s+section)?\\s+$directions(?:\\s+(?:the\\s+|our\\s+)?(${aliases.pattern}))?",
        )
        val bareMove = Regex("\\b(${aliases.pattern})(?:\\s+section)?\\s+(higher|lower|first|last)\\b")
        val handled = ArrayList<IntRange>()
        verbMove.findAll(text).forEach { m ->
            handled += m.range
            moveSection(m.groupValues[1], m.groupValues[2], m.groupValues[3].ifEmpty { null })
        }
        bareMove.findAll(text).filter { m -> handled.none { it.first <= m.range.first && m.range.last <= it.last } }
            .forEach { m -> moveSection(m.groupValues[1], m.groupValues[2], null) }
    }

    private fun direction(word: String): MoveDirection = when (word) {
        "to the top", "at the top", "to the start", "first" -> MoveDirection.TOP
        "higher up", "higher", "further up", "up" -> MoveDirection.UP
        "to the bottom", "at the bottom", "to the end", "last" -> MoveDirection.BOTTOM
        "above", "before" -> MoveDirection.ABOVE
        "below", "after" -> MoveDirection.BELOW
        else -> MoveDirection.DOWN
    }

    private fun moveSection(alias: String, directionWord: String, targetAlias: String?) {
        val type = aliases.type(alias) ?: return
        val from = sections.indexOfFirst { it.type == type }
        if (from < 0) { notes += "There's no ${type.label} section to move."; return }
        val dir = direction(directionWord)
        val heroFirst = sections.firstOrNull()?.type == SectionType.HERO && type != SectionType.HERO
        val top = if (heroFirst) 1 else 0
        val to = when (dir) {
            MoveDirection.UP -> maxOf(top, from - 1)
            MoveDirection.DOWN -> minOf(sections.size - 1, from + 1)
            MoveDirection.TOP -> top
            MoveDirection.BOTTOM -> sections.size - 1
            MoveDirection.ABOVE, MoveDirection.BELOW -> {
                val targetType = targetAlias?.let(aliases::type) ?: return
                val target = sections.indexOfFirst { it.type == targetType }.takeIf { it >= 0 } ?: return
                val insert = if (dir == MoveDirection.ABOVE) target else target + 1
                maxOf(top, if (from < insert) insert - 1 else insert)
            }
        }
        if (to == from) return
        sections.add(to, sections.removeAt(from))
        applied += "moved ${type.label} ${if (to < from) "up" else "down"}"
    }

    // ---- theme ----

    fun theme(text: String) {
        val next = SiteThemes.fromInstruction(text) ?: return
        if (next == theme) { notes += "Your site already uses the ${next.label} theme."; return }
        val previous = theme
        theme = next
        // Choices that were the old theme's defaults follow the new theme; the owner's own choices stay.
        if (palette.accent == SiteThemes.accent(previous)?.let(ColorContrast::compliantAccent)) {
            palette = palette.copy(accent = SiteThemes.accent(next)?.let(ColorContrast::compliantAccent))
        }
        sections.replaceAll { s -> s.copy(content = followTheme(s.content, previous, next)) }
        applied += "switched to the ${next.label} theme"
    }

    private fun followTheme(c: SectionContent, previous: SiteTheme, next: SiteTheme): SectionContent {
        fun image(i: SiteImage?) = if (i?.kind == ImageKind.GENERATED && i.pattern == SiteThemes.pattern(previous)) {
            i.copy(
                pattern = SiteThemes.pattern(next),
            )
        } else {
            i
        }
        return when (c) {
            is HeroContent -> c.copy(
                variant = if (c.variant == SiteThemes.heroVariant(previous)) SiteThemes.heroVariant(next) else c.variant,
                image = image(c.image),
            )
            is AboutContent -> c.copy(image = image(c.image))
            else -> c
        }
    }
}

/** Words owners use for each section ("reviews", "opening hours", the business's own word for its people). */
private class SectionAliases(inputs: SiteInputs) {
    private val byAlias: Map<String, SectionType> = buildMap {
        fun add(type: SectionType, vararg words: String) = words.forEach { put(it, type) }
        add(SectionType.TESTIMONIALS, "testimonials", "testimonial", "reviews", "review", "quotes")
        add(SectionType.FAQ, "frequently asked questions", "faqs", "faq", "questions", "q&a")
        add(SectionType.SERVICES, "services", "service", "treatments", "price list")
        add(SectionType.TEAM, "team", "staff", "people", "team members")
        add(SectionType.ABOUT, "about us", "about section", "about", "our story", "story")
        add(SectionType.GALLERY, "gallery", "photos", "pictures", "images")
        add(SectionType.HOURS, "opening hours", "opening times", "hours", "location", "map")
        add(SectionType.CONTACT, "contact details", "contact info", "contact us", "contact")
        add(SectionType.CTA, "call to action", "cta", "booking banner")
        add(SectionType.HERO, "hero", "header", "banner", "top section")
        if (inputs.team.isNotEmpty()) {
            val v = inputs.business.vocabulary
            listOf(v.resources, v.resource).map { it.trim().lowercase() }.filter {
                it.length >= 3 && it !in this
            }.forEach { put(it, SectionType.TEAM) }
        }
    }

    /** Longest aliases first so "opening hours" wins over "hours". */
    val pattern: String = byAlias.keys.sortedByDescending { it.length }.joinToString("|") { Regex.escape(it) }

    fun type(alias: String): SectionType? = byAlias[alias.lowercase()]
}
