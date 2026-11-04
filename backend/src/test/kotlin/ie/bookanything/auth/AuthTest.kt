package ie.bookanything.auth

import com.nimbusds.jose.JOSEObjectType
import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.JWSHeader
import com.nimbusds.jose.crypto.MACSigner
import com.nimbusds.jose.crypto.RSASSASigner
import com.nimbusds.jose.jwk.JWKSet
import com.nimbusds.jose.jwk.RSAKey
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator
import com.nimbusds.jwt.JWTClaimsSet
import com.nimbusds.jwt.SignedJWT
import com.sun.net.httpserver.HttpServer
import ie.bookanything.config.AppEnv
import ie.bookanything.config.AuthMode
import ie.bookanything.config.ClerkConfig
import ie.bookanything.support.Fixtures
import ie.bookanything.support.TestConfig
import ie.bookanything.support.TestEnv
import ie.bookanything.support.assertError
import ie.bookanything.support.assertStatus
import ie.bookanything.support.b
import ie.bookanything.support.devToken
import ie.bookanything.support.o
import ie.bookanything.support.obj
import ie.bookanything.support.s
import ie.bookanything.support.unique
import ie.bookanything.support.withApp
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.http.HttpStatusCode
import java.net.InetSocketAddress
import java.util.Date
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Serves a JWKS document locally so Clerk verification is exercised over real HTTP. */
class JwksServer {
    val key1: RSAKey = RSAKeyGenerator(2048).keyID("kid-1").generate()
    val key2: RSAKey = RSAKeyGenerator(2048).keyID("kid-2").generate()
    private val current = AtomicReference(JWKSet(key1.toPublicJWK()))
    val fetches = AtomicInteger(0)
    private val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply {
        createContext("/.well-known/jwks.json") { ex ->
            fetches.incrementAndGet()
            val body = current.get().toString().toByteArray()
            ex.responseHeaders.add("Content-Type", "application/json")
            ex.sendResponseHeaders(200, body.size.toLong())
            ex.responseBody.use { it.write(body) }
        }
        start()
    }
    val issuer = "http://127.0.0.1:${server.address.port}"

    fun rotateTo(vararg keys: RSAKey) = current.set(JWKSet(keys.map { it.toPublicJWK() }))
    fun stop() = server.stop(0)

    fun token(
        key: RSAKey = key1, sub: String = "user_2abc", issuer: String = this.issuer, azp: String? = "http://localhost:3000",
        expiresInSeconds: Long = 300, email: String? = "clerk.user@example.test", emailVerified: Any? = true, name: String? = "Clerk User",
        /** Any other `azp` value (a number, a list), replacing [azp]. */
        rawAzp: Any? = null,
    ): String {
        val now = System.currentTimeMillis()
        val claims = JWTClaimsSet.Builder().subject(sub).issuer(issuer).issueTime(Date(now - 5_000)).notBeforeTime(Date(now - 5_000))
            .expirationTime(Date(now + expiresInSeconds * 1000)).apply {
                (rawAzp ?: azp)?.let { claim("azp", it) }
                email?.let { claim("email", it) }
                emailVerified?.let { claim("email_verified", it) }
                name?.let { claim("name", it) }
            }.build()
        val jwt = SignedJWT(JWSHeader.Builder(JWSAlgorithm.RS256).keyID(key.keyID).type(JOSEObjectType.JWT).build(), claims)
        jwt.sign(RSASSASigner(key))
        return jwt.serialize()
    }
}

class ClerkJwtVerifierTest {
    private lateinit var jwks: JwksServer
    private lateinit var verifier: ClerkJwtVerifier

    @BeforeTest
    fun setUp() {
        jwks = JwksServer()
        verifier = ClerkJwtVerifier(ClerkConfig(jwks.issuer, "${jwks.issuer}/.well-known/jwks.json", setOf("http://localhost:3000"), null))
    }

    @AfterTest
    fun tearDown() = jwks.stop()

