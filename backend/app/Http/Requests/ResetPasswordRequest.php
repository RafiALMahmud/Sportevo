<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ResetPasswordRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'email' => ['required', 'bail', 'string', 'email:rfc', 'max:255'],
            'code' => ['required', 'bail', 'string', 'regex:/^[0-9]{6}$/'],
            'password' => ['required', 'bail', 'string', 'min:8', 'confirmed'],
        ];
    }
}
