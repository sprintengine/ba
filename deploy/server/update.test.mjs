// update.sh against a fake `docker` and a fake deploy.sh shipped "inside the image": which release it deploys, when it
// leaves things alone, and how it backs out of a failed one. Runs in CI's Scripts job (npm run test:scripts).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = "ghcr.io/example/bookanything-backend";
const digest = (n) => `${REPO}@sha256:${String(n).repeat(64).slice(0, 64)}`;

// The fake docker: `pull` honours $FAKE/pull-exit, `image inspect` prints $FAKE/tag (the digest the tag names),
// `create`/`cp`/`rm` hand out $FAKE/image/ as the image's /app/deploy. Every call is appended to $FAKE/calls.
const FAKE_DOCKER = `#!/usr/bin/env bash
echo "$*" >> "$FAKE/calls"
case "$1" in
  pull) exit "$(cat "$FAKE/pull-exit" 2> /dev/null || echo 0)" ;;
  image) cat "$FAKE/tag"; echo "other.example/mirror@sha256:${"f".repeat(64)}" ;;
  create) echo container-1 ;;
  cp) [[ -n "$(ls -A "$FAKE/image")" ]] || { echo "Could not find the file /app/deploy/." >&2; exit 1; }; cp -R "$FAKE/image/." "$3" ;;
  rm) ;;
  *) echo "unexpected docker $*" >&2; exit 99 ;;
esac
`;

// The image's deploy.sh: records what it was asked to deploy and, when it succeeds, pins it in .env as the real one does.
const FAKE_DEPLOY = `#!/usr/bin/env bash
echo "$1" >> "$FAKE/deployed"
[[ "$(cat "$FAKE/deploy-exit" 2> /dev/null || echo 0)" == 0 ]] || exit 1
grep -v '^BACKEND_IMAGE=' .env > .env.next; echo "BACKEND_IMAGE=$1" >> .env.next; mv .env.next .env
`;

function vm() {
  const root = mkdtempSync(join(tmpdir(), "update-"));
  const dir = join(root, "opt");
  const fake = join(root, "fake");
  const bin = join(root, "bin");
  for (const d of [dir, fake, bin, join(fake, "image")]) mkdirSync(d, { recursive: true });
  copyFileSync(join(here, "update.sh"), join(dir, "update.sh"));
  chmodSync(join(dir, "update.sh"), 0o755);
  writeFileSync(join(bin, "docker"), FAKE_DOCKER, { mode: 0o755 });
  writeFileSync(join(dir, ".env"), `BACKEND_REPOSITORY=${REPO}\nTRACK=staging\nBACKEND_IMAGE=\n`);
  const image = (version) => {
    writeFileSync(join(fake, "image", "deploy.sh"), FAKE_DEPLOY);
    writeFileSync(join(fake, "image", "update.sh"), readFileSync(join(here, "update.sh")));
    writeFileSync(join(fake, "image", "compose.yml"), `# compose of ${version}\n`);
  };
  const env = { ...process.env, FAKE: fake, PATH: `${bin}:${process.env.PATH}` };
  return {
    root,
    dir,
    image,
    tag: (n) => writeFileSync(join(fake, "tag"), `${digest(n)}\n`),
    set: (name, value) => writeFileSync(join(fake, name), String(value)),
    run: (...args) => spawnSync(join(dir, "update.sh"), args, { env, encoding: "utf8" }),
    deployed: () => (existsSync(join(fake, "deployed")) ? readFileSync(join(fake, "deployed"), "utf8").split("\n").filter(Boolean) : []),
    read: (file) => (existsSync(join(dir, file)) ? readFileSync(join(dir, file), "utf8") : null),
  };
}

test("deploys the digest the tag names, with the deploy files from that image", () => {
  const v = vm();
  v.image("one");
  v.tag(1);
  const result = v.run();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(v.deployed(), [digest(1)]);
  assert.match(v.read(".env"), new RegExp(`BACKEND_IMAGE=${digest(1).replace(/[.]/g, "\\.")}`));
  assert.equal(v.read("compose.yml"), "# compose of one\n");
  assert.equal(v.read(".failed-image"), null);
});

test("does nothing while the tag still names what runs", () => {
  const v = vm();
  v.image("one");
  v.tag(1);
  v.run();
  const again = v.run();
  assert.equal(again.status, 0);
  assert.equal(again.stdout, "");
  assert.deepEqual(v.deployed(), [digest(1)]);
});

test("a failed release keeps the old one, restores its deploy files and is not retried until the tag moves", () => {
  const v = vm();
  v.image("one");
  v.tag(1);
  v.run();
  v.image("two");
  v.tag(2);
  v.set("deploy-exit", 1);
  const failed = v.run();
  assert.equal(failed.status, 1);
  assert.match(failed.stdout, /deploying .* failed; the previous release keeps running/);
  assert.equal(v.read(".failed-image").trim(), digest(2));
  assert.equal(v.read("compose.yml"), "# compose of one\n");
  assert.match(v.read(".env"), /sha256:1{64}/);
  // The next tick leaves it alone.
  assert.equal(v.run().status, 0);
  assert.deepEqual(v.deployed(), [digest(1), digest(2)]);
  // The tag moves on (a fix shipped): that is deployed, and the failure forgotten.
  v.image("three");
  v.tag(3);
  v.set("deploy-exit", 0);
  assert.equal(v.run().status, 0);
  assert.deepEqual(v.deployed(), [digest(1), digest(2), digest(3)]);
  assert.equal(v.read(".failed-image"), null);
  assert.equal(v.read("compose.yml"), "# compose of three\n");
});

test("an image without its deploy files is refused before anything changes, and not retried", () => {
  const v = vm();
  v.tag(4);
  const result = v.run();
  assert.equal(result.status, 1);
  assert.match(result.stdout, /carries no \/app\/deploy/);
  assert.deepEqual(v.deployed(), []);
  assert.equal(v.read(".failed-image").trim(), digest(4));
  assert.equal(v.run().status, 0, "the next tick waits for the tag to move");
  // One that carries some of them is refused too.
  writeFileSync(join(v.root, "fake", "image", "compose.yml"), "# compose\n");
  v.tag(5);
  const partial = v.run();
  assert.equal(partial.status, 1);
  assert.match(partial.stdout, /carries no deploy\/deploy\.sh/);
});

test("a failed pull, a bad TRACK or an unconfigured VM leave everything alone", () => {
  const v = vm();
  v.image("one");
  v.tag(1);
  v.set("pull-exit", 1);
  const pull = v.run();
  assert.equal(pull.status, 1);
  assert.match(pull.stdout, /could not pull/);
  assert.deepEqual(v.deployed(), []);

  writeFileSync(join(v.dir, ".env"), `BACKEND_REPOSITORY=${REPO}\nTRACK=prod\n`);
  assert.equal(v.run().status, 78);
  // Not configured yet (as bootstrap.sh leaves it): nothing to do, and not an error every minute.
  writeFileSync(join(v.dir, ".env"), "BACKEND_REPOSITORY=\nTRACK=\n");
  const idle = v.run();
  assert.equal(idle.status, 0);
  assert.match(idle.stdout, /nothing to do/);
  assert.deepEqual(v.deployed(), []);
});

test("--status says what the tag names and what runs", () => {
  const v = vm();
  v.image("one");
  v.tag(1);
  const status = v.run("--status");
  assert.equal(status.status, 0);
  assert.match(status.stdout, /track: {3}ghcr\.io\/example\/bookanything-backend:staging/);
  assert.match(status.stdout, /running: nothing yet/);
  assert.deepEqual(v.deployed(), []);
});
