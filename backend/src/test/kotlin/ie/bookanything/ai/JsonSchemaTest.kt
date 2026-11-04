package ie.bookanything.ai

import kotlin.test.Test
import kotlin.test.assertEquals

class JsonSchemaTest {
    @Test
    fun `strict objects require every property and nullable widens the type`() {
        val schema = JsonSchema.obj("a" to JsonSchema.string("A"), "b" to JsonSchema.nullable(JsonSchema.enum(listOf("x"), "B")))
        assertEquals(
            """{"type":"object","properties":{"a":{"type":"string","description":"A"},""" +
                """"b":{"type":["string","null"],"enum":["x",null],"description":"B"}},"required":["a","b"],"additionalProperties":false}""",
            schema.toString(),
        )
    }

    @Test
    fun `MCP objects list only the required properties and keep optional keywords in order`() {
        val schema = JsonSchema.obj(
            listOf(
                "n" to JsonSchema.number("N", min = 1.0, max = 2.0),
                "i" to JsonSchema.integer("I", max = 5),
                "s" to JsonSchema.string("S", format = "date", enum = listOf("d")),
                "l" to JsonSchema.stringList("L"),
                "m" to JsonSchema.stringMap("M"),
            ),
            required = listOf("n"), description = "D",
        )
        assertEquals(
            """{"type":"object","description":"D","properties":{"n":{"type":"number","description":"N","minimum":1.0,"maximum":2.0},""" +
                """"i":{"type":"integer","description":"I","maximum":5},""" +
                """"s":{"type":"string","description":"S","format":"date","enum":["d"]},""" +
                """"l":{"type":"array","description":"L","items":{"type":"string"}},""" +
                """"m":{"type":"object","description":"M","additionalProperties":{"type":"string"}}},""" +
                """"required":["n"],"additionalProperties":false}""",
            schema.toString(),
        )
    }
}
