# Manual advance payments

Published to Hostinger on 2026-10-19 with the backend, additive migration and frontend together. Activation verified unchanged existing record counts, booking quotes and ledger, preserved private configuration, and successful schema/route checks. The published entry matches the local manifest; all 32 JavaScript/CSS assets return the correct content types. Real public home/login pages rendered in Chromium and WebKit at phone and desktop widths without JavaScript errors or horizontal overflow. This is a manual payment-reference and owner-verification workflow, not a bKash/Nagad API integration or an automatic transfer/refund service.

## Customer and owner workflow

1. A customer must supply a phone number at registration and before requesting a slot. Existing customers without one can add it in My Profile. Profile saves require a phone; admin-created customer/owner accounts require one too.
2. New complexes must supply their receiving account number and payment service. bKash is the default; Nagad, Rocket or a typed service name can be chosen.
3. The owner configures an advance and deadline. New complex registration defaults to **enabled, ৳500, 60 minutes**. Deadlines support **30–10,080 minutes (7 days)**. Amounts must be positive and no more than ৳100,000; the booking's advance is capped at its total quote. Free bookings do not require an advance.
4. The customer requests an available slot. Advance terms, payment service and receiving number are snapshotted alongside the original total/commission rate. Do not pay before acceptance.
5. Owner/admin acceptance reserves the slot and starts its deadline. The customer sees the receiving account, amount and deadline in My Bookings. No platform commission is charged yet for advance-required bookings.
6. The customer pays the owner externally and submits a transaction ID or reference name before the deadline.
7. A timely reference **keeps the slot reserved for owner review**, even when the original deadline later passes. This was the user's explicit choice. Submitting a reference does not automatically confirm payment or charge commission.
8. The owner checks the actual account and confirms receipt. They may also confirm directly after a customer's phone call without requiring a submitted reference. Only the authorized owner or an admin may do this.
9. Confirmation records the verifying actor/time and charges the original quoted commission exactly once. The booking is now shown publicly as already booked. Remaining customer balance is total quote minus the confirmed advance.

Owner payments have a separate page: **Owner dashboard → Advance payments & settings** (`/dashboard/turf/payments`). The same receipt panel is available for a selected booking in the owner field schedule. Admins open **Complexes & Commission → Manage advance payments** for each active complex. Admin tools load on expansion rather than polling every closed complex card.

## Settings and compatibility

- Owners and admins can turn advance collection off for **new requests**. An existing pending/accepted request keeps its snapshotted terms.
- For an existing accepted unpaid/review booking, owners/admins can explicitly **Waive advance**. This confirms the booking and records normal commission, without claiming any money was received.
- Changes to a provider, number, advance amount, window, field rate or commission rate do not rewrite an existing booking's terms.
- Existing complexes migrate with collection **off**, amount 500 and window 60, because their real receiving numbers are unknown. Owners must finish payment-account setup before enabling it. Newly registered complexes require the number even if they choose not to collect advances.
- Existing requests/bookings migrate with `advance_required=false` and keep their previous quotes, states and commission. They are not retroactively put on payment timers.
- Existing phone values are retained; the migration does not invent missing numbers or modify personal details.

## Payment states

The existing booking statuses remain compatible; no MySQL booking-status enum expansion is needed. An owner-accepted payment hold uses `status=booked` plus separate advance state:

| Advance state | Meaning |
| --- | --- |
| `not_required` | Existing/no-advance/free booking; normal acceptance commission applies. |
| `awaiting_acceptance` | Advance-required request still awaiting the owner; no deadline yet. |
| `awaiting_payment` | Owner accepted; deadline running; no submitted reference. |
| `submitted` | Customer submitted on time; held for manual owner review. |
| `confirmed` | Receipt checked by owner/admin; commission charged. |
| `waived` | Advance requirement explicitly removed; commission charged, no receipt claimed. |
| `expired` | Unsubmitted payment deadline elapsed; booking is cancelled and time released. |
| `cancelled` | Advance-required request/hold cancelled without confirming receipt. |

Public slot display is deliberately simpler: **Available**, **In process**, **Already booked** or **Unavailable**. Pending owner requests and unpaid/review holds are in process. Only available future-start slots can be requested. Occupied slots remain visible and have no request button.

Public slot responses use an explicit allowlist. They do not expose customer identifiers, names, phone numbers, payment references, account numbers or commission. Complex receiving numbers are hidden from public model JSON. Authorized booking/customer/owner responses supply the required payment details privately.

## Expiration, rejection and cancellation

