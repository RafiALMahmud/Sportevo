<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Attaches standard security headers to every response.
 * API responses get a restrictive CSP (JSON endpoints need no active content),
 * while HTML/asset responses get a CSP suitable for the SPA build.
 */
class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $nonce = base64_encode(random_bytes(18));
        \Illuminate\Support\Facades\Vite::useCspNonce($nonce);
        $response = $next($request);

        $response->headers->set('X-Frame-Options', 'SAMEORIGIN');
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set('X-Permitted-Cross-Domain-Policies', 'none');
        $response->headers->set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self), payment=()');
        $response->headers->set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');

        if ($request->is('api/*') || $request->is('up')) {
            $response->headers->set('Cache-Control', 'no-store, private');
            $response->headers->set(
                'Content-Security-Policy',
                "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
            );
        } else {
            $response->headers->set(
                'Content-Security-Policy',
                implode('; ', [
                    "default-src 'self'",
                    "base-uri 'self'",
                    "form-action 'self'",
                    "frame-ancestors 'self'",
                    "object-src 'none'",
                    "script-src 'self' 'nonce-{$nonce}' 'strict-dynamic' https://accounts.google.com/gsi/client",
                    "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
                    "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.gstatic.com https://*.googleusercontent.com",
                    "font-src 'self' data: https://fonts.gstatic.com",
                    "connect-src 'self' https://accounts.google.com/gsi/ https://tile.openstreetmap.org",
                    "frame-src https://accounts.google.com/gsi/",
                    "worker-src 'self' blob:",
                ])
            );
        }

        if ($request->secure()) {
            $response->headers->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }

        return $response;
    }
}
