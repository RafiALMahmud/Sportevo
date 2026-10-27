# Owner field schedule

**Published follow-up, 26 October 2026:** [peak-only generation and deleting selected unused available slots](SLOT-GENERATION-CLEANUP.md) are live and verified. Booked slots cannot be deleted.

**Published follow-up, 26 October 2026:** optional players per side, a unified Football category and redirecting signed-in owners from the homepage to this schedule are live. See [FIELD-PLAYERS.md](FIELD-PLAYERS.md).

**Published update, 26 October 2026:** owners now land here after login, with larger actions and expandable editing forms. Generation supports peak pricing and crossing midnight; available slots can have individual hourly/fixed rates. Read [SLOT-PRICING.md](SLOT-PRICING.md) for the latest rules and release verification. This release includes the explicit offline-booking option below.

Open **Owner dashboard → Field schedule & slot generation** (`/dashboard/turf/schedule`). Choose a field from the dropdown and a date using the calendar or previous/next arrows. Slot cards show time, duration, total price and availability. Selecting a card opens owner actions: block/reopen open slots, accept/reject pending requests, and complete finished accepted bookings. Existing cancellation approval remains on the owner dashboard. Customer contact details remain hidden until acceptance.

## Offline bookings — local follow-up, 19 October 2026

Select a future open slot and choose **Slot status → Already booked (offline)**, optionally enter a note, then press **Mark already booked (offline)**. **Unavailable** remains a separate choice for maintenance/closures and requires a reason. Existing unavailable blocks can be reclassified as offline bookings, or vice versa. An owner can reopen either type before its start time. Past entries stay in the dated owner schedule.

Offline entries have blue borders, an **Already booked (offline)** label and a separate total. Admin slot records show the same classification. Public slot cards show **Already booked**, remain visible and offer no request action. Notes and the marking owner are not exposed publicly. Keep personal contact details out of notes.

Recording an offline booking snapshots the field's current rate for that interval. Later rate edits do not rewrite its recorded price. Reopening restores normal current-rate quoting. This records a reservation, not a verified payment: no customer account, email, advance timer, wallet charge or commission is created. Existing online requests and bookings keep their approval/cancellation workflow and cannot be converted using this control.

API: `PATCH /api/turfs/{turf}/slots/{booking}/availability` accepts `available: false`, `unavailable_type: "offline_booking"` and optional `reason`. Omit the type for the existing unavailable behavior (reason required). Reopen with `available: true`, which clears the type/reason/marker and recorded offline price. Only the actual complex owner may use this endpoint; permissions and field overlap locks are unchanged.

Storage: nullable `bookings.unavailable_type` from `2026_10_19_000002_add_offline_booking_type.php`. Offline records retain `status=unavailable` for blocking/locking purposes and use `unavailable_type=offline_booking` for classification. Old records are unchanged; no text guessing or history conversion occurs. The release script `scripts/update-hostinger-advance-payments.ps1` now includes this migration and the updated backend/frontend. This follow-up was published on **26 October 2026**.

Validation: **140 backend tests / 1,158 assertions**, frontend build/lint, and owner schedule browser checks in Chromium/WebKit at phone/desktop widths with both themes. Browser writes use fixtures, not real accounts or bookings.

Slot generation lives on this page. The selected field and date apply to generation; choose start/end times and a duration from 15–240 minutes. Generating across existing slots is rejected atomically. The generator and price editor open on demand so the initial view stays focused on the schedule.

Fields support `pricing_mode: slot|hour`. Fixed slot pricing uses `price_per_slot` regardless of duration. Hourly pricing uses `price_per_hour`, prorated by actual slot duration and rounded to cents. For example, ৳1,000/hour costs ৳1,500 for 90 minutes. Existing fields default to fixed-slot pricing. Public available-slot responses, owner schedule cards and new booking requests use the same server-side quote function. Customer-submitted prices are ignored. Pending/accepted bookings retain their quoted total and commission when field prices change. Mixed-basis complex cards show “Prices vary by field” instead of comparing incompatible rates.

Migration `2026_10_14_000002_add_field_hourly_pricing.php` adds a defaulted mode and nullable hourly rate; no booking or commission data changes. It was applied to the local database. New complex registration, additional fields, field editing and the schedule price editor all offer both pricing modes.

Validation: **110 backend tests / 854 assertions passed**, covering prorating, rounding, zero rates, fixed prices, quote preservation, unauthorized access, field/date filtering, privacy, validation and migration preservation. Chromium and WebKit checks passed on phone (390px) and desktop (1440px): dashboard navigation, field/date controls, blocking/reopening, acceptance, pricing updates and generation payloads. Light/dark modes had no overflow or browser errors. These UI checks used mock data; no customer emails or hosted bookings were created.

Deploy using `scripts/update-hostinger-field-schedule.ps1`. It uploads only the required backend files and frontend build, backs up the previous code/build, applies the additive migration in maintenance mode, checks unchanged record counts/booking quotes and `.env`, and verifies the main JavaScript URL before bringing the application up. Build directory permissions are normalized to 755 and static files to 644 on activation and rollback. `-Resume` retries the prepared upload. Log: `backend/storage/logs/hostinger-field-schedule-update.log`.

Published on 2026-10-14. The server confirmed `HOURLY_PRICING_READY`, `EXISTING_ROWS_AND_QUOTES_PRESERVED`, `ENTRY_HTTP_JAVASCRIPT_VERIFIED`, `PRIVATE_CONFIGURATION_PRESERVED` and `FIELD_SCHEDULE_UPDATE_COMPLETE`. Live Chromium/WebKit checks verified the new schedule page with mocked owner data and rendered the public homepage, login and complex directory. No hosted prices, reservations or owner settings were modified during verification.
