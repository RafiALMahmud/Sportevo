<?php

namespace App\Services;

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class GoogleIdentity
{
    public static function subjectHash(string $subject): string
    {
        return hash_hmac('sha256', 'sportevo:google:'.$subject, Crypt::getKey());
    }

    public function nonce(Request $request): string
    {
        abort_unless(config('services.google.client_id') && $request->hasSession(), 503, 'Google sign-in is not configured.');
        $nonce = Str::random(64);
        // A short list permits two sign-in tabs without making old challenges permanent.
        $nonces = array_filter($request->session()->get('google_nonces', []), fn ($expires) => $expires > time());
        $nonces[hash('sha256', $nonce)] = time() + 600;
        $request->session()->put('google_nonces', array_slice($nonces, -5, null, true));

        return $nonce;
    }

    public function verify(Request $request): array
    {
        $data = $request->validate(['credential' => ['required', 'string', 'max:10000']]);
        abort_unless(config('services.google.client_id') && $request->hasSession(), 503, 'Google sign-in is not configured.');
        // Google certificates are fetched from a fixed trusted origin, never from token headers.
        $certs = Cache::remember('google-sign-in-certificates-v1', 1800, function () {
            try {
                $response = Http::timeout(8)->get('https://www.googleapis.com/oauth2/v1/certs')->throw();
                $certs = $response->json();
                abort_unless(is_array($certs) && count($certs), 503, 'Google sign-in is temporarily unavailable.');
                return $certs;
            } catch (\Illuminate\Http\Client\HttpClientException $e) {
                abort(503, 'Google sign-in is temporarily unavailable.');
            }
        });
        try {
            $keys = [];
            foreach ($certs as $id => $pem) {
                $keys[$id] = new Key($pem, 'RS256');
            }
            $claims = (array) JWT::decode($data['credential'], $keys);
        } catch (\Throwable $e) {
            throw ValidationException::withMessages(['credential' => 'Google sign-in could not be verified. Please try again.']);
        }
        $client = config('services.google.client_id');
        $nonceHash = hash('sha256', (string) ($claims['nonce'] ?? ''));
        $nonces = $request->session()->get('google_nonces', []);
        $valid = in_array($claims['iss'] ?? null, ['accounts.google.com', 'https://accounts.google.com'], true)
            && ($claims['aud'] ?? null) === $client && (! isset($claims['azp']) || $claims['azp'] === $client)
            && is_numeric($claims['exp'] ?? null) && $claims['exp'] > time()
            && is_numeric($claims['iat'] ?? null) && $claims['iat'] <= time() + 60
            && is_string($claims['sub'] ?? null) && strlen($claims['sub']) >= 1 && strlen($claims['sub']) <= 255
            && ($claims['email_verified'] ?? false) === true
            && is_string($claims['email'] ?? null) && strlen($claims['email']) <= 255 && filter_var($claims['email'], FILTER_VALIDATE_EMAIL)
            && isset($nonces[$nonceHash]) && $nonces[$nonceHash] > time();
        if (! $valid) {
            throw ValidationException::withMessages(['credential' => 'Google sign-in could not be verified. Please try again.']);
        }
        unset($nonces[$nonceHash]);
        $request->session()->put('google_nonces', $nonces);

        $email = mb_strtolower(trim($claims['email']));
        $domain = substr(strrchr($email, '@'), 1);
        $hostedDomain = is_string($claims['hd'] ?? null) ? mb_strtolower(trim($claims['hd'])) : '';
        // Google is authoritative for Gmail and its own verified Workspace domains.
        // A Google account using a third-party mailbox still needs explicit linking.
        $authoritative = $domain === 'gmail.com' || ($hostedDomain !== '' && $hostedDomain === $domain);
        return ['sub' => $claims['sub'], 'email' => $email, 'email_authoritative' => $authoritative,
            'name' => mb_substr(trim((string) ($claims['name'] ?? 'Google user')), 0, 255) ?: 'Google user'];
    }
}
