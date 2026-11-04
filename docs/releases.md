# Releases

How a change travels from `main` to production. The machines it lands on are [`deployment.md`](deployment.md); the
commit and version rules are [`engineering.md`](engineering.md) §14. **Nothing is live yet**: until the one-time setup
below is done, the train builds and tests nightlies and every deploy step is a notice.

## The train

`.github/workflows/release.yml` has three channels, each a run of the same workflow:

| Channel | When | What it does | Tag |
|---|---|---|---|
| **nightly** | 02:43 UTC if `main` moved since the last nightly; or Run workflow → `nightly` | builds the backend image once (amd64 and arm64, native runners, one manifest list) and the website once per environment, runs the whole CI gate against the commit, smoke-tests the image like a VM runs it, then publishes a prerelease with `images.json` (the digest) and the website builds, and moves `:nightly` | `v0.4.0-nightly.20261104.17` |
| **release** | Run workflow → `release` (optionally naming a nightly) | **staging only**, never a rebuild: tags the nightly's digest `:staging` (the staging VM deploys it), waits until the staging API reports that build, deploys the nightly's staging website build to the staging Worker, runs the deployed smoke tests, and records the candidate (`staged.json`: digest, file hashes, run) as a prerelease | `v0.4.0-rc.21` |
| **promote** | Run workflow → `promote` (optionally naming a candidate), approved by the `production` environment's reviewer | **production only**: the newest candidate whose Staging job passed, checked byte for byte against `staged.json`; tags its digest `:production` and `:latest`, waits for the production API, deploys the same nightly's production website build, smoke-tests it and creates the release | `v0.4.0` |

The versions are SemVer from the Conventional Commits since the last release (`scripts/release/version.mjs`): the
nightly and the candidate carry the version they would be released as. A nightly whose commit has nothing since the
last release is not built. The gap between release and promote is the human gate: look at staging, then promote.

**The first version.** `v0.1.0` is the baseline: the tag (and a release with no build attached) on `main` once the
release train itself was merged, before anything was deployed. Every later version is derived from it: the first
nightly after it is `v0.2.0-nightly…` if a `feat` has landed since, `v0.1.1-nightly…` otherwise. With no stable tag at
all the train would start at `0.1.0`. `1.0.0` is never derived: it is a decision, made by tagging `v1.0.0` by hand on
a released commit, after which the train counts from it.

Rules the train enforces (`scripts/release/release.mjs`, tested in `release.test.mjs`):

- A scheduled nightly whose last nightly is no longer in `main`'s history (history rewritten) **fails**, rather than
  quietly building past what shipped. Dispatch a nightly by hand once that is understood.
- A commit is staged and released once; a candidate behind production (not containing production's commit) is refused:
  production only moves forward.
- A promote needs the candidate's Staging job to have passed, its files to match `staged.json`, and, once the
  production website is set up, a staging website deploy and a production website build in the candidate.
- Two queues (nightly; release and promote together). A run in progress is never cancelled, since a cancelled release
  could leave a half-moved tag; GitHub keeps one waiting run per queue, so a second dispatch while one waits replaces
  the waiting one.
- Every channel runs from `main` ("Use workflow from: main"); a run from another branch is refused.
- Staging and production run the train's logic from the workflow's own commit (`.train`), so a candidate staged before a
  change to the train is promoted by the train as it is now.

Why each environment has its own website build: Next.js inlines `NEXT_PUBLIC_*` (the app URL, Clerk's publishable key)
and the `/api` rewrite's destination at build time. Both builds come from the same commit in the same nightly run;
production gets exactly the file that nightly built, verified by hash, never a rebuild at promote time.

`/v1/health` reports the build the API runs (`version`: the nightly the image was built as, which stays its name once
staged and released, since it is never rebuilt), which is how the train knows a VM has deployed the new tag and how
the monitor knows what answers. A release's notes name its nightly.

## Runbook

1. **Ship to staging**: Actions → Release → Run workflow → channel `release` (empty nightly = the newest). Watch the run;
   its summary links staging.
2. **Look at staging**: the website, a booking, the dashboard, whatever the release changed.
3. **Promote**: Actions → Release → Run workflow → channel `promote` (empty = the newest candidate that passed). Approve
   the `production` deployment when GitHub asks.
4. Check the release's notes and the production monitor's next run.

**Rollback**:

- The normal way: revert the change on `main` (`revert: …`), and ship it through the train (dispatch a nightly, then
  release and promote). Production only moves forward, so the revert is a new release.
- In an emergency, put an earlier release back without waiting: retag `:production` to that release's digest (from its
  `images.json`), and the VM deploys it within a minute (as long as that release's migrations are behind the database's,
which they are):
  `docker buildx imagetools create -t ghcr.io/<owner>/bookanything-backend:production ghcr.io/<owner>/bookanything-backend@sha256:<digest>`
  (with `docker login ghcr.io` as someone with write access to the package). For the website,
  `npx wrangler rollback` (from `frontend/`, `--env staging` for staging) returns the Worker to its previous version.
  Then ship the revert through the train, because the next promote moves `:production` again. Migrations are not
  rolled back: they are written to work with the release before them (deployment.md, section 3).

## The production monitor

`.github/workflows/monitor.yml` runs every two hours (`scripts/release/monitor.mjs`): the API's health (database
included), that it runs a release, the headers every API answer carries (`Cache-Control: no-store`, `X-Request-Id`), and
the website's home page and headers, the API through the website, and OAuth discovery on its origin. A problem fails
the run and opens one issue, "Production monitor: problem" (label `monitor`); when the set of problems changes it
comments, and the first clean run closes it. It does nothing, with a notice, until `PRODUCTION_API_URL` is set.

