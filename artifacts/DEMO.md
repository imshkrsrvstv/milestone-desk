# Milestone Desk demonstration — media refresh

[Watch the public film](https://youtu.be/_zXa-UIFpgg). The current `demo.mp4` is **128.82 seconds** (about 2:09), 1920 × 1080 at 30 frames per second, H.264 video with **narrated AAC stereo audio**. It stays below the event's three-minute limit. This is the v1.0.1 media refresh; the v1.0.0 release remains available unchanged. The current script is [demo-storyboard.json](../docs/demo-storyboard.json), and `demo-captions.srt` contains matching subtitles.

## Story and production

1. The problem: delivery alone does not establish acceptance.
2. The solution: one record connects agreed milestones, evidence, review and an unsent invoice draft. Actual AG Grid search and selection are shown.
3. Evidence: inspect the agreed criteria and supplied delivery record.
4. AI assistance: review saved real model suggestions with exact source quotations checked by the server.
5. Human review: open another, unaccepted milestone; show its locked invoice step; enter an unsaved needs-work decision and reason.
6. PayPal verification: retrieve and recheck the existing accepted milestone's sandbox draft. Nothing is sent and no new invoice is created.
7. Closing: evidence → human acceptance → verified unsent draft.

The running application is captured at a fixed 1600 × 900 browser viewport and composed on a consistent 1920 × 1080 canvas. Authored graphics, a stable screen frame and restrained camera moves clarify the walkthrough. Clips are trimmed and timed to narration; the film is edited, not an uncut real-time claim. No app screen is generated. The current film does not show theme switching or the activity journal; those remain application features documented in the README.

The project, client, delivery text and reviewer identities are fictional. The landing-page milestone's AI suggestions, human acceptance and sandbox invoice were created and verified earlier. The film identifies those saved results. During recording, the app retrieves that same draft from the actual PayPal sandbox and validates its identity, recipient, amount and status. Supplied test logs are evidence claims, not proof that the app executed those tests. The manual review form remains unsaved and does not unlock an invoice.

## Voice, verification and assets

Narration uses **Kokoro-82M v1.0**, the `af_heart` synthetic voice at speed 0.97, rendered locally through `kokoro-onnx` 0.6.1. This is a neural voice, not a human recording or cloned identity. No music is included. The [Kokoro model](https://huggingface.co/hexgrad/Kokoro-82M) uses Apache-2.0; the [ONNX runtime wrapper](https://github.com/thewh1teagle/kokoro-onnx) uses MIT. The app itself has no speech-engine dependency.

FFprobe verified dimensions, duration, frame rate and streams. Audio was normalized to −16 LUFS with a measured true peak of −1.5 dBTP. Signal checks confirm an audible, controlled track; subjective voice quality is not certified by these measurements. Representative opening, close-up, human-review and closing frames were checked for consistent framing and capture edges.

`thumbnail.png` is an authored product-film graphic. The gallery contains separate direct screenshots of both application themes and mobile layouts. Legacy local capture scripts and scene timings are not the current film recipe. Private provider records, credentials, raw captures and intermediate rendering assets are excluded from publication; the finished video, captions and portable script are included. Reproducing an actual provider readback requires the operator's own sandbox records and credentials.
