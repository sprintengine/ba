package ie.bookanything.config

/**
 * The reliability simulation's sign-in on staging (docs/simulation.md, "On staging"; backend README "Simulation
 * sign-in"). With [secret] set, bearer tokens `sim.…` signed with it sign bots in as identities in a reserved namespace
 * (subjects `sim_…`, emails `@sim.bookanything.test`), and a guest request with a valid `X-Simulation-Token` header is
 * counted in a rate-limit bucket of its own, allowed [rateLimitMultiplier] times each limit.
 *
 * Only staging, development and tests accept it ([AppEnv.allowsSimulationAuth]): production refuses to start with it
 * set, whatever else is configured.
 */
class SimulationAuthConfig(
    /** The HMAC key shared with the simulation runner; at least [MIN_SECRET_BYTES] bytes. */
    val secret: String,
    /** How many times each rate limit a simulation request is allowed, in its own bucket. */
    val rateLimitMultiplier: Int = DEFAULT_RATE_LIMIT_MULTIPLIER,
) {
    /** Throws a [ConfigException] for a combination that must not start. */
    fun validate(env: AppEnv, tokenSecret: String) {
        if (!env.allowsSimulationAuth) {
            throw ConfigException(
                "SIMULATION_AUTH_SECRET is refused in production: the simulation sign-in is for staging only (APP_ENV=staging).",
            )
        }
        if (secret.toByteArray(Charsets.UTF_8).size < MIN_SECRET_BYTES) {
            throw ConfigException("SIMULATION_AUTH_SECRET must be at least $MIN_SECRET_BYTES bytes (e.g. openssl rand -base64 48).")
        }
        if (secret == tokenSecret) throw ConfigException("SIMULATION_AUTH_SECRET must differ from TOKEN_SECRET.")
        if (rateLimitMultiplier !in 1..MAX_RATE_LIMIT_MULTIPLIER) {
            throw ConfigException("SIMULATION_RATE_LIMIT_MULTIPLIER must be between 1 and $MAX_RATE_LIMIT_MULTIPLIER.")
        }
    }

    // Not a data class: its toString would print the secret wherever the configuration is logged.
    override fun toString(): String = "SimulationAuthConfig(secret=[redacted], rateLimitMultiplier=$rateLimitMultiplier)"

    override fun equals(other: Any?): Boolean =
        other is SimulationAuthConfig && other.secret == secret && other.rateLimitMultiplier == rateLimitMultiplier

    override fun hashCode(): Int = 31 * secret.hashCode() + rateLimitMultiplier

    companion object {
        const val MIN_SECRET_BYTES = 32
        const val DEFAULT_RATE_LIMIT_MULTIPLIER = 50
        const val MAX_RATE_LIMIT_MULTIPLIER = 1000

        /** Null unless `SIMULATION_AUTH_SECRET` is set; [validate] (from [AppConfig]) decides whether it may be. */
        fun fromEnvironment(env: EnvReader): SimulationAuthConfig? {
            val secret = env.str("SIMULATION_AUTH_SECRET")
            if (secret == null) {
                if (env.str("SIMULATION_RATE_LIMIT_MULTIPLIER") != null) {
                    throw ConfigException("SIMULATION_RATE_LIMIT_MULTIPLIER is refused unless SIMULATION_AUTH_SECRET is set.")
                }
                return null
            }
            return SimulationAuthConfig(secret, env.int("SIMULATION_RATE_LIMIT_MULTIPLIER", DEFAULT_RATE_LIMIT_MULTIPLIER))
        }
    }
}
