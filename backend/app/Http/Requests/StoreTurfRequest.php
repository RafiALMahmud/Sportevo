<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreTurfRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:20'],
            'location' => ['required', 'string', 'max:255'],
            'price_per_slot' => ['required', 'numeric', 'min:0'],
            'sports' => ['required', 'array', 'min:1'],
            'sports.*' => ['integer', 'exists:sports,id'],
        ];
    }
}
