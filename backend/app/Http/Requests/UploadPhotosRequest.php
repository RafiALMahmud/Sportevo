<?php

namespace App\Http\Requests;

use App\Services\FieldPhotos;
use Illuminate\Foundation\Http\FormRequest;

class UploadPhotosRequest extends FormRequest
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
        return ['field_id' => ['required', 'integer']] + FieldPhotos::rules(true);
    }
}
