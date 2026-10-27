<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * A booking may be cancelled by the customer who requested it,
 * the complex owner, or a platform admin.
 */
class CancelBookingRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();
        $booking = $this->route('booking');

        if (! $user || ! $booking) {
            return false;
        }

        if ($user->isAdmin()) {
            return true;
        }

        if ((int) $booking->user_id === (int) $user->id) {
            return true;
        }

        return (int) $booking->turf?->turf_manager_id === (int) $user->id;
    }

    public function rules(): array
    {
        return [];
    }
}
