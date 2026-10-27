<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreReviewRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->hasRole('user');
    }

    public function rules(): array
    {
        return [
            'booking_id' => ['required', 'bail', 'integer', 'exists:bookings,id'],
            'rating' => ['required', 'bail', 'integer', 'between:1,5'],
            'comment' => ['nullable', 'bail', 'string', 'max:1500'],
        ];
    }
}
