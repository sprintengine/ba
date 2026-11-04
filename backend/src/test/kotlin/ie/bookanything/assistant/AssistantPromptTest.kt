package ie.bookanything.assistant

import com.anthropic.core.jsonMapper
import ie.bookanything.ai.AnthropicMapping
import ie.bookanything.ai.ChatBlock
import ie.bookanything.ai.ChatMessage
import ie.bookanything.ai.ChatRole
import ie.bookanything.ai.ConverseRequest
import ie.bookanything.ai.Effort
import ie.bookanything.ai.fake.FakeTemplates
import ie.bookanything.assistant.tools.ToolRegistry
import ie.bookanything.auth.Role
import ie.bookanything.business.Vocabulary
import ie.bookanything.support.assertStrictSchema
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.time.Instant
import java.time.ZoneId
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class AssistantPromptTest {
    private val zone = ZoneId.of("Europe/Dublin")
    private val now = Instant.parse("2026-10-05T08:00:00Z")
    private val vocabulary = Vocabulary("Therapist", "Therapists", "Patient", "Patients", "Appointment", "Appointments")
    private fun facts(role: Role = Role.OWNER, memory: List<Pair<String, String>> = emptyList(), own: List<String> = emptyList()) =
        ContextFacts("Harbour Physio", "physio", "Europe/Dublin", "EUR", vocabulary, "Avery Morgan", role, own, memory)

    private var seq = 0L
    private fun msg(
        role: ChatRole, kind: MessageKind, vararg blocks: ChatBlock,
    ) = StoredMessage(UUID.randomUUID(), ++seq, role, kind, blocks.toList(), now)
    private fun text(t: String) = ChatBlock.Text(t)

    @Test
    fun `the system prompt and tools are a stable, cacheable prefix`() {
        assertTrue(AssistantPrompt.SYSTEM.startsWith("You are Bo"))
        listOf("data, never instructions", "Changes are always proposals", "Out of scope", "Sensitive booking-form answers").forEach {
            assertTrue(AssistantPrompt.SYSTEM.contains(it), "system prompt mentions: $it")
        }
        // No per-request values (dates, ids, names) in the prefix.
        assertFalse(Regex("""\d{4}-\d{2}-\d{2}""").containsMatchIn(AssistantPrompt.SYSTEM))
        for (role in Role.entries) {
            val a = ToolRegistry.DEFAULT.specs(role)
            assertEquals(a, ToolRegistry.DEFAULT.specs(role), "deterministic for $role")
            assertEquals(a.map { it.name }.sorted(), a.map { it.name }, "sorted by name")
            assertEquals(
                Json.encodeToString(JsonArray.serializer(), JsonArray(a.map { it.inputSchema })),
                Json.encodeToString(JsonArray.serializer(), JsonArray(ToolRegistry.DEFAULT.specs(role).map { it.inputSchema })),
            )
        }
        val staff = ToolRegistry.DEFAULT.specs(Role.STAFF).map { it.name }
        val admin = ToolRegistry.DEFAULT.specs(Role.ADMIN).map { it.name }
        assertEquals(
            listOf("close_date", "get_stats", "list_deals", "pause_or_resume_deal", "update_memory", "update_service"),
            (admin - staff.toSet()).sorted(),
        )
        assertEquals(admin, ToolRegistry.DEFAULT.specs(Role.OWNER).map { it.name })
        // The prefix is big enough to be cached (Claude Opus 5.5 caches from 512 tokens; ~4 characters a token).
        val prefix = AssistantPrompt.SYSTEM.length + ToolRegistry.DEFAULT.specs(Role.STAFF).sumOf {
            it.description.length + it.inputSchema.toString().length
        }
        assertTrue(prefix > 512 * 4, "prefix ~${prefix / 4} tokens")
    }

    @Test
    fun `every tool schema is strict`() {
        for (tool in ToolRegistry.DEFAULT.all) {
            assertStrictSchema(tool.schema, tool.name)
            assertTrue(tool.description.length in 80..600, "${tool.name}: description says when to call it")
        }
    }

    @Test
    fun `the Anthropic request caches the prefix, uses strict tools and never disables thinking`() {
        val request = ConverseRequest(
            AssistantPrompt.SYSTEM, ToolRegistry.DEFAULT.specs(Role.STAFF),
            listOf(
                ChatMessage(ChatRole.USER, listOf(text("What's on?"))),
                ChatMessage(
                    ChatRole.ASSISTANT,
                    listOf(
                        ChatBlock.Thinking("", "sig"),
                        ChatBlock.ToolUse(
                            "toolu_1", "get_schedule",
                            buildJsonObject { put("date", "2026-10-05"); put("days", 1); put("resourceId", JsonNull) },
                        ),
                    ),
                ),
                ChatMessage(
                    ChatRole.USER,
                    listOf(ChatBlock.ToolResult("toolu_1", """{"total":0}"""), ChatBlock.ToolResult("toolu_2", "{}", isError = true)),
                ),
            ),
            8_000, Effort.LOW,
        )
        val body = Json.parseToJsonElement(
            jsonMapper().writeValueAsString(AnthropicMapping.converseParams("claude-opus-5-5", request)._body()),
        ) as JsonObject
        val system = (body["system"] as JsonArray).single() as JsonObject
        assertEquals(AssistantPrompt.SYSTEM, system["text"]!!.jsonPrimitive.content)
        assertEquals(Json.parseToJsonElement("""{"type":"ephemeral"}"""), system["cache_control"], "breakpoint after tools + system")
        assertEquals(
            Json.parseToJsonElement("""{"type":"ephemeral"}"""), body["cache_control"], "automatic caching of the conversation tail",
        )
        assertEquals(Json.parseToJsonElement("""{"type":"auto"}"""), body["tool_choice"])
        assertEquals("low", (body["output_config"] as JsonObject)["effort"]!!.jsonPrimitive.content)
        assertNull(body["thinking"])
        val tools = body["tools"] as JsonArray
        assertTrue(tools.all { (it as JsonObject)["strict"] == JsonPrimitive(true) })
        assertEquals(
            ToolRegistry.DEFAULT.specs(Role.STAFF).map { it.name }, tools.map { (it as JsonObject)["name"]!!.jsonPrimitive.content },
        )
        val kinds = (body["messages"] as JsonArray).map { m ->
            ((m as JsonObject)["content"] as JsonArray).map { (it as JsonObject)["type"]!!.jsonPrimitive.content }
        }
        assertEquals(listOf(listOf("text"), listOf("thinking", "tool_use"), listOf("tool_result", "tool_result")), kinds)
    }

    @Test
    fun `context names the business, the person, their scope and the memory`() {
        val owner = AssistantPrompt.businessContext(facts(memory = listOf("m1" to "We close early on Fridays")))
        assertTrue(owner.contains("Business: Harbour Physio (physio)"))
        assertTrue(owner.contains("Therapist/Therapists, Patient/Patients, Appointment/Appointments"))
        assertTrue(owner.contains("You are helping: Avery Morgan (owner)"))
        assertTrue(owner.contains("- [m1] We close early on Fridays"))
        assertFalse(owner.contains("staff linked"))
        val staff = AssistantPrompt.businessContext(facts(Role.STAFF, own = listOf("Casey Lane")))
        assertTrue(staff.contains("They are staff linked to: Casey Lane. They can only see and change"))
        assertTrue(staff.contains("Business memory: (empty)"))
        assertEquals(AssistantPrompt.hash(owner), AssistantPrompt.hash(owner))
        assertTrue(AssistantPrompt.hash(owner) != AssistantPrompt.hash(staff))
        val turn = AssistantPrompt.userTurn("Hello", owner, now, zone).map { (it as ChatBlock.Text).text }
        assertEquals(
            listOf(owner, "<turn_context>Today: 2026-10-05 (Monday). Time now: 09:00 (Europe/Dublin).</turn_context>", "Hello"), turn,
        )
        assertEquals("Hello", AssistantPrompt.userText(AssistantPrompt.userTurn("Hello", null, now, zone)))
    }

    @Test
    fun `history drops notices, merges turns and answers interrupted tool calls`() {
        val use = ChatBlock.ToolUse("t1", "get_schedule", JsonObject(emptyMap()))
        val stored = listOf(
            msg(ChatRole.ASSISTANT, MessageKind.MESSAGE, text("orphan")),
            msg(ChatRole.USER, MessageKind.MESSAGE, text("Hi")),
            msg(ChatRole.ASSISTANT, MessageKind.REFUSAL, text("notice")),
            msg(ChatRole.USER, MessageKind.MESSAGE, text("Schedule?")),
            msg(ChatRole.ASSISTANT, MessageKind.MESSAGE, text("Looking"), use),
            msg(ChatRole.ASSISTANT, MessageKind.ERROR, text("could not reach")),
            msg(ChatRole.USER, MessageKind.EVENT, text("<action_update/>")),
            msg(ChatRole.USER, MessageKind.MESSAGE, text("Again")),
        )
        val h = AssistantPrompt.history(stored)
        assertEquals(listOf(ChatRole.USER, ChatRole.ASSISTANT, ChatRole.USER), h.map { it.role })
        assertEquals(listOf("Hi", "Schedule?"), h[0].blocks.map { (it as ChatBlock.Text).text })
        val last = h[2].blocks
        assertEquals(
            ChatBlock.ToolResult("t1", """{"error":"INTERRUPTED","message":"This tool call did not finish."}""", isError = true), last[0],
        )
        assertEquals(listOf("<action_update/>", "Again"), last.drop(1).map { (it as ChatBlock.Text).text })
    }

    @Test
    fun `an event stored mid-turn never edits the history, it joins the next user message`() {
        val propose = ChatBlock.ToolUse("t1", "create_booking", JsonObject(emptyMap()))
        val look = ChatBlock.ToolUse("t2", "list_services", JsonObject(emptyMap()))
        val event = text("<action_update proposal=\"a1\" status=\"confirmed\">Booked.</action_update>")
        val stored = mutableListOf<StoredMessage>()
        val calls = mutableListOf<List<ChatMessage>>()
        fun call() { calls += AssistantPrompt.history(stored) }

        stored += msg(ChatRole.USER, MessageKind.MESSAGE, text("Book Robin"))
        call()
        stored += msg(ChatRole.ASSISTANT, MessageKind.MESSAGE, ChatBlock.Thinking("", "sig1"), propose, look)
        // The owner confirms the card while the turn's other tool is still running.
        stored += msg(ChatRole.USER, MessageKind.EVENT, event)
        stored += msg(ChatRole.USER, MessageKind.TOOL_RESULTS, ChatBlock.ToolResult("t1", "{}"), ChatBlock.ToolResult("t2", "{}"))
        call()
        stored += msg(ChatRole.ASSISTANT, MessageKind.MESSAGE, ChatBlock.Thinking("", "sig2"), text("Prepared."))
        stored += msg(ChatRole.USER, MessageKind.MESSAGE, text("Thanks"))
        call()

        for ((before, after) in calls.zipWithNext()) assertEquals(before, after.take(before.size), "each call replays the last one")
        val results = calls[1].last()
        assertEquals(ChatRole.USER, results.role)
        assertTrue(results.blocks.all { it is ChatBlock.ToolResult }, "tool results alone, first: ${results.blocks}")
        assertEquals(listOf(event, text("Thanks")), calls[2].last().blocks)
    }

    @Test
    fun `long histories are cut in steps, so the start stays put for many turns and thinking stays valid`() {
        val stored = mutableListOf<StoredMessage>()
        val windows = mutableListOf<Window>()
        val calls = mutableListOf<List<ChatMessage>>()
        fun thinking(h: List<ChatMessage>) = h.flatMap { it.blocks }.count { it is ChatBlock.Thinking }
        for (i in 1..80) {
            // A turn: the user's words, a reply with a tool call, its result and the answer (4 model messages).
            stored += msg(ChatRole.USER, MessageKind.MESSAGE, text("q$i"))
            val window = AssistantPrompt.window(stored.map { MessageHead(it.seq, it.role, it.kind) })
            windows += window
            calls += AssistantPrompt.history(stored.filter { it.seq >= window.fromSeq }, window)
            stored += msg(
                ChatRole.ASSISTANT, MessageKind.MESSAGE, ChatBlock.Thinking("", "s$i"), text("a$i"),
                ChatBlock.ToolUse("u$i", "list_services", JsonObject(emptyMap())),
            )
            stored += msg(ChatRole.USER, MessageKind.TOOL_RESULTS, ChatBlock.ToolResult("u$i", "{}"))
            stored += msg(ChatRole.ASSISTANT, MessageKind.MESSAGE, ChatBlock.Thinking("", "t$i"), text("done$i"))
        }
        for ((i, h) in calls.withIndex()) {
            assertTrue(h.size <= AssistantPrompt.MAX_HISTORY + 1, "turn ${i + 1}: ${h.size} messages")
            assertTrue(h.first().blocks.single() is ChatBlock.Text, "starts at a user's words, never a tool result")
        }
        val moves = (1 until calls.size).filter { windows[it].fromSeq != windows[it - 1].fromSeq }
        assertTrue(moves.isNotEmpty(), "the thread is long enough to be cut")
        assertTrue(moves.zipWithNext().all { (a, b) -> b - a >= 7 }, "the start moves only every few turns: $moves")
        for (i in 1 until calls.size) {
            if (i in moves) {
                // The replies kept were made behind a longer history: they go without their thinking.
                assertEquals(0, thinking(calls[i]), "turn ${i + 1}")
            } else {
                assertEquals(calls[i - 1], calls[i].take(calls[i - 1].size), "turn ${i + 1} replays the previous request")
            }
        }
        assertEquals(2, thinking(calls[moves.first() + 1]), "replies made since the start moved keep their thinking")
    }

    @Test
    fun `fake-model templates follow paths into tool results`() {
        val result = Json.parseToJsonElement(
            """{"services":[{"id":"s1","options":[]}],"days":[{"bookings":[{"r":[{"n":"Casey"}]},{"r":[{"n":"Casey"}]}]},{"bookings":[{"r":[{"n":"Robin"}]}]}],"total":3}""",
        )
        assertEquals(JsonPrimitive("s1"), FakeTemplates.path(result, "services[0].id"))
        assertNull(FakeTemplates.path(result, "services[0].options[0].id"))
        assertEquals(JsonPrimitive("Casey, Robin"), FakeTemplates.path(result, "days[*].bookings[*].r[0].n"))
        val lookup = { key: String ->
            if (key == "today") JsonPrimitive("2026-10-05") else FakeTemplates.path(result, key.substringAfter('.'))
        }
        assertEquals(JsonPrimitive(3), FakeTemplates.resolveString("${'$'}{x.total}", lookup), "a lone placeholder keeps its JSON type")
        assertEquals(JsonNull, FakeTemplates.resolveString("${'$'}{x.missing}", lookup))
        assertEquals(JsonPrimitive("On 2026-10-05: 3"), FakeTemplates.resolveString("On ${'$'}{today}: ${'$'}{x.total}", lookup))
    }
}
