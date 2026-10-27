#!/bin/sh
set -eu
umask 077
stage=$1
site="$HOME/domains/sportevo.games"
app="$site/sportevo"
public="$site/public_html"
case "$stage" in "$HOME"/.sportevo-deploy-*) ;; *) echo 'Unexpected staging path'; exit 1;; esac
test -d "$public" || { echo 'Expected domain public_html does not exist'; exit 1; }
test ! -e "$app" || { echo 'Private application already exists; stopping to avoid overwriting a deployment.'; exit 1; }
php -r 'exit(version_compare(PHP_VERSION, "8.2.0", ">=") ? 0 : 1);' || { echo 'PHP 8.2+ required'; exit 1; }
command -v composer >/dev/null
tar -czf "$stage/public-before-deploy.tar.gz" -C "$public" .
mkdir "$app"
tar -xzf "$stage/backend.tar.gz" -C "$app"
cp "$stage/.env.hostinger" "$app/.env"
chmod 600 "$app/.env"
mkdir -p "$app/storage/framework/cache/data" "$app/storage/framework/sessions" "$app/storage/framework/views" "$app/storage/logs" "$app/storage/app/public" "$app/storage/app/private" "$app/bootstrap/cache" "$app/public"
chmod 755 "$app"
cd "$app"
composer install --no-dev --prefer-dist --optimize-autoloader --no-interaction
composer audit --no-dev
# The user requested a fresh database. Never reset an existing one.
php -r 'require "vendor/autoload.php"; $app=require "bootstrap/app.php"; $app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap(); if (count(Illuminate\Support\Facades\DB::select("SHOW TABLES"))) { fwrite(STDERR, "Database is not empty; stopping without changing its tables.\n"); exit(1); }'
php artisan migrate --force
php artisan db:seed --class=RoleSeeder --force
php artisan db:seed --class=SportSeeder --force
php artisan db:seed --class=PlatformAdminSeeder --force
php artisan config:cache
php artisan route:cache
php artisan view:cache
if [ -e "$public/storage" ]; then
    echo 'Existing public storage path found; stopping before public activation.'
    exit 1
fi
# Make code/static assets readable to the hosting web server; storage is private
# except for the explicitly linked uploaded-photo directory.
find "$app" -type d -exec chmod 755 {} +
find "$app" -type f ! -name '.env' -exec chmod 644 {} +
chmod 700 "$app/storage/app/private"
chmod 600 "$app/.env"
if [ -f "$app/bootstrap/cache/config.php" ]; then chmod 600 "$app/bootstrap/cache/config.php"; fi
tar -xzf "$stage/public.tar.gz" -C "$public"
chmod 755 "$public"
find "$public/build" -type d -exec chmod 755 {} +
find "$public/build" -type f -exec chmod 644 {} +
chmod 644 "$public/index.php" "$public/.htaccess" "$public/favicon.svg"
ln -s "$app/storage/app/public" "$public/storage"
if [ -f "$public/default.php" ]; then mv "$public/default.php" "$stage/default.php"; fi
# Install a bounded queue runner when shell-managed cron is available.
if command -v crontab >/dev/null && command -v flock >/dev/null; then
    (crontab -l 2>/dev/null || true) > "$stage/crontab-before.txt"
    cp "$stage/crontab-before.txt" "$stage/crontab-new.txt"
    printf '\n* * * * * cd %s && %s %s %s artisan queue:work --stop-when-empty --max-time=50 --sleep=1 --tries=5 --timeout=45 >> storage/logs/queue-cron.log 2>&1\n' "$app" "$(command -v flock)" '-n storage/framework/queue-cron.lock' "$(command -v php)" >> "$stage/crontab-new.txt"
    if crontab "$stage/crontab-new.txt"; then echo 'Email queue cron installed.'; else echo 'Configure email queue cron in hPanel; shell cron was rejected.'; fi
else
    echo 'Configure the email queue cron in hPanel.'
fi
echo 'Deployment completed. Verify HTTPS, login, uploads and email on https://sportevo.games.'
echo "Previous public files backed up privately in $stage/public-before-deploy.tar.gz"
