# Players per side, Football category and owner entry

Published to Hostinger on **26 October 2026**.

Owners can optionally enter **Players per side** when registering the first field, adding a field, or editing a field under **Manage fields & complex → Edit fields & photos**. Enter one team's size, such as 5, 7 or 11. Values must be whole numbers from 1–100; blank means unspecified. Each field has its own value. Owners may change or clear it. Price-only edits that omit this setting preserve the previous value.

Configured values appear on public field-selection cards, the individual field page and the owner schedule, in English/Bangla. Unspecified values are hidden rather than given a guessed default. `fields.players_per_side` is a nullable integer added by `2026_10_26_000002_add_players_per_side.php`; existing fields initially remain unspecified.

## Football includes Futsal

`2026_10_26_000003_merge_futsal_into_football.php` consolidates Football/Futsal categories, including equivalent existing Bangla names, into the canonical Football row. It first copies both field and complex associations, ignores duplicate Football links, then removes superseded sport rows. Archived field associations are included. Field IDs, prices, team sizes, bookings and financial records are preserved. The merge is transactional and can be retried safely.

SportSeeder now offers Football once. Other sport input recognizes Football/Futsal names in English/Bangla and reuses Football instead of adding a duplicate. Old full-name Futsal search URLs resolve to Football. A browser holding a removed catalogue ID must refresh before saving a selection. The merge changes sport categories and their associations; business and field names remain owner-entered names.

The merge cannot infer which Football links were previously Futsal when rolling back. The release script saves `sports`, `field_sport` and `sport_turf` to the private deployment stage's `sports-before-merge.json` before applying it. The migration refuses an automatic reverse; that private snapshot is needed for an exact reversal. No public backup or credentials file is created.

## Owners bypass the landing page

Owner login already opened `/dashboard/turf/schedule`. A verified signed-in owner visiting `/` now goes there as well. The redirect waits for the cached session hint to be verified, so an expired owner hint falls back to the public landing page. Guests, customers and administrators retain the public landing page. The main active field is selected by default. Owners still access the existing management page using **Manage fields & complex**.

## Release and validation

The release script `scripts/update-hostinger-advance-payments.ps1` published the new field model/controller/service/seeder changes, both migrations, the private sports snapshot and the full frontend. Production reported `FIELD_PLAYERS_AND_FOOTBALL_MERGE_READY`, `EXISTING_ROWS_QUOTES_AND_LEDGER_PRESERVED`, `PRIVATE_CONFIGURATION_PRESERVED` and `ADVANCE_PAYMENTS_UPDATE_COMPLETE`, followed by the application live. Both new migrations completed successfully. A frontend-only upload is insufficient.

The live entry matches the local manifest; all 34 JS/CSS assets return correct MIME types. Actual public home/login pages render at phone/desktop widths in Chromium/WebKit without JavaScript errors or overflow. Real public APIs confirm the canonical Football catalogue, removal of Futsal, typed nullable player counts and working legacy sport searches. These public checks do not create or edit real reservations.

The owner/field workflow checks also passed against the published assets in Chromium/WebKit with all API writes mocked. An initial mocked WebKit run reported a request error during full-page navigation; waiting for session requests to settle before replacing the document produced a clean rerun at both widths. A separate unmocked WebKit request to the live session endpoint returned the expected guest 401 without CORS or JavaScript errors. No production code adjustment was needed for that test-navigation issue.

Validation: **158 backend tests / 1,378 assertions passed**, build/lint and a Bangla audit with 898 entries and zero missing literal translations. Tests cover optional first/new/existing field values, clearing/preservation/validation/ownership, duplicate and archived sport associations, unchanged booking history, repeatable migration, missing Football, aliases and canonical catalogue output. Chromium/WebKit phone/desktop checks cover editing/display/clearing, Bangla, Football-only selectors, owner-root redirect, expired hints and guest/customer homepages. Browser writes are mocked; no real bookings or hosted field settings were changed.
