# Milestone Desk v1.0.1 — narrated media refresh

[Watch the new demo](https://youtu.be/_zXa-UIFpgg) · [Source and setup](https://github.com/imshkrsrvstv/milestone-desk)

This release replaces the current demonstration with a 128.82 seconds (about 2:09), full-HD product film: problem, solution, actual application walkthrough and closing. It adds local Kokoro neural narration, matching subtitles, an authored thumbnail and a portable scene script. A fixed browser capture and consistent film canvas remove the earlier framing jumps; intentional camera moves make the controls easier to follow. Production notes distinguish saved model results from actual sandbox readback.

Application runtime source, dependencies and payment behavior are unchanged. The original **v1.0.0 tag and release assets remain unchanged**. This is a media/documentation release; the application's package version is unchanged.

PayPal remains sandbox-only. The new recording creates no new order, capture or invoice and sends no invoice. Existing verified sandbox records are read back. All catalog/client/project examples are fictional. The Devpost entry is pending. No award or judging acceptance is claimed.

## Verification

- Final H.264 video: 1920 × 1080, 30 fps; AAC stereo at 48 kHz.
- Measured loudness: −16 LUFS; measured true peak: −1.5 dBTP.
- Representative opening, walkthrough, failure or human-review, and closing frames reviewed; stable source viewport verified.
- Selected release files pass known-credential, credential-pattern, machine-path and public-language scans. Every payload file is listed with size and SHA256 in `PACKAGE-MANIFEST.json`; the manifest does not hash itself.
- No runtime code changed, so existing runtime test results are not represented as newly executed tests for this media update.

## Run and contents

Follow `README.md` with Node.js 22.13 or newer and your own local sandbox/model configuration. `npm test` runs the existing application checks. ProofDeck is optional. The source, tests, setup template, license notices, public documentation, finished video, captions and selected gallery assets are included. Private configuration, databases, account records, raw captures, rendering intermediates and dependencies are excluded.

The ZIP uses fixed archive metadata and includes this exact documentation. A credential byte scan cannot inspect privacy in image pixels; media review is a separate check. Narration is disclosed as synthetic, and AI-assisted development remains disclosed in the project documentation.
