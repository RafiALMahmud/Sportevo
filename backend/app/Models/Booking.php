<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Booking extends Model
{
    protected $fillable = [
        'turf_id',
        'field_id',
        'user_id',
        'start_time',
        'end_time',
        'status',
        'price',
        'slot_pricing_mode', 'slot_rate', 'is_peak',
        'commission_rate',
        'commission_amount',
        'decided_at',
        'unavailable_reason',
        'unavailable_type',
        'unavailable_by',
        'unavailable_at',
        'advance_required', 'advance_status', 'advance_amount', 'advance_window_minutes', 'payment_provider', 'payment_number',
        'advance_due_at', 'payment_reference', 'payment_submitted_at', 'payment_confirmed_at', 'payment_confirmed_by', 'payment_note',
    ];

    protected $casts = [
        'start_time' => 'datetime',
        'end_time' => 'datetime',
        'price' => 'decimal:2',
        'slot_rate' => 'decimal:2', 'is_peak' => 'boolean',
        'commission_rate' => 'decimal:2',
        'commission_amount' => 'decimal:2',
        'decided_at' => 'datetime',
        'unavailable_at' => 'datetime',
        'advance_required' => 'boolean', 'advance_amount' => 'decimal:2', 'advance_window_minutes' => 'integer',
        'advance_due_at' => 'datetime', 'payment_submitted_at' => 'datetime', 'payment_confirmed_at' => 'datetime',
        'payment_number' => 'encrypted', 'payment_reference' => 'encrypted', 'payment_note' => 'encrypted',
    ];

    public function turf(): BelongsTo
    {
        return $this->belongsTo(Turf::class)->withTrashed();
    }

    public function field()
    {
        return $this->belongsTo(Field::class)->withTrashed();
    }

    public function cancellationRequest()
    {
        return $this->hasOne(CancellationRequest::class);
    }

    public function walletEntries()
    {
        return $this->hasMany(WalletEntry::class);
    }

    public function commissionRefund()
    {
        return $this->hasOne(CommissionRefund::class);
    }

    public function isUnclaimedAvailableSlot(): bool
    {
        return $this->status === 'available' && $this->user_id === null && $this->commission_amount === null
            && $this->decided_at === null && ! $this->advance_required
            && in_array($this->advance_status, [null, 'not_required'], true)
            && $this->payment_submitted_at === null && $this->payment_confirmed_at === null
            && $this->payment_confirmed_by === null && $this->getRawOriginal('payment_reference') === null;
    }

    public function forOwner(): self
    {
        if ($this->commission_amount === null && ! in_array($this->status, ['booked', 'completed'])) {
            $this->unsetRelation('user');
            $this->makeHidden('user_id');
        }

        return $this;
    }

    public function isOfflineBooking(): bool
    {
        return $this->status === 'unavailable' && $this->unavailable_type === 'offline_booking';
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class)->withTrashed();
    }
}
