<?php

namespace App\Http\Requests;

use App\Services\AdvancePayment;
use App\Services\FieldPhotos;
use App\Services\FieldPricing;
use App\Services\FieldSports;
use Illuminate\Foundation\Http\FormRequest;

class StoreTurfRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();

        return $user && in_array($user->role?->name, ['turf', 'admin', 'superadmin'], true);
    }

    public function rules(): array
    {
        return [
            'field_name' => ['nullable', 'string', 'max:255'],
            'players_per_side' => ['sometimes', 'nullable', 'integer', 'between:1,100'],
            'name' => ['required', 'bail', 'string', 'min:2', 'max:255'],
            'email' => ['required', 'bail', 'string', 'email:rfc', 'max:255'],
            'phone' => ['nullable', 'bail', 'string', 'max:20'],
            'location' => ['required', 'bail', 'string', 'min:2', 'max:255'],
        ] + FieldPricing::rules($this->all()) + FieldSports::rules() + FieldPhotos::rules() + AdvancePayment::rules(true);
    }
}
