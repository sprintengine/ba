package ie.bookanything.storage

import ie.bookanything.config.AppConfig
import ie.bookanything.config.ConfigException
import ie.bookanything.config.S3Config
import ie.bookanything.support.LocalHttpServer
import java.nio.file.Files
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class AssetStorageTest {
    private val business = UUID.fromString("00000000-0000-0000-0000-00000000b001")
    private val file = "0f8fad5b-d9cb-469f-a165-70867728950e.png"

    @Test
    fun `local disk storage writes tenant-scoped files and refuses anything else`() {
        val root = Files.createTempDirectory("uploads")
        val storage = LocalDiskStorage(root, "http://localhost:3000")
        val url = storage.put(business, file, byteArrayOf(1, 2, 3), "image/png")
        assertEquals("http://localhost:3000/api/v1/public/uploads/$business/$file", url)
        assertEquals(storage.publicPrefix(business) + file, url)
        assertTrue(Files.exists(root.resolve("businesses/$business/$file")))
        assertContentEquals(byteArrayOf(1, 2, 3), storage.read(business, file))
        assertNull(storage.read(UUID.randomUUID(), file), "another business's folder")
        Files.writeString(root.resolve("secret.txt"), "secret")
        for (bad in listOf(
            "../../secret.txt",
            "..", "", "x.png", "$file/../../../secret.txt", file.replace(".png", ".svg"), "..%2F..%2Fsecret.txt", file.uppercase(),
        )) {
            assertNull(storage.read(business, bad), bad)
            assertFailsWith<StorageException> { storage.put(business, bad, byteArrayOf(1), "image/png") }
        }
        assertFailsWith<IllegalArgumentException> { AssetKeys.key(business, "../x.png") }
        assertEquals("businesses/$business/$file", AssetKeys.key(business, file))
        assertEquals("image/webp", AssetKeys.contentType("a.webp"))
        assertNull(AssetKeys.contentType("a.gif"))
        assertTrue(AssetKeys.FILE_NAME.matches(AssetKeys.newFileName("jpg")))
    }

    @Test
    fun `the SigV4 signer matches the AWS documented S3 GET example`() {
        // https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html (GET Object)
        val auth = SigV4.authorization(
            SigV4.Request(
                method = "GET", canonicalPath = "/test.txt",
                headers = mapOf(
                    "Host" to "examplebucket.s3.amazonaws.com", "Range" to "bytes=0-9",
                    "x-amz-content-sha256" to "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                    "x-amz-date" to "20130524T000000Z",
                ),
                payloadSha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            ),
            SigV4.Credentials("AKIAIOSFODNN7EXAMPLE", "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", "us-east-1"),
            "20130524T000000Z",
        )
        assertEquals(
            "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request," +
                "SignedHeaders=host;range;x-amz-content-sha256;x-amz-date," +
                "Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
            auth,
        )
        assertEquals("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", SigV4.sha256Hex(ByteArray(0)))
        assertEquals("a%20b%2Fc~d", SigV4.uriEncode("a b/c~d", encodeSlash = true))
        assertEquals("a%20b/c", SigV4.uriEncode("a b/c", encodeSlash = false))
    }

    @Test
    fun `S3 storage signs a path-style PUT for custom endpoints`() {
        LocalHttpServer { LocalHttpServer.Response(200) }.use { server ->
            val clock = Clock.fixed(Instant.parse("2026-10-05T08:00:00Z"), ZoneOffset.UTC)
            val config = S3Config("site-images", "auto", server.baseUrl, "AKIDTEST", "secret/key", "https://cdn.example")
            val storage = S3Storage(config, clock = clock)
            val bytes = "png bytes".toByteArray()
            val url = storage.put(business, file, bytes, "image/png")
            assertEquals("https://cdn.example/businesses/$business/$file", url)
            assertEquals("https://cdn.example/businesses/$business/", storage.publicPrefix(business))
            val req = server.requests.single()
            assertEquals("PUT", req.method)
            assertEquals("/site-images/businesses/$business/$file", req.path)
            assertContentEquals(bytes, req.body)
            assertEquals("image/png", req.headers["content-type"])
            assertEquals(AssetKeys.CACHE_CONTROL, req.headers["cache-control"])
            assertEquals("20261005T080000Z", req.headers["x-amz-date"])
            assertEquals(SigV4.sha256Hex(bytes), req.headers["x-amz-content-sha256"])
            // Re-sign what the server received: the signature must match.
            val host = server.baseUrl.removePrefix("http://")
            val signed = listOf("cache-control", "content-type", "host", "x-amz-content-sha256", "x-amz-date")
            val expected = SigV4.authorization(
                SigV4.Request(
                    "PUT", req.path, emptyMap(), signed.associateWith { if (it == "host") host else req.headers.getValue(it) },
                    SigV4.sha256Hex(bytes),
                ),
                SigV4.Credentials("AKIDTEST", "secret/key", "auto"), "20261005T080000Z",
            )
            assertEquals(expected, req.headers["authorization"])
            assertTrue(
                expected.startsWith(
                    "AWS4-HMAC-SHA256 Credential=AKIDTEST/20261005/auto/s3/aws4_request,SignedHeaders=cache-control;content-type;host;x-amz-content-sha256;x-amz-date,",
                ),
            )
        }
        LocalHttpServer { LocalHttpServer.Response(403, "<Error>AccessDenied</Error>", "application/xml") }.use { server ->
            val storage = S3Storage(S3Config("b", "us-east-1", server.baseUrl, "a", "s", "https://cdn.example"))
            assertFailsWith<StorageException> { storage.put(business, file, byteArrayOf(1), "image/png") }
        }
        val aws = S3Storage(S3Config("my-bucket", "eu-west-1", null, "a", "s", "https://cdn.example"))
        assertEquals(
            "https://my-bucket.s3.eu-west-1.amazonaws.com/businesses/$business/$file", aws.objectUrl(AssetKeys.key(business, file)),
        )
    }

    @Test
    fun `storage configuration and selection`() {
        val prod = mapOf(
            "APP_ENV" to "production", "DATABASE_URL" to "jdbc:postgresql://db/x", "TOKEN_SECRET" to "0123456789abcdef0123",
            "CLERK_ISSUER" to "https://clerk.example", "CLERK_AUTHORIZED_PARTIES" to "https://bookanything.ie",
        )
        val dev = mapOf("APP_ENV" to "development")
        val s3 = mapOf(
            "STORAGE_S3_BUCKET" to "b",
            "STORAGE_S3_ACCESS_KEY_ID" to "a", "STORAGE_S3_SECRET_ACCESS_KEY" to "s", "STORAGE_PUBLIC_BASE_URL" to "https://cdn.example/",
        )

        assertIs<DisabledStorage>(AssetStorages.fromConfig(AppConfig.fromEnvironment(prod)), "production without settings: off")
        val devConfig = AppConfig.fromEnvironment(dev)
        assertEquals(".data/uploads", devConfig.storage.localDir)
        assertIs<LocalDiskStorage>(AssetStorages.fromConfig(devConfig))
        assertIs<LocalDiskStorage>(AssetStorages.fromConfig(AppConfig.fromEnvironment(prod + ("STORAGE_LOCAL_DIR" to "/var/uploads"))))
        val s3Config = AppConfig.fromEnvironment(dev + s3)
        assertEquals(S3Config("b", "us-east-1", null, "a", "s", "https://cdn.example"), s3Config.storage.s3)
        assertIs<S3Storage>(AssetStorages.fromConfig(s3Config), "S3 wins over the local default")
        assertEquals(
            "http://minio:9000",
            AppConfig.fromEnvironment(dev + s3 + ("STORAGE_S3_ENDPOINT" to "http://minio:9000/")).storage.s3!!.endpoint,
        )
        assertEquals("auto", AppConfig.fromEnvironment(dev + s3 + ("STORAGE_S3_REGION" to "auto")).storage.s3!!.region)
        for (missing in s3.keys) {
            val e = assertFailsWith<ConfigException> { AppConfig.fromEnvironment(dev + (s3 - missing)) }
            assertTrue(e.message!!.contains(missing), e.message)
        }
        assertFailsWith<ConfigException> { AppConfig.fromEnvironment(dev + ("STORAGE_S3_ENDPOINT" to "http://minio:9000")) }
        assertFailsWith<ConfigException> { AppConfig.fromEnvironment(dev + s3 + ("STORAGE_PUBLIC_BASE_URL" to "cdn.example")) }
        assertEquals("unsplash-key", AppConfig.fromEnvironment(dev + ("UNSPLASH_ACCESS_KEY" to "unsplash-key")).unsplashAccessKey)
        assertNull(devConfig.unsplashAccessKey)
    }
}
