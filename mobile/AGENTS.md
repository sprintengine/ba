# Mobile app (Expo SDK 57)

Read `README.md` in this folder before changing anything: folder structure, which feature owns which files, how to
use the shared hooks (`@shared/…` is the website's `frontend/src/lib`), the design system, iPad rules, the
accessibility checklist, tests and the definition of done. Architecture: `../docs/mobile.md`.

Expo changes every SDK: check https://docs.expo.dev/versions/v57.0.0/ (and https://docs.expo.dev/llms.txt) instead of
relying on memory, and add packages with `npx expo install`. `ios/` and `android/` are generated; never edit them.

Done means `npm run mobile:check` (from the repo root) is green, and the website's checks too if you touched
`frontend/`.
