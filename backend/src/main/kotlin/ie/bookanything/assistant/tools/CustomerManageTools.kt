package ie.bookanything.assistant.tools

import ie.bookanything.ai.JsonSchema.nullable
import ie.bookanything.ai.JsonSchema.obj
import ie.bookanything.ai.JsonSchema.string
import ie.bookanything.auth.Role
import ie.bookanything.business.AgentChangeKind
import ie.bookanything.customers.CustomerCommands
import ie.bookanything.customers.CustomerDetails
import ie.bookanything.customers.CustomerInput
import ie.bookanything.customers.CustomerRepository
import ie.bookanything.customers.visibleCustomer
import ie.bookanything.http.Errors
import ie.bookanything.http.Patch
import ie.bookanything.http.parseUuid
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.serializer

// A customer's record as the dashboard's customer page shows and edits it: staff see and change only the customers of
// their own calendar (visibleCustomer); every change goes through CustomerCommands, like the page.

@Serializable
data class CustomerIdInput(val customerId: String)

@Serializable
data class CustomerDetailView(
    val customer: CustomerView,
    val notes: String?,
    val hasAccount: Boolean,
    /** Newest first, at most 20. */
    val bookings: List<String>,
    val moreBookings: Boolean,
)

object GetCustomer : ReadTool<CustomerIdInput> {
    override val name = "get_customer"
    override val label = "Opening the customer"
    override val minRole = Role.STAFF
    override val input = serializer<CustomerIdInput>()
    override val description = "One customer in full: contact details, notes and their bookings here, newest first. Find the id " +
        "with find_customers."
    override val schema = obj("customerId" to string("Customer id"))

    override fun run(ctx: ToolContext, input: CustomerIdInput): ToolOutput = ctx.read { conn ->
        val id = parseUuid(input.customerId, "customerId")
        val row = visibleCustomer(conn, ctx.access, id)
        val detail = CustomerCommands.detail(conn, ctx.access, id)
        val bookings = detail.bookings.take(MAX_BOOKINGS).map { b ->
            "${b.reference} · ${b.service.name} · ${b.start.take(16).replace('T', ' ')} · ${b.status.label}"
        }
        ToolViews.output(
            serializer(),
            CustomerDetailView(
                ToolViews.customer(row, ctx.business.zone), ToolViews.clip(row.notes), detail.hasAccount, bookings,
                detail.bookings.size > MAX_BOOKINGS,
            ),
            "Opened ${row.name}",
            untrusted = true,
        )
    }

    private const val MAX_BOOKINGS = 20
}

@Serializable
data class CreateCustomerInput(val name: String, val email: String?, val phone: String?, val notes: String?)

object CreateCustomer : WriteTool<CreateCustomerInput> {
    override val name = "create_customer"
    override val label = "Preparing a new customer"
    override val minRole = Role.STAFF
    override val input = serializer<CreateCustomerInput>()
    override val changeKind = AgentChangeKind.RECORDS
    override val description = "Proposes adding a customer record (for someone who books by phone or in person). Check " +
        "find_customers first: an email can only belong to one customer. Nothing is added until the user confirms."
    override val schema = obj(
        "name" to string("Full name"),
        "email" to nullable(string("Email, or null")),
        "phone" to nullable(string("Phone number, or null")),
        "notes" to nullable(string("Notes for the team, or null")),
    )

    private fun details(input: CreateCustomerInput) = CustomerDetails.from(CustomerInput(input.name, input.email, input.phone, input.notes))

    override fun propose(ctx: ToolContext, input: CreateCustomerInput): Proposal {
        val d = details(input)
        ctx.read { conn ->
            if (d.email != null && CustomerRepository.emailTaken(conn, ctx.access.businessId, d.email, null)) {
                throw Errors.conflict("A customer with this email already exists. Use find_customers to find them.")
            }
        }
        return Proposal(
            title = "Add ${ctx.customerLabel.lowercase()}",
            summary = "Add ${d.name}",
            changes = listOfNotNull(
                ProposalChange("Name", null, d.name),
                d.email?.let { ProposalChange("Email", null, it) },
                d.phone?.let { ProposalChange("Phone", null, it) },
                d.notes?.let { ProposalChange("Notes", null, ToolViews.clip(it)) },
            ),
            confirmLabel = "Add",
        )
    }

