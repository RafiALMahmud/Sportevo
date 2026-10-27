<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Encrypt existing plaintext PII in users.phone so it is protected at rest,
     * matching the 'encrypted' cast now declared on App\Models\User.
     */
    public function up(): void
    {
        DB::table('users')->orderBy('id')->chunkById(100, function ($users) {
            foreach ($users as $user) {
                if ($user->phone !== null && ! $this->isEncrypted($user->phone)) {
                    DB::table('users')->where('id', $user->id)->update([
                        'phone' => Crypt::encryptString($user->phone),
                    ]);
                }
            }
        });
    }

    /**
     * Reverse the migrations (decrypt values back to plaintext).
     */
    public function down(): void
    {
        DB::table('users')->orderBy('id')->chunkById(100, function ($users) {
            foreach ($users as $user) {
                if ($user->phone !== null && $this->isEncrypted($user->phone)) {
                    DB::table('users')->where('id', $user->id)->update([
                        'phone' => Crypt::decryptString($user->phone),
                    ]);
                }
            }
        });
    }

    private function isEncrypted(string $value): bool
    {
        return str_starts_with($value, 'eyJpdiI6');
    }
};