    @Test
    fun `valid session token is accepted with profile claims`() {
        val id = assertNotNull(verifier.verify(jwks.token()))
        assertEquals("user_2abc", id.subject)
        assertEquals("clerk.user@example.test", id.email)
        assertTrue(id.emailVerified)
        assertEquals("Clerk User", id.name)
        // email_verified rendered as a string by the session template is accepted too.
        assertTrue(verifier.verify(jwks.token(emailVerified = "true"))!!.emailVerified)
        assertTrue(!verifier.verify(jwks.token(emailVerified = false))!!.emailVerified)
    }

    @Test
    fun `wrong issuer, bad azp, expiry and wrong algorithm are rejected`() {
        assertNull(verifier.verify(jwks.token(issuer = "https://evil.example")))
        assertNull(verifier.verify(jwks.token(azp = "https://evil.example")))
        assertNull(verifier.verify(jwks.token(azp = null)))
        assertNull(verifier.verify(jwks.token(expiresInSeconds = -120)))
        assertNotNull(verifier.verify(jwks.token(expiresInSeconds = -30))) // within 60s leeway
        val hs = SignedJWT(
            JWSHeader(JWSAlgorithm.HS256),
            JWTClaimsSet.Builder().subject("x").issuer(jwks.issuer).expirationTime(Date(System.currentTimeMillis() + 60_000)).build(),
        )
        hs.sign(MACSigner(ByteArray(32) { 7 }))
        assertNull(verifier.verify(hs.serialize()))
        assertNull(verifier.verify("not.a.jwt"))
        // Signed by a key that is not published.
        assertNull(verifier.verify(jwks.token(key = RSAKeyGenerator(2048).keyID("kid-1").generate())))
    }

    @Test
    fun `native sessions (no azp) are accepted only when configured, and web tokens are checked as before`() {
        val listed = "http://localhost:3000"
        val native = ClerkJwtVerifier(
            ClerkConfig(jwks.issuer, "${jwks.issuer}/.well-known/jwks.json", setOf(listed), null, acceptNativeSessions = true),
        )
        // Off (the default): a token without azp is refused.
        assertNull(verifier.verify(jwks.token(azp = null)))
        // On: a token without azp is the app's session.
        assertEquals("user_2abc", native.verify(jwks.token(azp = null))?.subject)
        // A token with an azp is checked either way: listed (also with a trailing slash) or refused.
        assertNotNull(verifier.verify(jwks.token(azp = listed)))
        assertNotNull(native.verify(jwks.token(azp = listed)))
        assertNotNull(native.verify(jwks.token(azp = "$listed/")))
        assertNull(verifier.verify(jwks.token(azp = "https://evil.example")))
        assertNull(native.verify(jwks.token(azp = "https://evil.example")))
        // Present but empty, or not a string: never a native session.
        for (azp in listOf("", "/")) assertNull(native.verify(jwks.token(azp = azp)), "azp '$azp'")
        assertNull(native.verify(jwks.token(rawAzp = 42)))
        assertNull(native.verify(jwks.token(rawAzp = listOf(listed))))
        assertNull(native.verify(jwks.token(rawAzp = false)))
        // Without authorised parties (development) nothing about azp is checked.
        val open = ClerkJwtVerifier(ClerkConfig(jwks.issuer, "${jwks.issuer}/.well-known/jwks.json", emptySet(), null))
        assertNotNull(open.verify(jwks.token(azp = null)))
        assertNotNull(open.verify(jwks.token(azp = "https://anywhere.example")))
    }

    @Test
    fun `unknown kid triggers a JWKS refresh (key rotation)`() {
        assertNotNull(verifier.verify(jwks.token()))
        val before = jwks.fetches.get()
        jwks.rotateTo(jwks.key1, jwks.key2)
        assertNotNull(verifier.verify(jwks.token(key = jwks.key2)))
        assertTrue(jwks.fetches.get() > before)
    }
}

