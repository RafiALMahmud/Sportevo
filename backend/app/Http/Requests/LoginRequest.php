<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class LoginRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'email' => ['required', 'bail', 'string', 'email:rfc', 'max:255'],
            'password' => ['required', 'bail', 'string', 'max:255'],
        ];
    }
}
