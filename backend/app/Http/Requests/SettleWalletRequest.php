<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SettleWalletRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->isAdmin();
    }

    public function rules(): array
    {
        return [
            'amount' => ['required', 'bail', 'numeric', 'gt:0', 'max:10000000'],
            'note' => ['nullable', 'bail', 'string', 'max:255'],
        ];
    }
}
