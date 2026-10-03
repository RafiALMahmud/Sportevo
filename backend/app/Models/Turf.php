<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Turf extends Model
{
    protected $fillable = [
        'name',
        'email',
        'phone',
        'location',
        'price_per_slot',
        'commission_rate',
        'is_approved',
        'turf_manager_id',
    ];

    protected $casts = [
        'is_approved' => 'boolean',
        'price_per_slot' => 'decimal:2',
        'commission_rate' => 'decimal:2',
    ];

    public function manager(): BelongsTo
    {
        return $this->belongsTo(User::class, 'turf_manager_id');
    }

    public function bookings(): HasMany
    {
        return $this->hasMany(Booking::class);
    }

    public function slots(): HasMany
    {
        return $this->hasMany(Booking::class);
    }

    public function sports(): BelongsToMany
    {
        return $this->belongsToMany(Sport::class);
    }

    public function photos(): HasMany { return $this->hasMany(TurfPhoto::class)->orderBy('sort_order'); }
    public function reviews(): HasMany { return $this->hasMany(Review::class); }
    public function walletEntries(): HasMany { return $this->hasMany(WalletEntry::class); }

    public function walletBalance(): float
    {
        return (float) $this->walletEntries()
            ->selectRaw("COALESCE(SUM(CASE WHEN type = 'commission_charge' THEN amount ELSE -amount END), 0) as balance")
            ->value('balance');
    }
}
