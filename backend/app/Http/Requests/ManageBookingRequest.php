<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Authorization for accept / reject / complete booking decisions:
 * only the complex owner or a platform admin may decide a request.
 */
class ManageBookingRequest extends FormRequest
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

        return (int) $booking->turf?->turf_manager_id === (int) $user->id;
    }

    public function rules(): array
    {
        return [];
    }
}
