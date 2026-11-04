package ie.bookanything.ai

import java.util.UUID

/** What a model call is for; the usage ledger and allowances are kept per feature. */
enum class AiFeature(val key: String, val label: String) {
    BUSINESS_DRAFT("business_draft", "Business setup draft"),
    SITE_GENERATE("site_generate", "Site generation"),
    SITE_EDIT("site_edit", "Site edits"),
    ASSISTANT("assistant", "Assistant"),
}

/**
 * Who a model call is for. Every call names its feature, the business (null only before one exists: the onboarding
 * draft) and the signed-in user, so the metering decorator can record and enforce it.
 */
data class AiCaller(val feature: AiFeature, val businessId: UUID?, val userId: UUID?, val requestId: String? = null)

/**
 * The one boundary every AI feature uses (business draft, site builder, assistant). The only production
 * implementation is `MeteredAiModel`, which wraps a raw [ModelClient]: features never see the client, so no call can
 * skip the usage ledger or the credit allowance.
 */
interface AiModel {
    /** The configured model id (for display). */
    val modelId: String

    fun complete(caller: AiCaller, request: StructuredRequest): ModelReply

    fun converse(caller: AiCaller, request: ConverseRequest, sink: StreamSink = StreamSink.NONE): ConverseReply
}

/**
 * The raw provider (Anthropic, or the scripted fake in development and tests). Only the metering decorator and the
 * wiring in `AppContext` may hold one.
 */
interface ModelClient {
    val modelId: String

    fun structured(request: StructuredRequest): ModelReply

    fun converse(request: ConverseRequest, sink: StreamSink): ConverseReply
}