    override fun execute(ctx: ToolContext, run: Execution, input: CreateCustomerInput): ActionResult {
        val c = CustomerCommands.create(run.conn, ctx.access, details(input), ctx.now, run.actor)
        return ActionResult("Added ${c.name}.", listOf(ActionLink("Open customer", "customers/${c.id}")))
    }
}

@Serializable
data class UpdateCustomerInput(val customerId: String, val name: String?, val email: String?, val phone: String?, val notes: String?)

object UpdateCustomer : WriteTool<UpdateCustomerInput> {
    override val name = "update_customer"
    override val label = "Preparing a customer change"
    override val minRole = Role.STAFF
    override val input = serializer<UpdateCustomerInput>()
    override val changeKind = AgentChangeKind.RECORDS
    override val description = "Proposes changing a customer's name, email, phone or notes. null keeps a field as it is; an empty " +
        "string clears it (not the name). Nothing changes until the user confirms."
    override val schema = obj(
        "customerId" to string("Customer id"),
        "name" to nullable(string("New full name, or null to keep it")),
        "email" to nullable(string("New email, \"\" to clear, or null to keep it")),
        "phone" to nullable(string("New phone, \"\" to clear, or null to keep it")),
        "notes" to nullable(string("New notes (replacing the old), \"\" to clear, or null to keep them")),
    )

    /** The fields to change, as a PATCH body: "" becomes null (cleared). */
    private fun patch(input: UpdateCustomerInput): Patch {
        val fields = linkedMapOf<String, JsonElement>()
        input.name?.let { fields["name"] = JsonPrimitive(it) }
        for ((key, value) in listOf("email" to input.email, "phone" to input.phone, "notes" to input.notes)) {
            if (value != null) fields[key] = JsonPrimitive(value.trim().ifEmpty { null })
        }
        if (fields.isEmpty()) throw Errors.invalid("Give at least one field to change.")
        return Patch(JsonObject(fields))
    }

    override fun propose(ctx: ToolContext, input: UpdateCustomerInput): Proposal {
        val patch = patch(input)
        return ctx.read { conn ->
            val c = visibleCustomer(conn, ctx.access, parseUuid(input.customerId, "customerId"))
            val after = CustomerDetails.from(
                CustomerInput(
                    name = patch.requiredString("name", c.name), email = patch.string("email", c.email),
                    phone = patch.string("phone", c.phone), notes = patch.string("notes", c.notes),
                ),
            )
            if (after.email != null && after.email != c.email &&
                CustomerRepository.emailTaken(conn, ctx.access.businessId, after.email, c.id)
            ) {
                throw Errors.conflict("Another customer already has this email.")
            }
            val changes = listOfNotNull(
                ProposalChange("Name", c.name, after.name).takeIf { c.name != after.name },
                ProposalChange("Email", c.email, after.email).takeIf { c.email != after.email },
                ProposalChange("Phone", c.phone, after.phone).takeIf { c.phone != after.phone },
                ProposalChange("Notes", ToolViews.clip(c.notes), ToolViews.clip(after.notes)).takeIf { c.notes != after.notes },
            )
            if (changes.isEmpty()) throw Errors.invalid("Nothing would change.")
            Proposal(
                title = "Update ${ctx.customerLabel.lowercase()}",
                summary = "Update ${c.name}",
                changes = changes,
                warnings = listOfNotNull(
                    "Their account is unlinked from this record when the email changes.".takeIf {
                        c.userId != null && after.email != c.email
                    },
                ),
                confirmLabel = "Save",
            )
        }
    }

    override fun execute(ctx: ToolContext, run: Execution, input: UpdateCustomerInput): ActionResult {
        val c = CustomerCommands.update(run.conn, ctx.access, parseUuid(input.customerId, "customerId"), patch(input), run.actor)
        return ActionResult("Updated ${c.name}.", listOf(ActionLink("Open customer", "customers/${c.id}")))
    }
}
