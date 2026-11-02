# SportEvo

Published 2 November 2026: [paid featured homepage placements](FEATURED-COMPLEXES.md), [public English/Bangla booking guide, 10-minute advance windows and mobile slot-editor popups](BOOKING-UPDATES.md). Admins and superadmins manage placements; only superadmins change SportEvo receiving accounts. Activation and live public-browser checks passed. A same-day Google follow-up automatically connects matching verified Gmail/Workspace accounts on sign-in; see [Google sign-in behavior](MAPS-AND-GOOGLE-SIGN-IN.md).

Published 2 November 2026: [card-free Leaflet/OpenStreetMap search and Google signup/sign-in](MAPS-AND-GOOGLE-SIGN-IN.md), including customer/owner signup and owner onboarding. The same-day follow-up is also live: **Search on map** in customer and owner maps, plus the repair for empty directory filters.

Published with the 2 November deployment: [sports gallery artwork restored](SPORTS-3D.md). The large display uses the previous player pictures and cinematic transitions, while the rolling strip keeps its original sports equipment pictures. The 3D gallery prototype remains inactive in source.

Published follow-up, 26 October 2026: navbar complex search is live and verified. Desktop uses a search icon; the phone menu contains a search field. Queries and filters persist in directory URLs across pagination, Back and refresh.

Published 26 October 2026: [peak/custom slot prices, overnight generation and simpler owner pages](SLOT-PRICING.md). Owners land on the main field schedule after login. The release also includes the explicit offline-booking option.

Published follow-up, 26 October 2026: [optional players per side, Football/Futsal consolidation and returning-owner homepage redirect](FIELD-PLAYERS.md).

Published follow-up, 26 October 2026: [direct peak-only generation and selected deletion of unused available slots](SLOT-GENERATION-CLEANUP.md), including past available slots. Booked/offline/request/history records are protected.

Sports-complex booking with Laravel 12, React 19, Sanctum cookie authentication, and MySQL or SQLite.

For a standalone product brief, PRD, technical handover and ready-to-paste ChatGPT prompt, see [SportEvo complete context](SPORT_EVO_COMPLETE_CONTEXT.md).

The update published on 2026-10-19 adds [manual advance payments](ADVANCE-PAYMENTS.md), required customer phones and visible occupied slots. Required-advance bookings charge commission after receipt confirmation/waiver rather than initial acceptance; existing complexes/bookings retain their previous terms until configured.

## Business rules

- Roles: user, complex owner (`turf`), admin, superadmin. Admins use the platform dashboard, not the owner dashboard.
- One owner account/email registers one complex. Every complex starts with one field; its owner can add fields/facilities with independent sports, photos, prices and schedules.
- Football and cricket fields can both be booked at 11am. Conflicts are checked within the same field, under database locks. Generation is all-or-nothing if any proposed slot overlaps an existing active slot; booking requests must select a generated available slot.
- Owners can mark a future open slot **Unavailable** or **Already booked (offline)** and reopen it from the field schedule. Offline bookings have an optional note, a separate schedule count and booked styling; customers see **Already booked** and cannot request them. Maintenance blocks remain visible as **Unavailable**. These changes are field-specific, prevent overlapping generation/requests and cannot overwrite online requests/bookings. Neither type creates an online customer booking, payment or commission charge. Admins see the classification and notes; changes are recorded in activity history. The explicit offline classification was published on 26 October 2026; see [FIELD-SCHEDULE.md](FIELD-SCHEDULE.md).
- Existing complexes, bookings and photos are migrated to a “Main field.” If legacy data has several complexes for one owner, migration stops before changing anything; assign each complex a separate owner first.
- Prices and commission rates are quoted when a request is submitted. Edits affect new requests, not existing quotes. Commission defaults to 10%; admins can set 0–100%.
- Accepting a booking creates its commission charge once. Until acceptance, owner responses omit the customer relation and user identifier. Phone numbers are encrypted at rest.
- Only customers whose own accepted/completed booking has ended can review a complex. Owners and admins can hide, show or delete reviews. Hidden reviews do not contribute to public ratings, and customer edits do not automatically unhide moderated reviews.

## Cancellation and commission reversal

Pending requests can be cancelled immediately without a charge.

For an accepted booking:

1. The customer requests cancellation, with an optional reason. The booking remains reserved and commission remains owed.
2. The owner accepts or rejects cancellation in their dashboard. Acceptance cancels the booking and releases the field's slot. Rejection keeps the booking.
3. Admins see all cancellation requests. Only after owner acceptance may an admin/superadmin approve or reject the commission reversal.
4. Approval creates a single wallet credit. Rejection leaves the commission owed.

