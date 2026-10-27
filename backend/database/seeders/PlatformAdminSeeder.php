<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/**
 * Manual seeding of the platform's real superadmin accounts.
 *
 * Run with: php artisan db:seed --class=PlatformAdminSeeder
 * Idempotent: existing accounts are left untouched (password is not reset).
 */
class PlatformAdminSeeder extends Seeder
{
    private array $accounts = [
        ['name' => 'Rafi Al Mahmud', 'email' => 'rafi.almahmud.007@gmail.com'],
        ['name' => 'Omar Azim', 'email' => 'omarazim45@gmail.com'],
    ];

    public function run(): void
    {
        $superadminRole = Role::firstOrCreate(['name' => 'superadmin']);

        // Validate all new-account credentials before creating any accounts.
        foreach ($this->accounts as $index => $account) {
            if (! User::withTrashed()->whereEmail($account['email'])->exists()
                && strlen((string) config('platform_admin.passwords.'.($index + 1))) < 8) {
                throw new \RuntimeException('Set PLATFORM_ADMIN_'.($index + 1).'_PASSWORD before manually seeding this account.');
            }
        }

        foreach ($this->accounts as $index => $account) {
            $user = User::firstOrCreate(
                ['email_hash' => User::emailHash($account['email'])],
                [
                    'email' => $account['email'],
                    'name' => $account['name'],
                    'phone' => null,
                    'password' => Hash::make((string) config('platform_admin.passwords.'.($index + 1))),
                    'role_id' => $superadminRole->id,
                    'email_verified_at' => now(),
                ]
            );

            // Never leave an existing superadmin unverified.
            if (! $user->email_verified_at) {
                $user->forceFill(['email_verified_at' => now()])->save();
            }

            $this->command->info("Superadmin ready: {$user->email}");
        }
    }
}
