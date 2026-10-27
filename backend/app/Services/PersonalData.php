<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\Crypt;

class PersonalData
{
    public static function emailHash(string $email, string $table = 'users'): string
    {
        $key = hash_hmac('sha256', 'sportevo:email-lookup:v1', Crypt::getKey(), true);

        return hash_hmac('sha256', $table.':'.mb_strtolower(trim($email)), $key);
    }

    // Substring matching is intentionally decrypted only on the server; encrypted columns cannot use SQL LIKE.
    public static function matchingIds(string $model, string $term, array $columns): array
    {
        $ids = [];
        $term = mb_strtolower(trim($term));
        $query = $model::query();
        if (is_a($model, User::class, true)) {
            $query->withTrashed();
        }
        foreach ($query->select(['id', ...$columns])->lazyById(500) as $row) {
            foreach ($columns as $column) {
                if (str_contains(mb_strtolower((string) $row->$column), $term)) {
                    $ids[] = $row->id;
                    break;
                }
            }
        }

        return $ids;
    }
}
