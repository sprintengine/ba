package ie.bookanything.ai

import kotlinx.serialization.json.Json

/** The two ways we read JSON that a model or an AI client wrote. */
object AiJson {
    /**
     * Tool arguments (Bo's tools, MCP tools): decoded strictly into the tool's typed input. Unknown arguments, wrong
     * types and missing required ones are refused, so a confused model gets an error it can correct, never a guess.
     */
    val toolArguments = Json { ignoreUnknownKeys = false; isLenient = false; coerceInputValues = false; explicitNulls = false }

    /**
     * Structured model output (business draft, site builder): read leniently (unknown keys ignored, invalid values
     * coerced to the defaults), then repaired and validated like user input.
     */
    val modelOutput = Json { ignoreUnknownKeys = true; coerceInputValues = true; isLenient = true; explicitNulls = false }
}
