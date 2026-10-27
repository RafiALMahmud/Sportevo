<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateSlotPriceRequest extends FormRequest
{
    public function authorize(): bool
    {
        $turf = $this->route('turf');

        return $this->user()?->hasRole('turf') && $turf && (int) $turf->turf_manager_id === (int) $this->user()->id;
    }

    public function rules(): array
    {
        return [
            'use_field_price' => ['sometimes', 'boolean'],
            'pricing_mode' => [Rule::requiredIf(! $this->boolean('use_field_price')), 'nullable', Rule::in(['slot', 'hour'])],
            'rate' => [Rule::requiredIf(! $this->boolean('use_field_price')), 'nullable', 'numeric', 'between:0,100000'],
        ];
    }
}
