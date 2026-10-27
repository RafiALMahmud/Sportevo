# Personal-data encryption

Manual advance-payment receiving numbers are encrypted on complexes. Booking receiving-account snapshots, customer transaction/reference text and owner payment notes are encrypted as well. Public schedule responses explicitly omit these fields. Include the added columns in backups and preserve the existing APP_KEY.

Issue report subjects, messages and admin replies are also encrypted at rest. Reporters can view only their own reports; platform admins can read and respond to all reports. Include `issue_reports` in complete database backups and preserve the existing encryption key.

Public contact-form names, email addresses, subjects and messages are encrypted in `contact_messages`. Only admins and superadmins can read this inbox. Include this table in complete database backups; the existing APP_KEY is required to restore its contents. Admin notification email recipients and bodies use the encrypted tracked outbox.

Account names, email addresses and phone numbers are encrypted at rest. Complex contact emails and phone numbers are encrypted; public complex names and locations remain searchable plaintext. Email outbox recipients, subjects, bodies and detailed delivery errors are encrypted. Activity actor names/emails and the complete details payload are encrypted.

Passwords and verification/reset codes remain one-way hashes. IDs, roles, status fields, schedules and financial amounts remain plaintext for joins, permissions and reporting. Uploaded photographs are public assets and are not encrypted by this feature. Authorized application responses still contain readable personal data: HTTPS and existing authorization rules remain necessary.

## Keys and lookup

Laravel's authenticated encryption uses the existing `APP_KEY`. Keep it outside Git and outside public web directories. Preserve an access-controlled copy separately from encrypted database backups. Do not run `php artisan key:generate` on an existing installation: loss of the old key makes its encrypted records unreadable.

`users.email_hash` and `turfs.email_hash` are table-specific HMAC-SHA256 lookup indexes derived from the encryption key. They are hidden in model JSON. Use `User::whereEmail($email)` and `Turf::whereEmail($email)` for active email lookup. Account email uniqueness applies to active accounts and ignores letter case. Deleted users retain their encrypted email and history, but their lookup identifier moves to a separate per-account archive namespace, allowing fresh registration. Deletion and identifier release are transactional. Restoring an account recomputes its active lookup hash and is blocked if a new account already uses that email. Migration `2026_10_14_000001_release_deleted_user_email_identifiers.php` repairs previously deleted identifiers without changing personal data or active accounts; rollback intentionally keeps the repaired identifiers to avoid collisions. New emails are normalized to lowercase with surrounding whitespace removed. Direct SQL writes bypass encryption and model mutators; application writes must use models or explicitly encrypt values and compute lookup hashes.

Blind indexes reveal repeated equal values, but do not store the email or an unkeyed email hash. Login performs an indexed exact lookup. Admin name/email substring searches decrypt records in bounded batches on the server, then apply matching IDs to the normal paginated query. Such searches scan the relevant table and need a purpose-built searchable-encryption design if the account/activity datasets grow large. Account lists now sort by newest ID rather than encrypted names.

Key rotation requires both retaining old decryption keys and rebuilding email lookup hashes for the new key while writes are paused. Laravel's previous-key support alone does not rebuild these indexes. Do not rotate keys without a tested migration and rollback procedure.

## Existing installations

1. Preserve the existing key and make a complete database backup.
2. Pause application writes and queue workers.
3. Run `php artisan privacy:snapshot` for an additional encrypted raw snapshot of the affected personal-data tables.
4. Run `php artisan migrate --force`.
5. Deploy/build the matching application code and restart queue workers before resuming writes.

The migration authenticates existing ciphertext and checks for conflicting normalized account emails before changing schema. It widens encrypted fields, converts existing values, creates keyed lookup indexes, and supports resuming without double encryption. MySQL DDL is not transactional; the preflight and backups are essential. The migration is forward-only: a generic rollback must not silently return personal information to plaintext. Restore a matching code/database release when recovery is necessary.

Snapshots are in `backend/storage/app/private/encryption-snapshots`. Each line is authenticated ciphertext containing a JSON `{table, row}` record; decrypt using the original `APP_KEY` in an isolated recovery environment. These snapshots cover only the affected tables and supplement, rather than replace, complete backups. A partially written snapshot after a command failure is not a valid recovery checkpoint.

## Logs and browser storage

New activity-file entries use raw encrypted attributes, rather than decrypted model JSON. Detailed SMTP errors remain only in the encrypted outbox; failed queue jobs receive a generic exception. Admin activity downloads decrypt records through the existing admin-only API.

Old filesystem logs, old database backups, existing database binary/redo logs, and other historic copies may retain plaintext written before migration. Restrict access and apply your retention policy; this migration does not erase or rewrite those artifacts. Host-level disk/backup encryption is still needed for full storage protection.

The browser caches only an account ID/role session hint. Names, emails and phone numbers are fetched after authentication and retained in memory. Old browser hints are replaced when the session is successfully refreshed. API responses send `Cache-Control: no-store, private`.

## Verification

Run `php artisan test` in `backend` and `node scripts/profile-photos-smoke.cjs` in `frontend` with the local app running. Tests cover encrypted raw storage, lookup/uniqueness, authorized reads/searches, legacy conversion, and encrypted activity-file output. Existing auth, bookings, approvals, email retries and performance tests also apply.
