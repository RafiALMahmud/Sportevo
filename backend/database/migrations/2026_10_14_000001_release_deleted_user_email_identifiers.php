<?php

use App\Models\User;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        User::onlyTrashed()->select('id', 'email')->chunkById(100, function ($users) {
            foreach ($users as $user) {
                DB::table('users')->where('id', $user->id)->whereNotNull('deleted_at')->update([
                    'email_hash' => User::archivedEmailHash($user->id, $user->email),
                ]);
            }
        });
    }

    public function down(): void
    {
        // Retain archived identifiers: re-reserving them could collide with newly registered accounts.
    }
};
