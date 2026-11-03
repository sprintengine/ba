plugins {
    kotlin("jvm")
    kotlin("plugin.serialization")
    id("io.ktor.plugin")
    application
    id("org.jlleitschuh.gradle.ktlint")
    id("dev.detekt")
    id("org.jetbrains.kotlinx.kover")
}

group = "ie.bookanything"
version = "0.1.0"

application {
    mainClass.set("ie.bookanything.ApplicationKt")
}

kotlin {
    jvmToolchain(21)
}

val testcontainersVersion = "2.0.5"

dependencies {
    implementation("io.ktor:ktor-server-core-jvm")
    implementation("io.ktor:ktor-server-netty-jvm")
    implementation("io.ktor:ktor-server-content-negotiation-jvm")
    implementation("io.ktor:ktor-serialization-kotlinx-json-jvm")
    implementation("io.ktor:ktor-server-call-logging-jvm")
    implementation("io.ktor:ktor-server-call-id-jvm")
    implementation("io.ktor:ktor-server-status-pages-jvm")
    implementation("io.ktor:ktor-server-cors-jvm")
    implementation("io.ktor:ktor-server-compression-jvm")
    // The customer MCP reads the JSON-RPC body for its scope check before the MCP transport reads it.
    implementation("io.ktor:ktor-server-double-receive-jvm")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-slf4j:1.11.0")
    implementation("com.zaxxer:HikariCP:6.3.3")
    implementation("org.postgresql:postgresql:42.7.13")
    implementation("org.liquibase:liquibase-core:4.33.0")
    implementation("com.nimbusds:nimbus-jose-jwt:10.10")
    implementation("ch.qos.logback:logback-classic:1.5.38")
    // Phase B2 integrations. Each is optional at runtime and only used when its env keys are set.
    implementation("com.stripe:stripe-java:33.4.2")
    implementation("com.anthropic:anthropic-java:2.67.0")
    // Used directly for the SSRF-guarded website fetch (custom DNS filtering); also the Anthropic SDK transport.
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    // Public MCP endpoint (stateless Streamable HTTP).
    implementation("io.modelcontextprotocol:kotlin-sdk-server:0.16.0")

    testImplementation(kotlin("test"))
    testImplementation(platform("org.junit:junit-bom:5.14.4"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
    testImplementation("io.ktor:ktor-server-test-host-jvm")
    testImplementation("org.testcontainers:testcontainers-postgresql:$testcontainersVersion")
    testImplementation("org.testcontainers:testcontainers-junit-jupiter:$testcontainersVersion")
}

tasks.test {
    useJUnitPlatform()
    maxHeapSize = "1g"
    testLogging {
        events("failed")
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
        showStandardStreams = false
    }
    // Tests must run against real Postgres; never silently skip.
    systemProperty("bookanything.requireDocker", "true")
}

// Formatting: rules and line length come from the root .editorconfig. `ktlintFormat` fixes, `ktlintCheck` verifies.
ktlint {
    version.set("1.8.0")
    filter {
        exclude { it.file.path.contains("/build/") }
    }
}

// Static analysis on top of detekt's defaults; the tuned rules live in config/detekt.yml. There is no baseline: fix a
// finding, or suppress it locally with a reason for a deliberate design choice (see docs/engineering.md).
detekt {
    buildUponDefaultConfig = true
    config.setFrom(files("config/detekt.yml"))
    parallel = true
}

// `check` runs detekt with type resolution (detektMain/detektTest), which most potential-bug rules need, instead of
// the plain `detekt` task (no type resolution, so a subset of the same findings).
tasks.named("check") {
    setDependsOn(dependsOn.filterNot { it is TaskProvider<*> && it.name == "detekt" })
    dependsOn("detektMain", "detektTest")
}

// Coverage from the JUnit run. `koverVerify` fails below the floors: measured coverage minus ~2 points (lines 96.9%,
// branches 61.9% when they were set; Kotlin's generated data-class branches keep the branch figure low). Raise them as
// coverage grows; never lower one to get a build through.
kover {
    reports {
        total {
            xml { onCheck = true }
            html { onCheck = true }
            verify {
                rule("Line coverage floor") {
                    minBound(95)
                }
                rule("Branch coverage floor") {
                    minBound(60, kotlinx.kover.gradle.plugin.dsl.CoverageUnit.BRANCH)
                }
            }
        }
    }
}
