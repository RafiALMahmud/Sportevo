<?php

namespace App\Http\Requests;

use App\Models\Turf;
use Illuminate\Foundation\Http\FormRequest;

class UpdateMyTurfRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();

        if (! $user) {
            return false;
        }

        if ($user->isAdmin()) {
            return true;
        }

        return Turf::where('turf_manager_id', $user->id)->exists();
    }

    public function rules(): array
    {
        return [
            'booking_request_emails' => ['sometimes', 'required', 'boolean'],
            'name' => ['sometimes', 'bail', 'string', 'max:255'],
            'email' => ['sometimes', 'bail', 'email', 'max:255'],
            'phone' => ['nullable', 'bail', 'string', 'max:20'],
            'location' => ['sometimes', 'bail', 'string', 'max:255'],
            'price_per_slot' => ['sometimes', 'bail', 'numeric', 'min:0', 'max:100000'],
            'sports' => ['nullable', 'bail', 'array', 'min:1', 'max:20'],
            'sports.*' => ['bail', 'integer', 'distinct', 'exists:sports,id'],
        ];
    }
}
