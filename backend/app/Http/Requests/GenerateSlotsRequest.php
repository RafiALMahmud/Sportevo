<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class GenerateSlotsRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();
        $turf = $this->route('turf');

        if (! $user || ! $turf) {
            return false;
        }

        return $user->isAdmin() || (int) $turf->turf_manager_id === (int) $user->id;
    }

    public function rules(): array
    {
        return [
            'field_id' => ['required', 'integer', 'exists:fields,id'],
            'date' => ['required', 'bail', 'date_format:Y-m-d'],
            'start_time' => [Rule::excludeIf($this->boolean('peak_only')), 'required', 'bail', 'date_format:H:i'],
            'end_time' => [Rule::excludeIf($this->boolean('peak_only')), 'required', 'bail', 'date_format:H:i', 'different:start_time'],
            'slot_duration' => ['required', 'bail', 'integer', 'min:15', 'max:240'],
            'peak_enabled' => ['sometimes', 'boolean'],
            'peak_only' => ['sometimes', 'boolean'],
            'peak_start' => [Rule::excludeIf(! $this->boolean('peak_enabled') && ! $this->boolean('peak_only')), 'required', 'date_format:H:i'],
            'peak_end' => [Rule::excludeIf(! $this->boolean('peak_enabled') && ! $this->boolean('peak_only')), 'required', 'date_format:H:i', 'different:peak_start'],
            'peak_pricing_mode' => [Rule::excludeIf(! $this->boolean('peak_enabled') && ! $this->boolean('peak_only')), 'required', Rule::in(['slot', 'hour'])],
            'peak_rate' => [Rule::excludeIf(! $this->boolean('peak_enabled') && ! $this->boolean('peak_only')), 'required', 'numeric', 'between:0,100000'],
        ];
    }
}
