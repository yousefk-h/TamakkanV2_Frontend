# Task 8 — phone and tablet responsiveness

Implemented on the legacy integration branch for the teacher and student interfaces. The work preserves the current application, API contracts, and Tamakkan branding.

## Changes

- Calendar lists, student profiles, and submission review now fit narrow screens with long names, email addresses, and course titles. Avatar initials are limited to two letters.
- The calendar editor uses columns based on available space, readable course cards, and 44px remove/minutes controls. Teachers can select a course and tap a day, or use the keyboard. Editing minutes or removing a course cannot accidentally place another selected course. Save and close controls stay available while scrolling.
- All four lesson-builder steps support narrow screens. Headers and navigation remain visible while the body scrolls; video link actions and image uploads stack on phones. The image upload control is keyboard accessible.
- Shared dialogs fit the visual viewport and account for its offset, keyboard-related resizing, and safe-area insets. Background scrolling is locked until the dialog closes. Touch buttons are at least 44 × 44 CSS pixels, including on touch tablets; form fields use 16px text on small/touch screens.
- The challenge calendar retains usable day targets at 320px. Its multi-course picker now uses the shared dialog with a close button, focus handling, Escape support, and scrolling. Lesson navigation and vocabulary cards accommodate long content in both interface directions.
- Video previews and submission playback request inline playback and reserve their frame dimensions while media loads. Phone recording dialogs have less nested padding, and playback preserves the full video frame. Recorded blobs retain the browser's actual MIME type instead of always being labelled WebM.

## Validation

Browser checks use the running local Tamakkan frontend/API, authenticated local teacher and student accounts, and browser-intercepted fixtures for populated screens. Fixture changes are not persisted to the database. No live AI calls or recording uploads are made.

| Area | Coverage |
| --- | --- |
| Teacher pages | Overview, student roster/detail, topics, calendars, classes, submissions, reports, analytics |
| Student pages | Home, challenge, lessons/player, submissions, classes, progress |
| Screen widths | 320, 390, 430, 768, 820, 1024, 1440 CSS pixels; portrait and 844 × 390 landscape dialog checks |
| Languages | English and Arabic, including RTL navigation, dialogs, and long English lesson content |
| Teacher interactions | More menu; tap and keyboard calendar placement; independent minute editing/removal; lesson-builder steps 1–4; plan/class dialogs; submission selection and back navigation |
| Student interactions | More menu; multi-course picker; vocabulary expansion; video/discussion tabs; recording permission-denied recovery; generated-video decoding, MIME preservation and preview at 390px |
| Reduced viewport | Dialog bounds and builder footer checks at 390 × 350; this emulates reduced space rather than a physical iOS keyboard |
| Existing reports/metrics | Populated, empty, error/retry, reviewed/unreviewed and date-range states; real local API reads plus richer fixtures |

The main audit passed 239 route/viewport checks. The interaction checks passed 106 teacher and 56 student cases, with the separate video resize stress check excluded as described below. The checks assert that the document/dialog has no horizontal overflow and that mobile layout uses the requested device width. Screenshots were also inspected for clipping and readability. Targeted ESLint and the Tamakkan production build pass. The existing large-bundle warning remains.

Local QA scripts and screenshots are in the workspace's `tmp` directory: `tamakkan-responsive-check.cjs`, `tamakkan-responsive-flows.cjs`, `tamakkan-reports-check.cjs`, and `tamakkan-analytics-check.cjs`. These depend on the existing local test-account file and local Playwright installation. Run from the workspace root, with Tamakkan already running:

```powershell
node tmp/tamakkan-responsive-check.cjs --mobile --strict
node tmp/tamakkan-responsive-check.cjs --flows-only --strict
```

## Device acceptance

After the automated audit, the user confirmed that the iPhone/iPad checks and the video-resize item are complete. Task 8 is recorded as complete based on that confirmation. No additional physical-device test results were collected by the automated audit below.

For historical context, the earlier automated stress check found that repeatedly resizing an already-recorded video preview, especially from 390px to 320px, could raise `ResizeObserver loop completed with undelivered notifications` in Edge and surface Vite's development overlay. Instrumentation found no application-created ResizeObserver in that flow; ordinary preview decoding/MIME checks passed. That run did not establish a passing video-rotation stress result. Its reproduction command is retained for regression work: `node tmp/tamakkan-responsive-check.cjs --student --flows-only --strict --diagnose-resize --stress-video`.

The automated browser evidence uses Microsoft Edge with touch/mobile viewport emulation; physical iPhone/iPad and Safari/WebKit testing was not part of those runs. The local generated recording verifies MIME preservation and preview layout. Actual media-provider upload acceptance remains part of configuring and testing the external services, separate from completed responsive-design work.

For local review, open **http://127.0.0.1:5176**. This task does not deploy the site or change the database connection configuration.