- An `awaiting_payment` booking with an elapsed deadline is cancelled, marked `expired` and releases a separate available slot record. Original history is retained. No commission debt was created, so no automatic finance reversal is necessary.
- A delayed `ExpireBookingAdvance` queue job is scheduled after acceptance, using the deadline. The existing database queue/Hostinger worker processes it. Expiration therefore requires a running worker for unattended background operation and can follow the worker's scheduling/polling delay.
- A `bookings:expire-advances` command and a scheduled every-minute sweep are provided as a fallback. If using Laravel's scheduler, run `schedule:run` every minute. The original mail queue cron also processes the delayed expiry jobs; it does not need to be replaced with `schedule:run`.
- Public slot reads, customer bookings reads, owner schedule/inbox reads and booking/deletion operations also sweep relevant due holds. This protects availability when a worker has missed a run. Server-side checks reject late reference/receipt actions rather than trusting browser time.
- Expiration and confirmation/submission use the same complex → field → booking lock order and recheck state under lock. Repeated expiry does not create duplicate open slots or charges.
- Timely `submitted` references do not auto-expire. Owners must confirm or reject them. This can hold a slot indefinitely until review; a reference alone is not proof of payment.
- Rejection requires a reason. Before the original deadline, the customer can correct their reference. Rejection after the deadline releases the hold immediately. A correction does not restart the payment clock.
- An unpaid hold without a submitted reference can be cancelled immediately without commission. Once receipt is claimed by a submitted reference, cancellation follows owner review. Confirm/reject/waive actions require a pending cancellation to be decided first.
- If cancellation is accepted before any commission was charged, no commission reversal is eligible. Once payment was confirmed/commission charged, the existing owner-cancellation/admin-commission-reversal workflow applies.
- Refunds of actual money transferred to an owner remain a direct arrangement with that owner. A platform commission credit does not refund a bKash/Nagad transfer.
- An unconfirmed advance cannot be used to complete a booking or leave a qualifying review.

The configured deadline is measured after acceptance. It is not silently shortened to the slot start. For near-start bookings, the deadline can extend past the start; owners should choose appropriate terms/acceptance timing or deliberately waive the advance. This implementation does not add a new advance-booking lead-time restriction.

## Privacy and audit

The migration adds encrypted receiving numbers to complexes and encrypted payment number/reference/note snapshots to bookings. Existing `APP_KEY` must be preserved. Status, deadline and financial amount fields remain queryable. Receipt confirmation/waiver records the responsible actor; submissions, rejections, confirmations, expiry and settings updates are audited. Private reference content in activity details is encrypted by the existing activity service.

No automatic duplicate-transaction verification is claimed: a reference name can legitimately repeat. Owners must verify actual receipt and avoid crediting one external transfer twice.

## API additions

| Method | Path under `/api` | Access |
| --- | --- | --- |
| GET / PUT | `/turfs/{turf}/advance-settings` | That owner or admin/superadmin. |
| GET | `/turfs/{turf}/advance-bookings` | That owner or admin/superadmin; paginated, submitted-first inbox. |
| POST | `/bookings/{booking}/advance/reference` | The booking's customer; `{reference}`; 10/minute throttle. |
| POST | `/bookings/{booking}/advance/confirm` | Owner/admin; optional `{note}`; receipt must actually be checked. |
| POST | `/bookings/{booking}/advance/reject` | Owner/admin; required `{reason}`. |
| POST | `/bookings/{booking}/advance/waive` | Owner/admin; deliberately confirms without advance receipt. |

`GET /turfs/{turf}/slots` now includes occupied rows with `display_status` and `can_request`; consumers must stop assuming this endpoint contains only bookable slots. Returned prices remain formatted to two decimal places. Canonical statuses and amounts remain unchanged by Bangla display localization.

## Deployment and verification

Migration: `backend/database/migrations/2026_10_19_000001_add_manual_advance_payments.php`. Applied locally with a targeted forward migration; no database reset.

Use `scripts/update-hostinger-advance-payments.ps1` for the complete release after review. A frontend-only upload would be insufficient. The release must preserve `.env`, encryption key, original quotes and ledger records; normalize static permissions; clear cached routes/views; restart queue workers; and verify actual entry JavaScript MIME type. Keep the existing queue runner functioning. No production migration, real transfer, payment confirmation or live booking cancellation is performed merely by preparing this release locally.

Automated checks cover default/setup requirements, ownership, phone requirements, snapshots/caps, direct/receipt confirmation, no premature or duplicate commission, exact deadlines, delayed/sweep/read-triggered expiry, correction/rejection, privacy, cancellation, completion/review eligibility and legacy no-advance compatibility. Browser smoke checks use mocked APIs, so they do not send money, email, or alter real bookings.

Recorded local validation: **135 backend tests / 1,084 assertions passed**. Frontend build and lint passed with existing warnings; the Bangla catalog audit reports no missing literal keys. Chromium and WebKit checks passed at 390px/1440px in light/dark modes for customer references and occupied slots, plus owner/admin direct receipt confirmation, settings changes, disable controls, Bangla input preservation, required registration inputs and multipart Boolean payloads. The release script's PowerShell/shell syntax and Laravel schema/route verification were checked locally. No production release has been started.

Both browser engines also verified that the payment-entry form disables when its displayed deadline passes; a timely submitted reference remains in the review state instead. Pagination returns to a valid inbox page when confirming the last item on a later page.
