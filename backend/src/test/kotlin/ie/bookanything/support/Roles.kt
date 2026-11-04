package ie.bookanything.support

import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import kotlin.test.fail

/**
 * Every kind of caller for a business route: its owner, an admin, a staff member linked to one resource, a customer
 * who has booked there, the owner of another business, and nobody signed in.
 */
data class Roles(val owner: TestUser, val admin: TestUser, val staff: TestUser, val customer: TestUser, val otherOwner: TestUser) {
    /** (caller name, token) in a fixed order; anonymous has no token. */
    val all: List<Pair<String, String?>>
        get() = listOf(
            "owner" to owner.token, "admin" to admin.token, "staff" to staff.token, "customer" to customer.token,
            "other business" to otherOwner.token, "anonymous" to null,
        )

    companion object {
        suspend fun of(api: Api, clinic: Clinic, staffResource: String = "Alex"): Roles {
            val customer = TestUser.create("customer", "Casey Customer")
            Fixtures.book(api, clinic, "Consult", "2026-10-07T10:00:00+01:00", token = customer.token, email = customer.email)
            return Roles(
                owner = clinic.owner,
                admin = member(api, clinic, "admin"),
                staff = member(api, clinic, "staff", staffResource),
                customer = customer,
                otherOwner = Fixtures.clinic(api).owner,
            )
        }

        suspend fun member(api: Api, clinic: Clinic, role: String, resource: String? = null): TestUser {
            val user = TestUser.create(role, "Test ${role.replaceFirstChar { it.uppercase() }}")
            val body = jsonOf("email" to user.email, "role" to role, "resourceId" to resource?.let(clinic::resource))
            assertStatus(HttpStatusCode.Created, api.post("${clinic.base}/team/invitations", body, clinic.owner.token))
            assertStatus(HttpStatusCode.OK, api.get("/v1/me", user.token)) // accepts the invitation
            return user
        }

        /**
         * What a caller gets from a route that needs [min] ("owner", "admin" or "staff") and answers [allowed]:
         * members below the role 403, non-members 404 (membership of other tenants is not revealed), anonymous 401.
         */
        fun expected(caller: String, min: String, allowed: HttpStatusCode): HttpStatusCode {
            val rank = mapOf("owner" to 3, "admin" to 2, "staff" to 1)
            return when (caller) {
                "anonymous" -> HttpStatusCode.Unauthorized
                "customer", "other business" -> HttpStatusCode.NotFound
                else -> if (rank.getValue(caller) >= rank.getValue(min)) allowed else HttpStatusCode.Forbidden
            }
        }

        /** Runs [call] for every caller and fails with every mismatch at once. */
        suspend fun check(roles: Roles, route: String, min: String, allowed: HttpStatusCode, call: suspend (String?) -> HttpResponse) {
            val problems = roles.all.mapNotNull { (who, token) ->
                val res = call(token)
                val want = expected(who, min, allowed)
                if (res.status != want) "$route as $who: expected $want, got ${res.status} ${res.bodyAsText().take(200)}" else null
            }
            if (problems.isNotEmpty()) fail(problems.joinToString("\n"))
        }
    }
}
