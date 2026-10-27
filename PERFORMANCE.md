# Sportsevo local performance check

Measured on this Windows workspace on 2026-10-09 (Asia/Dhaka), using PHP 8.2.12, MySQL, Node 22 and headless Microsoft Edge. These are local observations, not production capacity guarantees.

## Database and API

The controller benchmark temporarily adds 40 complexes, 80 fields, 10,000 slots, 2,000 commission entries and 960 photos in one transaction. It rolls back all those records and its test outbox records. No fixture mail is dispatched. Database auto-increment counters may still advance after rollback.

Both controller runs used the same PHP CLI setup without opcode caching. Times include controller execution and JSON serialization, but not HTTP bootstrapping, network transport or authentication middleware. Each endpoint has five timed samples; SQL time/query count is captured in an additional run.

| Scaled controller measurement | Before | After |
| --- | ---: | ---: |
| Platform dashboard median | 181.04 ms | 65.77 ms |
| Platform dashboard queries | 145 | 17 |
| Directory median | 181.17 ms | 14.99 ms |
| Directory JSON payload | 149,348 bytes | 16,070 bytes |
| Owner dashboard median | 66.02 ms | 44.79 ms |

Fresh database connections took approximately 13 ms median; `SELECT 1` took 0.67 ms median. The largest fix was replacing per-complex wallet queries with ledger aggregation. Booking/date filters now use indexable timestamp ranges. New composite indexes support field availability, owner/customer booking lists, public reviews, cover ordering and approval filters. Directory cards receive one ordered cover per complex; full photos remain available on detail/owner pages.

A final repeat after verification measured platform/directory/owner medians of 88.01 / 13.61 / 57.43 ms, with the same 17 / 5 / 24 queries. Connection and `SELECT 1` medians were 2.61 / 0.26 ms. The table records the first comparable before/after runs; this repeat illustrates normal timing variation. Fixture identifiers advance across rollbacks, so serialized payload sizes can vary slightly.

Actual HTTP requests, with the real database (no complexes currently registered):

| Endpoint | Original dev server median | Optimized local server warm median |
| --- | ---: | ---: |
| `/api/turfs` | 523.28 ms | 64.24 ms |
| `/api/sports` | 477.08 ms | 63.44 ms |

The original server was port 8000 without opcode caching. The optimized server is port 8001 with process-local opcode caching and production-built frontend assets. Each new-server endpoint had one first request plus seven warm samples. The first shell request took 434 ms; the shell's warm median was 48 ms. These are **not** populated-database HTTP or concurrent-load measurements. The PHP development server handles requests serially; production needs a suitable web server/process manager and its own load test.

## Browser rendering

Production-built assets were tested at 1440×900 desktop and 390×844 mobile, with browser cache disabled. Mobile tests used 4× CPU throttling, not network throttling. The real API has an empty directory; a separate intercepted API scenario renders 12 cards without writing any real records.

Latest complete run:

| Scenario | FCP / LCP | CLS | Scroll frame p95 | Scroll frames over 50 ms |
| --- | ---: | ---: | ---: | ---: |
| Desktop, real API | 476 / 476 ms | 0 | 16.9 ms | 0 / 179 |
| Mobile, real API, 4× CPU | 264 / 264 ms | 0 | 16.8 ms | 0 / 179 |
| Mobile, 12 mocked cards, 4× CPU | 220 / 220 ms | 0 | 16.8 ms | 0 / 179 |

There was no horizontal overflow or unhandled runtime exception. The latest run had no startup long tasks; an earlier populated/mobile run recorded two, with the longest 158 ms. Browser scheduling, warm OS caches and CPU load vary, so these observations do not prove universally stutter-free rendering. The fixture does not exercise downloading real customer photos or real mobile hardware.

Typing five characters generated zero directory requests; submitting Search generated exactly one. Platform filters debounce for 250 ms, and stale requests are cancelled. Refetches retain already-rendered cards/bookings instead of unmounting them behind a spinner. Heavy fixed-background/mobile blur and shadow animation work was reduced, images decode asynchronously, and reduced-motion preferences disable motion.

