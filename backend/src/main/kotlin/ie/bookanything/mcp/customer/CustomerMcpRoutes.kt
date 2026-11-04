package ie.bookanything.mcp.customer

import ie.bookanything.AppContext
import ie.bookanything.http.RateLimiter
import ie.bookanything.mcp.McpIcons
import ie.bookanything.mcp.addTools
import ie.bookanything.mcp.oauthMcpRoutes
import ie.bookanything.oauth.McpPrincipal
import ie.bookanything.oauth.McpResource
import io.ktor.server.application.ApplicationCall
import io.ktor.server.routing.Route
import io.modelcontextprotocol.kotlin.sdk.server.Server
import io.modelcontextprotocol.kotlin.sdk.server.ServerOptions
import io.modelcontextprotocol.kotlin.sdk.types.Implementation
import io.modelcontextprotocol.kotlin.sdk.types.ServerCapabilities

/** Shared egress addresses of AI platforms carry many users: high, only against floods. */
val CUSTOMER_MCP_IP_LIMIT = RateLimiter.Limit("mcp-customer-ip", 3000, 60)

/** Requests a connected app may make per grant: plenty for a person, not for a runaway loop. */
val CUSTOMER_MCP_PROPOSALS = RateLimiter.Limit("mcp-customer-proposals", 60, 600)

private fun customerServer(ctx: AppContext, call: ApplicationCall, principal: McpPrincipal): Server = Server(
    Implementation(
        name = "bookanything", version = "1.2.0", title = "bookanything (your account)", websiteUrl = ctx.config.appBaseUrl,
        icons = McpIcons.of(ctx.config.appBaseUrl),
    ),
    ServerOptions(capabilities = ServerCapabilities(tools = ServerCapabilities.Tools(listChanged = false))),
    "You are acting for a signed-in bookanything customer. Find businesses with search_marketplace, read services and questions " +
        "with get_business, find free times with check_availability, then book. book, reschedule_booking and cancel_booking only " +
        "prepare a request; nothing happens until it is approved. When its status is awaiting_approval, the user approves it " +
        "themselves on bookanything: show it to them, give them its approvalUrl, and call get_proposal afterwards to see what " +
        "happened. When it is awaiting_confirmation (a kind the user lets you make), show it and call confirm_action only once they " +
        "agree, or cancel_action if they don't. Paid bookings then have a payment link for the user to open: never handle card " +
        "details. " +
        "Times are ISO-8601 in the business's timezone; money is in cents.",
).apply { addTools(CustomerTools.ALL, CustomerToolContext(ctx, call, principal)) }

/** `POST /v1/mcp/customer`: the signed-in customer MCP (see [oauthMcpRoutes]). */
fun Route.customerMcpRoutes(ctx: AppContext) =
    oauthMcpRoutes(ctx, McpResource.CUSTOMER, CUSTOMER_MCP_IP_LIMIT, CustomerTools::scopeFor) { call, principal ->
        customerServer(ctx, call, principal)
    }
