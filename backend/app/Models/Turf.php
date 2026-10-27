<?php

namespace App\Models;

use App\Models\Concerns\HasEncryptedEmail;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Turf extends Model
{
    use HasEncryptedEmail;

    protected $hidden = ['email_hash', 'payment_number'];

    use SoftDeletes;

    public function fields()
    {
        return $this->hasMany(Field::class);
    }

    public function deletionRequest()
    {
        return $this->hasOne(TurfDeletionRequest::class);
    }

    public function refunds()
    {
        return $this->hasMany(CommissionRefund::class);
    }

    protected $fillable = [
        'name',
        'email',
        'phone',
        'location',
        'price_per_slot',
        'commission_rate',
        'is_approved',
        'booking_request_emails',
        'advance_enabled', 'advance_amount', 'advance_window_minutes', 'payment_provider', 'payment_number',
        'turf_manager_id',
    ];

    protected $casts = [
        'phone' => 'encrypted',
        'is_approved' => 'boolean',
        'booking_request_emails' => 'boolean',
        'price_per_slot' => 'decimal:2',
        'commission_rate' => 'decimal:2',
        'advance_enabled' => 'boolean',
        'advance_amount' => 'decimal:2',
        'advance_window_minutes' => 'integer',
        'payment_number' => 'encrypted',
    ];

    public function manager(): BelongsTo
    {
        return $this->belongsTo(User::class, 'turf_manager_id')->withTrashed();
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

    public function photos(): HasMany
    {
        return $this->hasMany(TurfPhoto::class)
            ->where(fn ($query) => $query->whereNull('field_id')->orWhereHas('field'))
            ->orderBy('sort_order');
    }

    public function reviews(): HasMany
    {
        return $this->hasMany(Review::class);
    }

    public function walletEntries(): HasMany
    {
        return $this->hasMany(WalletEntry::class);
    }

    public function commissionEntries(): HasMany
    {
        return $this->hasMany(WalletEntry::class)->where('type', 'commission_charge');
    }

    public function settlementEntries(): HasMany
    {
        return $this->hasMany(WalletEntry::class)->where('type', 'settlement');
    }

    public function walletBalance(): float
    {
        return round(
            (float) $this->commissionEntries()->sum('amount') - (float) $this->settlementEntries()->sum('amount') - (float) $this->refunds()->sum('amount'),
            2
        );
    }
}
