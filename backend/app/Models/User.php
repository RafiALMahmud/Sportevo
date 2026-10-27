<?php

namespace App\Models;

use App\Models\Concerns\HasEncryptedEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable, SoftDeletes;
    use HasEncryptedEmail;

    protected static function booted(): void
    {
        static::saving(function (User $user) {
            if ($user->trashed()) {
                $user->email_hash = static::archivedEmailHash($user->getKey(), $user->email);
            } elseif ($user->isDirty('email') || $user->isDirty($user->getDeletedAtColumn())) {
                $user->email_hash = static::emailHash($user->email);
            }
        });
        static::restoring(function (User $user) {
            if (static::whereEmail($user->email)->whereKeyNot($user->getKey())->exists()) {
                throw ValidationException::withMessages(['email' => 'This email address is already registered.']);
            }
        });
    }

    public static function archivedEmailHash(int|string $id, string $email): string
    {
        return hash('sha256', 'deleted-user:'.$id.':'.static::emailHash($email));
    }

    public function delete()
    {
        // Release the unique login identifier atomically, retaining the encrypted email and history.
        return DB::transaction(function () {
            $deleted = parent::delete();
            if ($deleted && ! $this->isForceDeleting()) {
                $this->forceFill(['email_hash' => static::archivedEmailHash($this->getKey(), $this->email)])->saveQuietly();
            }

            return $deleted;
        });
    }

    protected $fillable = [
        'name',
        'email',
        'phone',
        'password',
        'role_id',
        'email_verified_at',
        'verification_code',
        'verification_code_expires_at',
        'password_reset_code',
        'password_reset_code_expires_at',
        'auth_version',
    ];

    protected $hidden = [
        'email_hash',
        'auth_version',
        'password',
        'remember_token',
        'verification_code',
        'verification_code_expires_at',
        'password_reset_code',
        'password_reset_code_expires_at',
    ];

    protected function casts(): array
    {
        return [
            'name' => 'encrypted',
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'phone' => 'encrypted',
            'verification_code_expires_at' => 'datetime',
            'password_reset_code_expires_at' => 'datetime',
        ];
    }

    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    public function turf(): HasMany
    {
        return $this->hasMany(Turf::class, 'turf_manager_id');
    }

    public function bookings(): HasMany
    {
        return $this->hasMany(Booking::class);
    }

    public function hasRole(string $roleName): bool
    {
        return $this->role && $this->role->name === $roleName;
    }

    public function isAdmin(): bool
    {
        return $this->hasRole('admin') || $this->hasRole('superadmin');
    }
}
