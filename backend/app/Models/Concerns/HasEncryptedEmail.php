<?php

namespace App\Models\Concerns;

use App\Services\PersonalData;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Support\Facades\Crypt;

trait HasEncryptedEmail
{
    protected function email(): Attribute
    {
        return Attribute::make(
            get: fn ($value) => $value === null ? null : Crypt::decryptString($value),
            set: fn ($value) => ['email' => Crypt::encryptString(mb_strtolower(trim($value))),
                'email_hash' => static::emailHash($value)]
        );
    }

    public static function emailHash(string $email): string
    {
        return PersonalData::emailHash($email, (new static)->getTable());
    }

    public function scopeWhereEmail($query, string $email)
    {
        return $query->where('email_hash', static::emailHash($email));
    }
}
