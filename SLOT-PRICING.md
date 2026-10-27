# Slot prices, overnight generation and simpler owner pages

Published to Hostinger on **26 October 2026**.

## Owner workflow

Owner login, verification, Dashboard navigation and `/dashboard` now open `/dashboard/turf/schedule`. The first registered active field (lowest ID) is selected unless another field is specified in the URL. Owners without a complex have a registration link; field management remains at `/dashboard/turf`.

The main actions are **Create slots**, **Change a slot** and **Manage fields & complex**. Price/offline forms stay collapsed until opened. Management has separate expandable sections for fields/photos, adding a field, balance, cancellations/reviews and notifications. Pending booking requests remain visible. Both pages have larger touch targets, simpler text and more spacing, with English/Bangla and light/dark support.

## Pricing

In Create slots, optionally enable **Use peak-hour pricing** and enter peak start/end, per-slot/per-hour basis and rate. One daily peak window applies to the generated batch; it may cross midnight. Any overlapping slot uses the peak rate for its **whole duration**. Adjacent boundaries do not overlap. An hourly rate scales with duration; a fixed slot rate does not. Rates support 0–100,000 BDT; durations remain 15–240 minutes.

Peak rates are saved per generated slot, with a Peak hours label. Non-peak slots follow the regular field rate unless overridden. Select a future Available slot and open Change slot price to set its own hourly/fixed rate. Use regular field rate clears its override and peak label. Requested, booked, past and blocked slots cannot be repriced; eligible owner blocks must first be reopened.

Public prices, owner prices, customer quotes, capped advances and commission use the same server-calculated amount. Customer-supplied prices are ignored. Booking quotes and peak/custom rates survive regular field-rate edits. Price edits share turf/field/slot locks with requests. Rejection, cancellation or advance expiry releases a new available row retaining the slot-specific rate and peak flag. Offline bookings snapshot their effective price; reopening keeps an explicit rate override. No offline payment or commission is created.

## Midnight

An end time earlier than the start means the next calendar day. `23:00 → 00:00` creates one hourly slot; `23:00 → 03:00` creates four. `00:00 → 02:00` starts at midnight on the selected date. Equal start/end times are rejected. Only complete slots fitting the range are created; next-day conflicts reject the entire batch atomically.

Date filters use each slot's start date in the configured application timezone (Bangladesh in production). After-midnight starts appear on the following date. Cross-date cards show **Ends next day**; public time labels explicitly use Asia/Dhaka.

## Technical details and release

Additive migration: `2026_10_26_000001_add_slot_pricing.php` adds nullable `bookings.slot_pricing_mode`, nullable decimal `slot_rate` and `is_peak=false`. Existing quotes, states and financial records are unchanged. Rollback refuses to discard saved slot rates.

Generation accepts optional `peak_enabled`, `peak_start`, `peak_end`, `peak_pricing_mode` (`slot`/`hour`), `peak_rate`; disabled peak fields are excluded. Owner-only `PATCH /api/turfs/{turf}/slots/{booking}/price` accepts `pricing_mode`/`rate`, or `use_field_price: true`.

`scripts/update-hostinger-advance-payments.ps1` published the backend, migration, offline booking update and frontend. Production activation reported `SLOT_PRICING_SCHEMA_AND_ROUTE_READY`, `EXISTING_ROWS_QUOTES_AND_LEDGER_PRESERVED`, `PRIVATE_CONFIGURATION_PRESERVED` and `ADVANCE_PAYMENTS_UPDATE_COMPLETE`, followed by application live. Both new additive migrations completed. A frontend-only upload is insufficient.

Live verification matched the published entry to the local manifest and checked all 33 JavaScript/CSS assets for correct MIME types. Actual public home/login pages rendered in Chromium/WebKit at 390px and 1440px without JavaScript errors or horizontal overflow. Real public directory/slot APIs returned valid prices, booking states and peak flags, excluding private customer/payment data. The owner-workflow browser checks also passed against the published assets with API writes mocked; no real reservations, prices or payments were changed for verification.

Verification: **152 backend tests / 1,298 assertions**, build/lint (existing warnings), 893 Bangla entries with zero missing literal translations, and Chromium/WebKit at phone/desktop widths in both themes. Browser checks cover owner login, main field selection, generation payloads, pricing/reset, offline/reopening, collapsed management, Bangla and public peak/midnight labels. Browser writes use mocks; no real bookings, transfers or emails were created.