The original eager JavaScript entry was approximately 397 KB. The new entry is 238.33 KB, plus its 76.53 KB shared SEO/API chunk and 0.71 KB runtime (about 315.57 KB initial uncompressed JavaScript, not 238 KB total). Login, detail, owner and admin code load on demand. Production gzip estimates are build estimates; the local PHP server does not provide production compression automatically.

Mocked authenticated UI smoke checks also passed: owner commission display/field switching, admin cancellation/history/email panels, blocked admin access to the owner dashboard, and customer field-dependent prices. Real backend tests cover the corresponding authorization and booking behavior. The browser check additionally verifies one CSRF refresh and one retry after a simulated expired-token response; no real login is submitted.

## SMTP and queue

Three real SMTP connection/TLS/authentication samples had a median of 3,792.55 ms, without sending mail. One separately authorized test message was submitted to the requested Gmail address:

- Queue submission: 52.36 ms.
- Submission through SMTP acceptance: 5,116.63 ms, including queue polling, connection and sending.
- Outbox record 41: `sent`, one attempt.

This confirms that the configured SMTP server accepted the test message. It does **not** confirm inbox placement, inbox arrival time or future delivery guarantees. No second test message was submitted. SMTP's external network/server latency cannot be made equivalent to a local database query; queued delivery keeps it off the booking response path. Keep the worker running. Delivery failures retain tracked status and retries; admins can inspect/retry them.

## Reproduce

From the workspace root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-local.ps1
cd backend
php scripts/benchmark.php --fixtures
php scripts/benchmark.php --fixtures --smtp
php artisan test
cd ../frontend
npm run build
npm run lint
node scripts/performance-smoke.cjs
```

The benchmark never sends email, including with `--smtp`. The browser script uses Windows Edge by default; set `BROWSER_PATH` for another installed Chromium executable, and pass another base URL as its first argument if necessary. Its separate temporary browser profile is retained for diagnosis. Do not run synthetic fixtures against a busy production database: rollback avoids persistent rows, but inserts still consume resources and hold locks during the test.

### Homepage 3D preview (2026-10-13)

The React Three Fiber stadium loads in a separate lazy chunk after the hero becomes visible and the browser is idle. The same procedural Three/Fiber stadium now renders on phones, tablets and desktop. Reduced-motion mode uses the same scene without eased pointer movement. A transparent WebP capture of that exact stadium is the loading/failure fallback, including on data-saving connections and unavailable/lost WebGL contexts. It scales with the canvas height to match the camera framing across screen sizes, without briefly showing unrelated football artwork. Fonts are self-hosted with `font-display: swap`. The previous 610KB hero photograph is no longer requested.

iPhone Safari compatibility checks (2026-10-13): the reported broken layout could not be reproduced in current Playwright WebKit against the live site. Touch-device form fields now use at least 16px text to avoid focus zoom, without disabling pinch zoom. The mobile menu uses its measured header height and the dynamic viewport, with a `vh` fallback, to keep its account links reachable on short screens. Showcase/contact grid columns have explicit zero minimum widths; filmstrip cards do not shrink; the cinematic image container clips its transformed layers explicitly. Local WebKit and Chromium checks passed at 320, 375, 390, 430, 768, 844 and 1440px, covering 280px-high menu scrolling, the automatic sport transition, login/register and field font sizes. These are engine tests, not physical iPhone certification; the user's iOS version and a screenshot of the reported break were not provided.

The Safari adjustments were published through the frontend-only Hostinger updater. A subsequent live WebKit check verified the new entry bundle, image decoding, 16px mobile fields, a menu fitting a 280px-high viewport, and no JavaScript errors or horizontal overflow. Activation log: `backend/storage/logs/hostinger-frontend-update.log` (`FRONTEND_UPDATE_COMPLETE`).

The canvas uses demand rendering with a timer capped at approximately 24fps while the hero is visible. The entire stadium, lights and ring rotate through 360 degrees over about 24 seconds, with a gentle vertical float and a bobbing/spinning ball. Dragging horizontally turns the full scene; touch scrolling remains available through `touch-action: pan-y`. The timer and decorative orbit animation pause offscreen, in hidden tabs and for reduced-motion preferences. Rendering resumes from the paused orientation without a time jump. The maximum pixel ratio remains 1.5 (1.25 when reported device memory is below 4GB), with simple procedural geometry and no shadow maps or post-processing. WebGL failure or context loss displays the matching static stadium. The optional 3D chunk is approximately 244KB gzipped.

The sports showcase below the playground heading now uses generated artistic portraits of Ronaldo Nazário (R9), Ricky Ponting, Roger Federer and Kobe Bryant, preserving the dark emerald/coral artwork aesthetic. Kobe's selected revision has a clearly visible hoop and white net in the upper-left background. The optimized 1000px WebP files are approximately 103–164KB each. CSS perspective transforms simulate a drone camera bank, dolly and crossfade. The current image loads lazily; only the next image is prefetched when the section is visible, and prefetch is skipped on data-saving connections. There is no second WebGL canvas for the showcase. Original PNGs and the full imagegen edit prompts are retained locally; see `frontend/src/assets/sports/PROMPTS.md`.

The tour switches every seven seconds and keeps moving on hover. It stops offscreen or in a hidden tab. Swiping horizontally changes sports, and keyboard right/left arrows advance/rewind when the carousel is focused (click the section or Tab to it). No visible buttons were added. Manual navigation restarts the seven-second timer. Vertical scrolling and pinch zoom remain available. Reduced-motion users can change slides manually without animation; their filmstrip keeps native horizontal scrolling. This animates the camera around still artwork rather than generating video or animating athlete limbs.

Manual navigation checks (2026-10-13) passed in Chromium and WebKit at 390px and 1440px, including wraparound, focus-scoped keyboard handling, unchanged slides on artwork clicks, seven-second timer reset, offscreen pause and reduced-motion navigation. Chromium native touch events verified horizontal swiping and vertical page scrolling over the artwork. No buttons, horizontal page overflow or browser errors were found. These are browser-engine checks, not a physical iPhone test.

The navigation update was published through the frontend-only Hostinger updater (`FRONTEND_UPDATE_COMPLETE`); the same checks passed against `https://sportevo.games`. Database and environment files were not included.

