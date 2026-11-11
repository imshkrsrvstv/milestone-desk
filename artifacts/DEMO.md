# Milestone Desk demonstration

The refreshed film is `demo.mp4`: approximately 89 seconds, H.264, 1440 × 1000, with readable captions and no audio track. It is below the competition’s three-minute limit. `demo-captions.srt` and `demo-scenes.json` contain the matching text and measured timing.

The recording uses the actual redesigned application through its local `/lab/milestone/` route. It shows both complete appearances, the genuine comparison grid and the actual review workflow. The project, client, delivery notes and reviewer identities are explicitly fictional.

The landing-page milestone’s AI suggestions, human acceptance and sandbox invoice were created and verified earlier. **The film labels these saved results honestly.** During recording, the app retrieves that same draft from the actual PayPal sandbox and strictly validates it again. No new invoice is created or retried; no invoice is sent. The final manual-review form contains unsaved demonstration decisions and does not unlock an invoice.

The source footage preserves actual interaction order and elapsed timing. No fixture provider response is substituted. The exported video adds a caption strip below the app footage; the browser recorder’s lower blank region is replaced by the matching scripted captions. The app footage is not altered to imply a provider result. `demo-source.webm` retains the original capture.

A private verification receipt is retained in `data/redesign-demo-verification.json`, excluded from public source. It confirms the same invoice ID and no additional attempt. No credentials, tokens, real client records or account settings appear in the film.

## Scene sequence

1. Existing fictional project and the evidence-to-invoice purpose.
2. Light and dark appearances.
3. Real AG Grid search and milestone comparison.
4. Actual evidence, human acceptance and invoice states.
5. Source criteria and explicitly fictional delivery log.
6. Saved real AI excerpts, validated against that log.
7. Previously recorded human decisions and reasons.
8. Existing verified sandbox draft.
9. Fresh retrieval from the actual PayPal sandbox.
10. Recorded activity journal and export option.
11. A separate unaccepted milestone with invoice creation locked.
12. Free manual review and unsaved requests for better evidence.
13. Closing view in dark appearance.

## Reproduce

Start the app with an existing fictional reviewed milestone and verified sandbox draft. The recorder requires that record and never creates an invoice. Its separate manual-review example saves only a local review on the second fictional milestone; the populated acceptance form is closed without saving.

Set `PLAYWRIGHT_MODULE` to an installed Playwright module path if it is not in the project’s module search path. Use `DEMO_URL` to point to another local mount.

```sh
node scripts/record-demo.mjs
node scripts/render-captions.mjs
ffmpeg -i artifacts/demo-source.webm -f concat -safe 0 -i artifacts/caption-frames/concat.txt \
  -filter_complex '[0:v]crop=1440:888:0:0[screen];[1:v]fps=25,format=yuv420p[caption];[screen][caption]vstack=inputs=2:shortest=1[v]' \
  -map '[v]' -c:v libx264 -crf 20 -pix_fmt yuv420p -an -movflags +faststart artifacts/demo.mp4
```

## Gallery

`thumbnail.png` is a direct 1200 × 800 view of the running redesigned application (3:2; approximately 100 KB). `gallery/` contains fresh desktop, 390px phone and 320px phone captures in both themes. Overview, evidence and receipt screens show only the existing fictional project. These are actual app screenshots, not mockups.

Publication and Devpost submission are separate steps handled by the project owner’s publishing workflow.