class AuthRoutesTest {
    @Test
    fun `me requires a valid bearer token`() = withApp { api ->
        assertError(HttpStatusCode.Unauthorized, "UNAUTHENTICATED", api.get("/v1/me"))
        assertError(HttpStatusCode.Unauthorized, "UNAUTHENTICATED", api.get("/v1/me", "dev.garbage"))
        assertError(HttpStatusCode.Unauthorized, "UNAUTHENTICATED", api.client.get("/v1/me") { header("Authorization", "Basic abc") })
        val res = api.get("/v1/me", devToken("dev_auth_ok", "auth.ok@bookanything.test", "Auth Ok"))
        assertStatus(HttpStatusCode.OK, res)
        val me = res.obj()
        assertEquals("auth.ok@bookanything.test", me["user"]!!.s("email"))
        assertTrue(me["user"]!!.b("emailVerified"))
    }

    @Test
    fun `the user row follows the token's profile and is only written when something changed`() = withApp { api ->
        val sub = "dev_${unique("profile")}"
        val email = "$sub@bookanything.test"
        fun row() = Fixtures.sqlOne("SELECT name, email::text, updated_at, deleted_at FROM users WHERE clerk_user_id = ?", sub) {
            listOf(it.getString(1), it.getString(2), it.getObject(3).toString(), it.getObject(4)?.toString())
        }!!
        assertStatus(HttpStatusCode.OK, api.get("/v1/me", devToken(sub, email, "Sam Hale")))
        val created = row()
        assertEquals(listOf("Sam Hale", email), created.take(2))

        // Same profile (or no name claim): nothing is written.
        assertStatus(HttpStatusCode.OK, api.get("/v1/me", devToken(sub, email, "Sam Hale")))
        assertStatus(HttpStatusCode.OK, api.get("/v1/me", devToken(sub, email, null)))
        assertEquals(created, row())

        // A changed name is saved.
        assertStatus(HttpStatusCode.OK, api.get("/v1/me", devToken(sub, email, "Sam Hale-Byrne")))
        assertEquals("Sam Hale-Byrne", row()[0])
    }

    @Test
    fun `a deleted user's still valid token does not sign them back in`() = withApp { api ->
        val sub = "dev_${unique("deleted")}"
        val email = "$sub@bookanything.test"
        assertStatus(HttpStatusCode.OK, api.get("/v1/me", devToken(sub, email, "Sam Hale")))
        Fixtures.sql("UPDATE users SET email = NULL, name = NULL, deleted_at = now() WHERE clerk_user_id = ?", sub)
        // Same profile or a new one: refused, and the anonymised row stays as it is.
        for (token in listOf(devToken(sub, email, "Sam Hale"), devToken(sub, email, "Sam Back"), devToken(sub, email, null))) {
            assertError(HttpStatusCode.Unauthorized, "UNAUTHENTICATED", api.get("/v1/me", token))
        }
        val row = Fixtures.sqlOne("SELECT name, email::text, deleted_at FROM users WHERE clerk_user_id = ?", sub) {
            listOf(it.getString(1), it.getString(2), it.getObject(3)?.toString())
        }!!
        assertEquals(listOf(null, null), row.take(2))
        assertNotNull(row[2])
    }

    @Test
    fun `clerk mode verifies JWTs against JWKS and ignores dev tokens`() {
        val jwks = JwksServer()
        try {
            val clerk = ClerkConfig(jwks.issuer, "${jwks.issuer}/.well-known/jwks.json", setOf("http://localhost:3000"), null)
            val env = TestEnv(
                config = TestConfig.config(env = AppEnv.TEST, authMode = AuthMode.CLERK, clerk = clerk),
                verifier = ClerkJwtVerifier(clerk),
            )
            withApp(env) { api ->
                val sub = "user_${System.nanoTime()}"
                val res = api.get("/v1/me", jwks.token(sub = sub, email = "$sub@example.test"))
                assertStatus(HttpStatusCode.OK, res)
                assertEquals("$sub@example.test", res.obj()["user"]!!.o.s("email"))
                assertError(HttpStatusCode.Unauthorized, "UNAUTHENTICATED", api.get("/v1/me", devToken("dev_sneaky")))
                assertError(HttpStatusCode.Unauthorized, "UNAUTHENTICATED", api.get("/v1/me", jwks.token(issuer = "https://other.example")))
            }
        } finally {
            jwks.stop()
        }
    }
}
