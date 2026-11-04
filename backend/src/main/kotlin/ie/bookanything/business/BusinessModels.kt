package ie.bookanything.business

import ie.bookanything.site.PublicSite
import ie.bookanything.site.SiteTheme
import kotlinx.serialization.Serializable
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

@Serializable
data class Vocabulary(
    val resource: String = "Staff member",
    val resources: String = "Staff",
    val customer: String = "Customer",
    val customers: String = "Customers",
    val booking: String = "Booking",
    val bookings: String = "Bookings",
)

@Serializable
data class Branding(
    val primaryColor: String = DEFAULT_PRIMARY_COLOR,
    val logoUrl: String? = null,
    val coverImageUrl: String? = null,
    /**
     * The booking portal's style preset: its fonts, corner radius and surfaces. The only look a business picks besides
     * its colour, logo and cover. Null until chosen; views fill in [BusinessViews.portalStyle].
     */
    val portalStyle: SiteTheme? = null,
) {
    companion object { const val DEFAULT_PRIMARY_COLOR = "#4f46e5" }
}

@Serializable
data class Policies(
    val minNoticeMinutes: Int = 60,
    val maxAdvanceDays: Int = 60,
    val cancellationNoticeHours: Int = 24,
    val lateCancellationRefundPercent: Int = 0,
    val allowCustomerCancel: Boolean = true,
    val allowCustomerReschedule: Boolean = true,
    val holdMinutes: Int = 30,
    val requireCustomerPhone: Boolean = false,
    /** Customers are shown only the earliest free time (and step to later ones) instead of every free time. */
    val nextAvailableOnly: Boolean = false,
) {
    companion object {
        /** The holds an owner may set, in minutes (the booking engine still waits the payment provider's minimum). */
        val HOLD_MINUTES: IntRange = 5..1440

        /** What the setup assistant suggests for a business taking payment online (inside [HOLD_MINUTES]). */
        val SUGGESTED_HOLD_MINUTES: IntRange = 30..60
    }
}

@Serializable
data class Address(
    val line1: String? = null,
    val line2: String? = null,
    val city: String? = null,
    val postcode: String? = null,
)

@Serializable
data class PublicCustomerGroup(val id: String, val name: String, val description: String?)

@Serializable
data class PublicBusiness(
    val id: String,
    val slug: String,
    val name: String,
    val description: String?,
    val industry: String,
    val timezone: String,
    val currency: String,
    val locale: String,
    val contactEmail: String?,
    val contactPhone: String?,
    val websiteUrl: String?,
    val address: Address,
    val branding: Branding,
    val vocabulary: Vocabulary,
    val policies: Policies,
    val customerGroups: List<PublicCustomerGroup>,
    val paymentsEnabled: Boolean,
    val showBadge: Boolean,
    /** Only on `GET /v1/public/businesses/{slug}` (section 15.5); null in other embeddings. */
    val site: PublicSite? = null,
)

@Serializable
data class BusinessDto(
    val id: String,
    val slug: String,
    val name: String,
    val description: String?,
    val industry: String,
    val timezone: String,
    val currency: String,
    val locale: String,
    val contactEmail: String?,
    val contactPhone: String?,
    val websiteUrl: String?,
    val address: Address,
    val branding: Branding,
    val vocabulary: Vocabulary,
    val policies: Policies,
    val customerGroups: List<PublicCustomerGroup>,
    val paymentsEnabled: Boolean,
    val showBadge: Boolean,
    val status: String,
    val country: String,
    val plan: String,
    val myRole: String,
    val createdAt: String,
    /** Whether this deployment offers business websites (`SITES_ENABLED`); the dashboard hides the site builder when off. */
    val sitesEnabled: Boolean,
    /** Who may use the business from their own AI apps: off | admins (owners and admins) | team. */
    val aiAgentsAccess: AiAgentsAccess = AiAgentsAccess.ADMINS,
    /** Kinds of change members' AI apps make without approval on bookanything (none by default). */
    val aiAgentsAutoApprove: List<AgentChangeKind> = emptyList(),
    /** Whether this deployment serves the business MCP (`BUSINESS_MCP_ENABLED`); the dashboard hides its settings when off. */
    val aiAgentsAvailable: Boolean = false,
)

@Serializable
data class SlugAvailability(val available: Boolean, val suggestion: String?)

/** Internal representation of a `businesses` row. */
data class BusinessRow(
    val id: UUID,
    val slug: String,
    val name: String,
    val description: String?,
    val industry: String,
    val zone: ZoneId,
    val currency: String,
    val locale: String,
    val country: String,
    val status: String,
    val contactEmail: String?,
    val contactPhone: String?,
    val address: Address,
    val websiteUrl: String?,
    val branding: Branding,
    val vocabulary: Vocabulary,
    val policies: Policies,
    val stripeAccountId: String?,
    val stripeChargesEnabled: Boolean,
    val stripeDetailsSubmitted: Boolean,
    val plan: Plan,
    val planStatus: String?,
    val createdAt: Instant,
    val stripeCustomerId: String? = null,
    val stripeSubscriptionId: String? = null,
    /** Who may use the business from their own AI apps (the business MCP), and which changes need approval. */
    val aiAgents: AiAgentsPolicy = AiAgentsPolicy(),
) {
    val timezone: String get() = zone.id
    val isActive get() = status == "active"

    /** Deleted by its owner (or left without one): its customers can still see their bookings, but not change or pay them. */
    val isSuspended get() = status == "suspended"

    /**
     * On a paid plan that Stripe is billing for: active, trialing, or retrying a failed payment. Such a plan is changed or
     * cancelled in the billing portal, never replaced by a second checkout or left running by deleting the business.
     */
    val hasPaidSubscription get() = stripeSubscriptionId != null && plan.isPaid && planStatus in BILLED_PLAN_STATUSES
}

/** Subscription statuses Stripe keeps charging (or retrying) for. */
private val BILLED_PLAN_STATUSES = setOf("active", "trialing", "past_due")