This is a platform-commission reversal, not a customer payment refund. No payment gateway or transfer of customer funds is implemented.

Wallet balance = commission charges − recorded settlements − approved commission reversals. A negative balance is owner credit (for example, a commission reversed after settlement).

## Deletion and history

Owners request complex deletion; only admins/superadmins can approve it or delete directly. Resolve all pending/accepted bookings first. Complexes are archived, not erased: fields, bookings, reviews, wallet entries and credits survive. An archived complex still occupies its owner's one-complex allowance. Delete/archive the complex before an admin removes its owner account.

Account removal also retains historical records while revoking access. Existing emails remain reserved. Regular users/admins can remove their own profiles; complex owners must use the admin-managed workflow.

New activity is stored in the `activities` table and `backend/storage/logs/activity.log`. Admins can search it and download a complete filtered `.txt` export through **Cancellations & History → activity**. Logs record API activity and model changes, not passwords, OTP hashes, email bodies or decrypted phone numbers. Activity capture starts when this feature is deployed; it cannot reconstruct previously unlogged events.

## Email operations

Registration, verification/resend, password reset, booking transitions, cancellation/refund decisions, complex approval and deletion-request decisions use encrypted, database-backed email outbox records.

Run a worker continuously:

```sh
cd backend
php artisan queue:work --sleep=3 --tries=5 --timeout=60
```

Set `QUEUE_CONNECTION=database` and configure a real SMTP mailer in `backend/.env`. SMTP timeouts are bounded; jobs retry up to five times with increasing delays. Admins can inspect pending/retrying/sent/failed status and manually retry failed deliveries in **Cancellations & History → emails**. The email body is never returned by that API. “Sent” means the mail server accepted the message, not guaranteed inbox placement.

Use a process manager/service for the worker in production, and restart workers after deployments using `php artisan queue:restart`. If no worker runs, emails remain queued. `MAIL_MAILER=log` is for local development only and does not deliver email.

Password reset consumes its code once, revokes every API token, rotates remember credentials, deletes database sessions, and invalidates old browser sessions across session drivers.

## Run locally

Preserve an existing `.env`; do not replace it.

For an already installed Windows workspace, the optimized local preview is:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-local.ps1
```

Open http://localhost:8001. This builds the frontend into Laravel's ignored `public/build` directory, reads the asset manifest rather than hard-coded hashes, starts a loopback-only PHP server with the installed opcode cache, and starts an email worker with one-second polling. It does not edit the system `php.ini`, replace your `.env`, or stop existing development servers. Reuse a completed build with `-SkipBuild`; choose another port with `-Port 8002`. The script prints process IDs; output goes to `backend/storage/logs/local-*`. Run `php artisan migrate` first when pulling new migrations. This is local preview hosting, not a production server.

The original hot-reload workflow remains available below. See [PERFORMANCE.md](PERFORMANCE.md) for real timings, benchmark commands and limitations.

```sh
cd backend
composer install
# For a fresh installation only: copy .env.example to .env and configure it.
php artisan key:generate
php artisan migrate --seed
php artisan storage:link
php artisan serve
```

Run the queue worker above in a separate terminal, then:

```sh
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` and `/storage` to http://127.0.0.1:8000. Public photo URLs default to same-origin `/storage`; set `PUBLIC_STORAGE_URL` when hosting assets on another origin.

`APP_TIMEZONE` controls field-generation dates and times (UTC when unset; set `Asia/Dhaka` for Bangladesh before creating schedules). The owner generator displays this timezone; booking timestamps render in the browser's local timezone. Do not change the application timezone on populated databases without converting existing naive datetime values.

Production seeding creates roles, the sport catalogue and the accounts configured in `PlatformAdminSeeder`; it does not seed complexes. Change the seeder's default account passwords before exposing the platform publicly.

Optional development-only sample data:

```sh
cd backend
php artisan db:seed --class=DemoSeeder
```

Demo accounts use the password `password`. Five complexes have five different owner accounts, a main field each and sample booking history. Never run demo seeding in production. The optional frontend mock adapter (`VITE_DEMO_MODE=true`) is not a substitute for exercising the real backend; leave it false for these workflows.

## Verify

```sh
cd backend
php artisan test
cd ../frontend
npm run build
npm run lint
```

Feature tests cover field isolation and pricing, overlap rejection, pending privacy, role gates, cancellation/refund approvals, deletion/history retention, review moderation, tracked-email retries and password-reset revocation.
