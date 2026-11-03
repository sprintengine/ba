package ie.bookanything.ai

import com.anthropic.core.jsonMapper
import ie.bookanything.assistant.tools.ToolRegistry
import ie.bookanything.auth.Role
import ie.bookanything.mcp.AnonymousMcp
import ie.bookanything.mcp.business.BusinessTools
import ie.bookanything.mcp.customer.CustomerTools
import ie.bookanything.site.ai.SiteAiSchema
import ie.bookanything.support.Snapshots
import ie.bookanything.templates.DraftSchema
import io.modelcontextprotocol.kotlin.sdk.types.McpJson
import io.modelcontextprotocol.kotlin.sdk.types.Tool
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.serializer
import kotlin.test.Test

/**
 * Pins the exact JSON of every schema we send: Bo's tool list (the cached prompt prefix), the MCP tool lists (what MCP
 * clients see) and the structured-output schemas of the business draft and the site builder, as the SDKs serialize them.
 */
class SchemaSnapshotTest {
    private val mapper = jsonMapper()

    @Test
    fun `Bo's tools are sent unchanged`() {
        Snapshots.assertMatches("bo-tools", mapper.writeValueAsString(ToolRegistry.DEFAULT.specs(Role.OWNER).map(AnthropicMapping::tool)))
    }

    @Test
    fun `the MCP tool lists are unchanged`() {
        val tools = ListSerializer(serializer<Tool>())
        val app = "https://bookanything.ie"
        Snapshots.assertMatches("mcp-anonymous-tools", McpJson.encodeToString(tools, AnonymousMcp.TOOLS.map { it.listed(app) }))
        Snapshots.assertMatches("mcp-customer-tools", McpJson.encodeToString(tools, CustomerTools.ALL.map { it.listed(app) }))
        Snapshots.assertMatches("mcp-business-tools", McpJson.encodeToString(tools, BusinessTools.ALL.map { it.listed(app) }))
    }

    @Test
    fun `the draft and site schemas are sent unchanged`() {
        Snapshots.assertMatches("draft-schema", wireSchema(StructuredRequest("s", "u", DraftSchema.schema)))
        Snapshots.assertMatches("site-schema", wireSchema(StructuredRequest("s", "u", SiteAiSchema.schema)))
    }

    /** `output_config.format.schema` exactly as the Anthropic SDK writes it. */
    private fun wireSchema(request: StructuredRequest): String {
        val body = mapper.readTree(mapper.writeValueAsString(AnthropicMapping.structuredParams("m", request)._body()))
        return mapper.writeValueAsString(body.at("/output_config/format/schema"))
    }
}
