package ie.bookanything.support

import ie.bookanything.auth.SimulationTokens
import ie.bookanything.config.AppConfig
import ie.bookanything.config.AppEnv
import ie.bookanything.config.AuthMode
import ie.bookanything.config.ClerkConfig
import ie.bookanything.config.SimulationAuthConfig
import java.util.Base64
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/** The reliability simulation's sign-in in tests: a staging configuration with it, and tokens signed as the runner does. */
object SimulationFixtures {
    const val SECRET = "simulation-secret-for-tests-0123456789"

    private val clerk = ClerkConfig(
        "https://clerk.bookanything.test", "https://clerk.bookanything.test/.well-known/jwks.json", setOf("https://bookanything.ie"), null,
    )

    /** Staging (Clerk sign-in, a real token secret) on the test database, with the simulation sign-in unless [simulation] is null. */
    fun stagingConfig(
        rateLimits: Boolean = false,
        simulation: SimulationAuthConfig? = SimulationAuthConfig(SECRET, rateLimitMultiplier = 3),
    ): AppConfig = TestConfig.config(rateLimits = rateLimits).copy(
        env = AppEnv.STAGING, authMode = AuthMode.CLERK, clerk = clerk, tokenSecret = "a-very-long-staging-token-secret",
        simulationAuth = simulation,
    )

    /** A simulation identity `sim_<id>` / `<id>@sim.bookanything.test`, unique per call. */
    fun identity(prefix: String = "bot"): Pair<String, String> {
        val id = unique(prefix).lowercase().replace(Regex("[^a-z0-9]"), "")
        return "sim_$id" to "$id@sim.bookanything.test"
    }

    /** A simulation-signed-in [TestUser], its token minted by [tokens] (the app's, so on the app's clock). */
    fun user(tokens: SimulationTokens, prefix: String = "bot", name: String = "Sim Bot"): TestUser {
        val (sub, email) = identity(prefix)
        return TestUser(tokens.bearer(sub, email, name), email)
    }

    /** A token over exactly [payloadJson], signed with [secret] the way the runner signs. */
    fun forge(payloadJson: String, kind: String = SimulationTokens.BEARER, secret: String = SECRET): String {
        val b64 = Base64.getUrlEncoder().withoutPadding()
        val payload = b64.encodeToString(payloadJson.toByteArray())
        val mac = Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(secret.toByteArray(), "HmacSHA256")) }
            .doFinal("bookanything-simulation/v1\n$kind.$payload".toByteArray())
        return "$kind.$payload.${b64.encodeToString(mac)}"
    }
}
