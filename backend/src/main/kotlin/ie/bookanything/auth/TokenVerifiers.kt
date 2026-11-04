package ie.bookanything.auth

import com.nimbusds.jose.JOSEObjectType
import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.jwk.source.JWKSource
import com.nimbusds.jose.jwk.source.JWKSourceBuilder
import com.nimbusds.jose.proc.DefaultJOSEObjectTypeVerifier
import com.nimbusds.jose.proc.JWSVerificationKeySelector
import com.nimbusds.jose.proc.SecurityContext
import com.nimbusds.jwt.JWTClaimsSet
import com.nimbusds.jwt.proc.DefaultJWTClaimsVerifier
import com.nimbusds.jwt.proc.DefaultJWTProcessor
import ie.bookanything.config.ClerkConfig
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.serializer
import org.slf4j.LoggerFactory
import java.net.URI
import java.util.Base64

/** Identity proven by a bearer token. */
data class VerifiedIdentity(
    val subject: String,
    val email: String?,
    val emailVerified: Boolean,
    val name: String?,
)

fun interface TokenVerifier {
    /** Returns the identity, or null when the token is invalid/expired. Never throws for bad tokens. */
    fun verify(token: String): VerifiedIdentity?
}

/**
 * Verifies Clerk session JWTs (RS256) against the issuer's JWKS. Keys are cached and
 * refreshed when an unknown `kid` is seen (nimbus JWKSourceBuilder behaviour).
 */
class ClerkJwtVerifier(
    private val config: ClerkConfig,
    jwkSource: JWKSource<SecurityContext>? = null,
) : TokenVerifier {
    private val log = LoggerFactory.getLogger(ClerkJwtVerifier::class.java)
    private val issuer = requireNotNull(config.issuer) { "CLERK_ISSUER is required" }

    private val processor = DefaultJWTProcessor<SecurityContext>().apply {
        val source = jwkSource ?: JWKSourceBuilder.create<SecurityContext>(URI(requireNotNull(config.jwksUrl)).toURL())
            .cache(true)
            .rateLimited(true)
            .refreshAheadCache(false)
            .retrying(true)
            .build()
        jwsKeySelector = JWSVerificationKeySelector(JWSAlgorithm.RS256, source)
        // Clerk session tokens carry typ=JWT (or no typ).
        jwsTypeVerifier = DefaultJOSEObjectTypeVerifier(JOSEObjectType.JWT, null)
        jwtClaimsSetVerifier = DefaultJWTClaimsVerifier<SecurityContext>(
            JWTClaimsSet.Builder().issuer(issuer).build(),
            setOf("sub", "exp", "iat"),
        ).apply { maxClockSkew = 60 }
    }

    override fun verify(token: String): VerifiedIdentity? {
        if (token.length > 8192) return null
        val claims = try {
            processor.process(token, null)
        } catch (e: java.text.ParseException) {
            log.debug("Rejected session token: {}", e.message)
            return null
        } catch (e: com.nimbusds.jose.proc.BadJOSEException) {
            log.debug("Rejected session token: {}", e.message)
            return null
        } catch (e: com.nimbusds.jose.JOSEException) {
            log.debug("Rejected session token: {}", e.message)
            return null
        }
        if (config.authorizedParties.isNotEmpty() && !authorizedParty(claims)) {
            log.debug("Rejected session token: azp {} not authorised", claims.getClaim("azp"))
            return null
        }
        val subject = claims.subject?.takeIf { it.isNotBlank() } ?: return null
        val email = claims.getStringClaimOrNull("email")?.takeIf { it.isNotBlank() }
        val verifiedClaim = claims.getClaim("email_verified")
        val emailVerified = when (verifiedClaim) {
            is Boolean -> verifiedClaim
            is String -> verifiedClaim.equals("true", ignoreCase = true)
            else -> false
        }
        return VerifiedIdentity(
            subject, email, emailVerified && email != null, claims.getStringClaimOrNull("name")?.takeIf { it.isNotBlank() },
        )
    }

    /**
     * Whether the token's `azp` is one of ours (section 3.1). Clerk sets it to the Origin of the browser request that
     * minted the token, so a web session always has one and it must be listed. The native SDK sends no Origin, so the
     * mobile app's tokens have none: accepted only with [ClerkConfig.acceptNativeSessions]. An `azp` that is present
     * but empty or not a string is never accepted.
     */
    private fun authorizedParty(claims: JWTClaimsSet): Boolean {
        if (!claims.claims.containsKey("azp")) return config.acceptNativeSessions
        val azp = claims.getClaim("azp") as? String ?: return false
        return azp.isNotEmpty() && azp.trimEnd('/') in config.authorizedParties
    }

    private fun JWTClaimsSet.getStringClaimOrNull(name: String): String? =
        try { getStringClaim(name) } catch (_: java.text.ParseException) { null }
}

/**
 * Development-only bearer tokens: `dev.<base64url(JSON)>` with
 * `{"sub":"dev_<anything>","email":"x@y.z","name":"X Y"}`. Treated as a verified email.
 * Only constructed when AUTH_MODE=dev, which AppConfig refuses outside development.
 */
class DevTokenVerifier : TokenVerifier {
    @Serializable
    private data class DevClaims(val sub: String? = null, val email: String? = null, val name: String? = null)

    private val json = Json { ignoreUnknownKeys = true }
    private val emailRegex = Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")

    override fun verify(token: String): VerifiedIdentity? {
        if (!token.startsWith("dev.") || token.length > 4096) return null
        val claims = try {
            val decoded = Base64.getUrlDecoder().decode(token.removePrefix("dev.").trimEnd('='))
            json.decodeFromString(serializer<DevClaims>(), decoded.toString(Charsets.UTF_8))
        } catch (_: IllegalArgumentException) { // Bad base64 or JSON (SerializationException is an IllegalArgumentException).
            return null
        }
        val sub = claims.sub?.trim() ?: return null
        if (!sub.startsWith("dev_") || sub.length > 100) return null
        val email = claims.email?.trim()?.lowercase()?.takeIf { emailRegex.matches(it) } ?: return null
        return VerifiedIdentity(sub, email, true, claims.name?.trim()?.take(200)?.takeIf { it.isNotEmpty() })
    }

    companion object {
        fun token(sub: String, email: String, name: String?): String {
            val payload = buildString {
                append("{\"sub\":").append(Json.encodeToString(kotlinx.serialization.serializer<String>(), sub))
                append(",\"email\":").append(Json.encodeToString(kotlinx.serialization.serializer<String>(), email))
                if (name != null) append(",\"name\":").append(Json.encodeToString(kotlinx.serialization.serializer<String>(), name))
                append('}')
            }
            return "dev." + Base64.getUrlEncoder().withoutPadding().encodeToString(payload.toByteArray())
        }
    }
}