## One-time setup

GitHub (Settings of the repository):

1. **Environments**: create `staging` and `production`. On `production`, add the owner as a **required reviewer**: every
   promote waits for that click. Limit `production`'s deployment branches to `main`.
2. **Packages**: after the first nightly, make `bookanything-backend` public (Package settings → visibility), so the VMs
   pull without credentials.
3. **Repository variables** (non-secret; Settings → Secrets and variables → Actions → Variables):

| Variable | Example | Read by |
|---|---|---|
| `STAGING_APP_URL`, `PRODUCTION_APP_URL` | `https://staging.bookanything.ie`, `https://bookanything.ie` | the website builds and deploys, the smoke tests, the monitor |
| `STAGING_API_URL`, `PRODUCTION_API_URL` | `https://api-staging.bookanything.ie`, `https://api.bookanything.ie` | the website builds (`/api` rewrite), the Workers' `BACKEND_ORIGIN`, the wait for a VM's deploy, the monitor |
| `STAGING_CLERK_PUBLISHABLE_KEY`, `PRODUCTION_CLERK_PUBLISHABLE_KEY` | `pk_test_…`, `pk_live_…` | the website builds |
| `CLOUDFLARE_ACCOUNT_ID` | the account's ID | website deploys (unset: no website deploys) |
| `STAGING_BUSINESS_MCP_ENABLED`, `PRODUCTION_BUSINESS_MCP_ENABLED` | `false` to hide the business agents guide | optional, the website builds |
| `STAGING_ASSISTANT_ENABLED`, `PRODUCTION_ASSISTANT_ENABLED` | `true` to present Bo on the public pages (unset: off); set with the backend's `ASSISTANT_ENABLED` | optional, the website builds |
| `STAGING_WEBMCP_ORIGIN_TRIAL_TOKEN`, `PRODUCTION_WEBMCP_ORIGIN_TRIAL_TOKEN` | Chrome's origin-trial token for that origin | optional, the website builds |
| `STAGING_WEBMCP_EDGE_ORIGIN_TRIAL_TOKEN`, `PRODUCTION_WEBMCP_EDGE_ORIGIN_TRIAL_TOKEN` | Edge's origin-trial token for that origin | optional, the website builds |
| `STAGING_APPLE_APP_IDS`, `PRODUCTION_APPLE_APP_IDS`; `…_ANDROID_PACKAGE_NAME`; `…_ANDROID_SHA256_FINGERPRINTS` | as frontend/README.md §9 | optional, the Workers' runtime vars |

4. **Repository secrets**:

| Secret | What |
|---|---|
| `CLOUDFLARE_API_TOKEN` | the Workers token (deployment.md 2.1, step 5) |
| `STAGING_CLERK_SECRET_KEY`, `PRODUCTION_CLERK_SECRET_KEY` | each Clerk instance's secret key, the Workers' only secret |
| `PUBLICATION_DENYLIST` | the pull request check's list of names that must never be published (engineering.md §14) |

The nightly database backups have secrets and variables of their own (deployment.md section 4). The VMs need nothing
from GitHub: they pull public images. Each VM's own settings are its env files (deployment.md 2.2).
