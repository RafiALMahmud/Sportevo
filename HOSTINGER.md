# Hostinger deployment for sportevo.games

Edit `backend/.env.hostinger` for hosting. This ignored file preserves the existing application encryption key and SMTP settings. Local development continues to use `backend/.env`. Fill in the actual Hostinger `DB_PASSWORD`; check SMTP credentials and `MAIL_FROM_ADDRESS`. Never put either environment file in `public_html`.

The intended layout is:

```text
/home/u302655234/domains/sportevo.games/
  sportevo/       Laravel application, vendor, storage and private .env
  public_html/   index.php, .htaccess, favicon.svg, build/ and storage symlink
```

Confirm this path after SSH login; do not assume another website's public_html is the target. Only the two manually seeded admins should be created. Do not run DemoSeeder, migrate:fresh or migrate:refresh.

Run `scripts/prepare-hostinger.ps1` in local PowerShell to build the frontend and create two archives under the ignored `backend/storage/app/private/hostinger-deploy` directory. The private archive excludes environment files, vendor, uploaded photos and local logs. The public archive has an adjusted Laravel entrypoint pointing to the sibling private `sportevo` directory.

Before uploading, verify the host uses PHP 8.2+ and has Composer. Resolve the known Composer security advisories before public launch. Uploads and activation require a completed production environment file and successful SSH authentication. Existing server content should be backed up before replacement.

After uploading the private application and environment file, install dependencies with `composer install --no-dev --prefer-dist --optimize-autoloader`. Create writable storage directories (`storage/framework/cache/data`, `storage/framework/sessions`, `storage/framework/views`, `storage/logs`, `storage/app/public`, `storage/app/private`) and `bootstrap/cache`; restrict `.env` permissions to 600. Run `php artisan migrate --force`, `php artisan db:seed --class=RoleSeeder --force`, `php artisan db:seed --class=SportSeeder --force`, and finally the manually invoked `php artisan db:seed --class=PlatformAdminSeeder --force`. Preserve the existing `APP_KEY`; do not run `key:generate`.

Copy the public archive into the website public_html directory after private setup succeeds. Create the public storage link targeting `../sportevo/storage/app/public`. Cache configuration and routes only after production settings are complete. Use a Hostinger cron runner for queued email if a permanent queue worker is unavailable. Confirm the cron PHP version matches the website PHP version.

Before launch, verify HTTPS, `/up`, login, field uploads and queued emails. Confirm requests for `/.env`, `/composer.json`, `/storage/logs/laravel.log` and `/sportevo/.env` do not expose private files.

## Verified deployment and remaining email cron

The deployed site responds over HTTPS, serves its frontend assets and APIs, and both manually seeded superadmins can log in. The server reports exactly two users and two superadmins. All migrations have run. The public folder uses permissions 755; the environment file stays outside the public directory.

This hosting account has no shell `crontab` executable. Add the email queue runner in hPanel → sportevo.games → Advanced → Cron Jobs. Use Custom mode and this command, with every schedule field set to `*` (every minute):

```text
/usr/bin/php /home/u302655234/domains/sportevo.games/sportevo/artisan queue:work --stop-when-empty --max-time=50 --sleep=1 --tries=5 --timeout=45
```

Ensure the cron PHP executable uses PHP 8.2 or newer (the checked SSH CLI uses PHP 8.3.35). View the job output in hPanel after saving. The worker exits after processing available jobs or reaching its time limit; a currently executing job finishes before exit. Email processing remains unverified until this cron is enabled and its first run is checked. Confirm actual message delivery through the application's email operations interface.

### Faster queue pickup (2026-10-15)

The original `--stop-when-empty` command exits as soon as it drains the queue. An email created afterward waits for the next minute's cron run. To reduce that wait, edit the existing hPanel cron job rather than adding another one. Keep its schedule `* * * * *` and use this full command in **Custom** mode:

```text
/usr/bin/php /home/u302655234/domains/sportevo.games/sportevo/artisan queue:work --max-time=55 --sleep=1 --tries=5 --timeout=45
```

The worker now waits for new jobs, checking an empty queue every second for approximately 55 seconds. With punctual cron starts, a healthy worker, a clear queue and no transport failures, queue pickup should usually take around a second while the worker is running, with a short gap before the next minute. This is an expectation from the schedule, not a measured inbox-delivery guarantee. Busy jobs may finish after the time limit; the limit is checked between jobs. Existing job reservation and overlap protection remain in place.

No application upload is needed for this cron-only change. This documentation does not change the saved hPanel job; save the command there and inspect its output. Gmail processing, recipient filtering, backlogs and SMTP retries can still add delay. Do not change `QUEUE_CONNECTION` to `sync` globally: that would move SMTP latency onto registration and booking requests.

References: [Laravel queue worker options](https://laravel.com/framework/docs/12.x/queues), [Hostinger cron setup](https://support.hostinger.com/en/articles/1583465-how-to-set-up-a-cron-job-at-hostinger).


## Current release: 2026-10-13

The SportEvo frontend, generated sports artwork, contact inbox, email autofill and public landing-page session fix are live at https://sportevo.games. Deployment used scripts/update-hostinger-release.ps1; the additive contact-table migration completed, and APP_KEY, database credentials and SMTP credentials were verified unchanged. Existing code, environment and frontend backups were kept in the private release directory outside public_html.

Live checks confirmed the current asset manifest, 39 identical assets and one CDN-recompressed image with identical pixels, homepage behavior after an expired session, admin login/inbox access, signed-in contact email autofill, public contact validation and mobile layout. Verification did not create a contact message or send a test email. The deployment log is backend/storage/logs/hostinger-site-release.log.
