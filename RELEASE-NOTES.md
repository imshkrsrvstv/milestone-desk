# Milestone Desk release candidate

This archive is a reviewed local source candidate. It has not been published or submitted to any competition.

PayPal is sandbox-only. No production payment endpoint is provided. Public repository/video hosting and competition submission remain pending owner review. Live test receipts and all account records are intentionally excluded.

## Run and review

Read README.md, create your own local configuration from .env.example, and use Node.js 22.13 or newer. `npm test` runs the core tests. The app opens on loopback port 4344. Each project is independent; ProofDeck is optional. Never publish real credentials, runtime databases or private evidence.

Optional browser tests need Playwright and Google Chrome. Install test tools in your own checkout with `npm install --no-save playwright axe-core`, or set PLAYWRIGHT_MODULE, PROOFDECK_CHROME and AXE_SCRIPT as supported by the test. The packager normalizes reviewed machine-local Playwright/axe fallbacks in the archived copies only. Source applications are not modified.

## Included and excluded

Included: app source, original knowledge/workflows where present, public docs, tests, license notices, required vendored assets, environment template, selected safe provider smoke scripts, final demo.mp4/SRT files, and the explicitly selected thumbnail/gallery screenshots when available. Read the app's documentation before running a smoke script: it may make real sandbox calls, and capture-smoke explicitly captures an already approved sandbox order.

Excluded: environment values, databases, receipts, account data, dependency installations, Git metadata, internal ProofDeck build records, raw video, intermediate frames, and development-only media renderers that depend on private test records. Final footage still requires visual owner review; a byte scan cannot establish that pixels contain no private information.

PACKAGE-MANIFEST.json lists SHA256 hashes and sizes for every delivered file except the manifest itself, plus all declared portability edits. Archive metadata uses one fixed timestamp. Re-running the same packager with unchanged inputs under the same Python/zlib version produces identical bytes.

No portability edits were needed.
A final local MP4 is included. Public hosting and submission are separate steps.
