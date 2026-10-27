# Peak-only generation and deleting unused slots

Published to Hostinger on **26 October 2026**.

## Peak-only generation

Open **Create slots → Generate peak-hour slots only**. Enter the peak start/end, price basis/rate and slot duration. Regular start/end inputs are hidden and are not submitted. The server uses the peak window itself as the generation interval and applies the peak rate to every created slot. A 23:00–02:00 window crosses midnight as before. Existing slots outside the window remain untouched; an overlap inside the window rejects the batch atomically. Only complete slots fitting the window are generated.

API: existing `POST /api/turfs/{turf}/slots` accepts `peak_only: true` with `peak_start`, `peak_end`, `peak_pricing_mode`, `peak_rate`, date, field and duration. This mode intrinsically enables peak pricing even if `peak_enabled` is omitted/false. Regular start/end values are excluded from validation and ignored in this mode. Existing mixed regular/peak generation remains available.

## Deleting unused slots

On the owner's field schedule, choose **Select slots to delete**, tap eligible cards or **Select all available slots**, then **Delete selected** and confirm. A single selected eligible slot also has **Delete this slot**. Past available, unused slots can be removed by choosing their date. Protected cards cannot be selected for deletion. If polling detects a selected slot is no longer eligible, the action is disabled until it is deselected. The server rechecks under locks regardless of the screen's state.

Only `available` rows with no customer, decision, advance/reference, commission or related payment/cancellation records qualify. Booked, offline-booked, pending, completed, rejected, cancelled and blocked rows cannot be deleted. A separate unused available row released after a cancellation may be removed; the original cancellation/booking history is preserved.

Owner-only `DELETE /api/turfs/{turf}/slots` accepts `field_id` and distinct `slot_ids` (1–200). Every ID must belong to that active field/complex. Turf, field and slot rows are locked in the established order. The whole batch is rejected if any selected row is missing/protected; there is no partial deletion. Eligible rows are physically removed and each deletion is recorded by the existing activity observer. Financial/cancellation history is never deleted or detached. The owner schedule exposes `can_delete`; public slot DTOs do not expose management flags.

No migration was needed. The release script published the changed backend/frontend files and verified the DELETE route with `PEAK_ONLY_AND_SAFE_SLOT_DELETION_READY`. Activation also reported `EXISTING_ROWS_QUOTES_AND_LEDGER_PRESERVED`, `PRIVATE_CONFIGURATION_PRESERVED` and `ADVANCE_PAYMENTS_UPDATE_COMPLETE`, followed by application live. No real slots were deleted during deployment or verification.

Live verification matched the entry to the local manifest and checked all 34 JS/CSS assets for correct MIME types. Real public home/login pages rendered in Chromium/WebKit at phone/desktop widths without JavaScript errors or overflow; public directory/slot APIs returned valid prices and statuses without private details. The peak-only and deletion interface checks also passed against the published assets at both widths in both engines, with all generation/deletion writes intercepted using test fixtures.

Validation: **166 backend tests / 1,476 assertions**, build/lint, 917 Bangla entries with zero missing literal translations, and Chromium/WebKit phone/desktop checks in both themes. Checks cover overnight peak-only payloads without regular times, protected-card selection, selected/bulk deletion, confirmation and deletion of past unused slots in Bangla. Browser writes use fixtures; tests use an isolated database and fake queues.
