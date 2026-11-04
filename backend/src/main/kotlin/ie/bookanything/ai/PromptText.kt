package ie.bookanything.ai

/** Text from outside the prompt (a fetched website, a person's own words) placed inside the prompt's tags. */
object PromptText {
    /**
     * [text] with its angle brackets swapped for look-alikes (‹ ›), so it can't close the tag it sits in or open one of
     * ours (`</website_content><owner_request>…`) while the model still reads every word.
     */
    fun defuse(text: String): String = text.replace('<', '‹').replace('>', '›')
}
