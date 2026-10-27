<?php

namespace App\Http\Requests;

use App\Rules\UniqueEncryptedEmail;
use Illuminate\Foundation\Http\FormRequest;

class RegisterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'bail', 'string', 'min:2', 'max:255'],
            'email' => ['required', 'bail', 'string', 'email:rfc', 'max:255', new UniqueEncryptedEmail],
            'phone' => ['required', 'bail', 'string', 'min:7', 'max:20'],
            'password' => ['required', 'bail', 'string', 'min:8', 'confirmed'],
            'role' => ['nullable', 'bail', 'string', 'in:user,turf'],
        ];
    }
}
