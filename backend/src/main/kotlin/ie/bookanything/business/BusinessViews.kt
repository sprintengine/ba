package ie.bookanything.business

import ie.bookanything.auth.Role
import ie.bookanything.http.formatInstant
import ie.bookanything.payments.PaymentProvider
import ie.bookanything.site.SiteTheme
import ie.bookanything.site.SiteThemes
import java.sql.Connection

/** The public and member views of a business; [PaymentProvider] says whether it can take online payments now. */
object BusinessViews {
    fun toPublic(payments: PaymentProvider, conn: Connection, b: BusinessRow) = PublicBusiness(
        id = b.id.toString(), slug = b.slug, name = b.name, description = b.description, industry = b.industry,
        timezone = b.timezone, currency = b.currency, locale = b.locale, contactEmail = b.contactEmail,
        contactPhone = b.contactPhone, websiteUrl = b.websiteUrl, address = b.address,
        branding = b.branding.copy(portalStyle = portalStyle(b)),
        vocabulary = b.vocabulary, policies = b.policies, customerGroups = BusinessRepository.publicGroups(conn, b.id),
        paymentsEnabled = payments.chargesEnabled(b), showBadge = !b.plan.isPaid,
    )

    /** The chosen portal style, else the one the business's industry suggests (the same pick a new site starts from). */
    fun portalStyle(b: BusinessRow): SiteTheme =
        b.branding.portalStyle ?: SiteThemes.choose(b.industry, b.name, b.description, prompt = null)

    fun toDto(
        payments: PaymentProvider,
        conn: Connection,
        b: BusinessRow,
        role: Role,
        sitesEnabled: Boolean,
        aiAgentsAvailable: Boolean = false,
        assistantAvailable: Boolean = false,
    ): BusinessDto {
        val p = toPublic(payments, conn, b)
        return BusinessDto(
            p.id, p.slug, p.name, p.description, p.industry, p.timezone, p.currency, p.locale, p.contactEmail, p.contactPhone,
            p.websiteUrl, p.address, p.branding, p.vocabulary, p.policies, p.customerGroups, p.paymentsEnabled, p.showBadge,
            status = b.status, country = b.country, plan = b.plan.wire, myRole = role.value, createdAt = formatInstant(b.createdAt, b.zone),
            sitesEnabled = sitesEnabled, aiAgentsAccess = b.aiAgents.access,
            aiAgentsAutoApprove = AgentChangeKind.entries.filter { it in b.aiAgents.autoApprove }, aiAgentsAvailable = aiAgentsAvailable,
            assistantAvailable = assistantAvailable,
        )
    }
}
