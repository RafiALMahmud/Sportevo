<?php

use App\Services\PersonalData;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private array $fields = [
        'users' => ['name', 'email', 'phone'],
        'turfs' => ['email', 'phone'],
        'activities' => ['actor_name', 'actor_email', 'details'],
        'email_deliveries' => ['recipient', 'subject', 'body', 'last_error'],
    ];

    private function plain(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        // Authenticate existing ciphertext with the configured key; never silently encrypt unreadable ciphertext again.
        return str_starts_with($value, 'eyJpdiI6') ? Crypt::decryptString($value) : $value;
    }

    public function up(): void
    {
        $emails = [];
        foreach ($this->fields as $table => $fields) {
            foreach (DB::table($table)->select(['id', ...$fields])->orderBy('id')->lazyById(500) as $row) {
                foreach ($fields as $field) {
                    $this->plain($row->$field);
                }
                if ($table === 'users') {
                    $hash = PersonalData::emailHash($this->plain($row->email));
                    if (isset($emails[$hash])) {
                        throw new RuntimeException('Duplicate normalized account emails must be resolved before encryption.');
                    }
                    $emails[$hash] = true;
                }
            }
        }
        // Preflight above runs before DDL, which is not transactional on MySQL.
        if (Schema::hasIndex('users', 'users_email_unique')) {
            Schema::table('users', fn (Blueprint $table) => $table->dropUnique('users_email_unique'));
        }
        foreach ($this->fields as $name => $fields) {
            Schema::table($name, function (Blueprint $table) use ($name, $fields) {
                foreach ($fields as $field) {
                    $nullable = in_array($field, ['phone', 'actor_name', 'actor_email', 'last_error'], true);
                    $column = $table->longText($field)->nullable($nullable);
                    $column->change();
                }
                if (in_array($name, ['users', 'turfs']) && ! Schema::hasColumn($name, 'email_hash')) {
                    $column = $table->char('email_hash', 64)->nullable();
                    $name === 'users' ? $column->unique() : $column->index();
                }
            });
            DB::table($name)->orderBy('id')->chunkById(100, function ($rows) use ($name, $fields) {
                foreach ($rows as $row) {
                    $changes = [];
                    foreach ($fields as $field) {
                        if ($row->$field !== null && ! str_starts_with($row->$field, 'eyJpdiI6')) {
                            $changes[$field] = Crypt::encryptString($row->$field);
                        }
                    }
                    if (in_array($name, ['users', 'turfs'])) {
                        $changes['email_hash'] = PersonalData::emailHash($this->plain($row->email), $name);
                    }
                    if ($changes) {
                        DB::table($name)->where('id', $row->id)->update($changes);
                    }
                }
            });
        }
        Schema::table('users', fn (Blueprint $table) => $table->char('email_hash', 64)->nullable(false)->change());
    }

    public function down(): void
    {
        // Rolling back silently exposes personal information and conflicts with current model casts.
        throw new RuntimeException('Personal-data encryption is forward-only. Restore a matching encrypted backup and code release instead.');
    }
};