The portrait update passed local Chromium and WebKit checks at 390px and 1440px: all four assets decode, slide titles/portraits/captions advance together, and the outgoing portrait is removed after the transition. Mobile rendering of the selected Kobe portrait was visually checked after the transition settled. The Reach Us form now uses white surfaces, dark text and visible green borders/focus indicators in light mode; checks verified both light and dark styles without sending messages. Frontend build and lint passed with existing lint warnings.

The portraits and light form were published through the frontend-only Hostinger updater (`FRONTEND_UPDATE_COMPLETE`). A live WebKit phone check verified all four updated images, the settled Kobe revision, the white contact form, and no JavaScript errors or horizontal overflow. Database and environment files were not included in this update.

The full stadium tour was checked in Chromium and WebKit on phone (390px) and desktop (1440px): automatic movement and drag controls work, rendering pauses offscreen, and reduced-motion mode stays static. Chromium native touch-event checks verified vertical scrolling over the canvas and hidden-tab pause/resume. The steady render timer targets 24fps; observed software-rendered rates were approximately 18–25fps, which is not a physical-device performance guarantee. Earlier responsive checks covered 320px through 1440px, sport search, FAQ expansion and light mode. Build and lint passed (existing lint warnings remain).

Verification: **61 backend tests, 405 assertions passed**; frontend builds passed; lint exited successfully with existing React effect/fast-refresh warnings (not a warning-free result). New regression tests cover constant platform query counts, archived commission debt/refund arithmetic, per-complex cover selection/full detail photos, midnight date boundaries and same-origin session login on the local port.
