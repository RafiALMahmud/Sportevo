<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class BookSlotRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->hasRole('user');
    }

    public function rules(): array
    {
        return [
            'turf_id' => ['required', 'bail', 'integer', 'exists:turfs,id'],
            'field_id' => ['required', 'integer', 'exists:fields,id'],
            'start_time' => ['required', 'bail', 'date'],
            'end_time' => ['required', 'bail', 'date', 'after:start_time'],
        ];
    }
}
