# syntax=docker/dockerfile:1.7
#
# The API as one image: `docker build -f backend/Dockerfile .` from the repository root (see docs/deployment.md).
# The image runs `backend serve`; `docker run <image> migrate` applies the migrations and exits (the deploy step,
# RUN_MIGRATIONS_ON_START is off outside development).

# Build on the builder's own platform: the output is JVM bytecode, so one Gradle run serves amd64 and arm64 images.
FROM --platform=$BUILDPLATFORM eclipse-temurin:25-jdk AS build
WORKDIR /src
# Wrapper and build scripts first, so a code-only change reuses the dependency download.
COPY gradlew settings.gradle.kts build.gradle.kts gradle.properties ./
COPY gradle ./gradle
COPY backend/build.gradle.kts ./backend/
COPY backend/src ./backend/src
# One JVM instead of gradle.properties' two 2 GB ones (the compiler runs in Gradle's process), and no tests: CI's
# Backend job runs those. A Docker VM with 2 GB needs --build-arg GRADLE_JVMARGS="-Xmx1g -XX:MaxMetaspaceSize=384m".
ARG GRADLE_JVMARGS="-Xmx1536m -XX:MaxMetaspaceSize=512m"
RUN --mount=type=cache,target=/root/.gradle \
    ./gradlew --no-daemon --console=plain \
      -Dorg.gradle.jvmargs="$GRADLE_JVMARGS" \
      -Pkotlin.compiler.execution.strategy=in-process \
      :backend:installDist

FROM eclipse-temurin:25-jre-alpine AS runtime
RUN addgroup -S -g 10001 app && adduser -S -u 10001 -G app -h /app app
WORKDIR /app
COPY --from=build --chown=root:root /src/backend/build/install/backend /app
# The VM's deploy files travel with the release: deploy/server/update.sh installs them from the image it deploys.
COPY --chown=root:root deploy/server/compose.yml deploy/server/deploy.sh deploy/server/update.sh /app/deploy/

# Sized for the container's memory limit (BACKEND_MEMORY in compose, 1 GB on a 4 GB VM): the heap takes 60% of it, and
# metaspace, the code cache, direct buffers and thread stacks are capped, so the process stays inside the limit and an
# OutOfMemoryError (which exits, for Docker to restart a clean process) comes before the kernel's kill. Serial GC suits
# a heap under 1 GB on one or two cores.
ENV JAVA_OPTS="-XX:MaxRAMPercentage=60 -XX:InitialRAMPercentage=25 -XX:MaxMetaspaceSize=256m -XX:ReservedCodeCacheSize=96m -XX:MaxDirectMemorySize=128m -Xss512k -XX:+UseSerialGC -XX:+ExitOnOutOfMemoryError" \
    APP_HOST=0.0.0.0 \
    PORT=8080

# Which build this is: the release train passes the nightly's version; /v1/health and the startup log report it.
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION

USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=4s --start-period=60s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/v1/health" || exit 1

ENTRYPOINT ["/app/bin/backend"]
CMD ["serve"]
