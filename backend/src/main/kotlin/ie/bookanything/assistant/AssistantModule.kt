package ie.bookanything.assistant

import ie.bookanything.ai.AiModule
import ie.bookanything.ai.Effort
import ie.bookanything.assistant.actions.ActionService
import ie.bookanything.assistant.nudges.NudgeService
import ie.bookanything.assistant.tools.ToolContexts
import ie.bookanything.assistant.tools.ToolRegistry
import ie.bookanything.assistant.tools.ToolRunner
import ie.bookanything.booking.BookingModule
import ie.bookanything.db.Db
import ie.bookanything.notifications.inbox.Inbox
import ie.bookanything.payments.PaymentProvider
import java.time.Clock

/**
 * Bo, the business assistant (docs/architecture.md section 17). Tools run the same booking commands as the dashboard
 * ([bookings]); without a model Bo still serves threads, memory and nudges but cannot run turns.
 */
class AssistantModule(
    db: Db,
    clock: Clock,
    effort: Effort,
    ai: AiModule,
    bookings: BookingModule,
    payments: PaymentProvider,
    inbox: Inbox,
    sitesEnabled: Boolean = false,
) {
    /** Bo's tools, also served to members' own AI apps by the business MCP (section 20.7). */
    val tools = ToolRegistry.DEFAULT
    val toolContexts = ToolContexts(db, clock, bookings, payments)
    val actions = ActionService(db, clock, tools, toolContexts, inbox)
    val nudges = NudgeService(db, clock, payments, ai.meter, modelConfigured = ai.model != null, sitesEnabled = sitesEnabled)
    val service: AssistantService = ConversationViews(tools).let { views ->
        val runner = ai.model?.let {
            TurnRunner(db, clock, it, tools, ToolRunner(tools, actions), toolContexts, views, ai.usage, effort)
        }
        AssistantService(db, clock, runner, views, nudges, ai.usage, ai.meter)
    }
}
