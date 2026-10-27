<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class ValidateSessionVersion
{
    public function handle(Request $request, Closure $next)
    {
        $user = $request->user();
        if (! $user || ! $request->hasSession() || ! Auth::guard('web')->check()) {
            return $next($request);
        }

        $session = $request->session();
        $now = now()->timestamp;
        $lastActivity = $session->get('auth_last_activity_at');
        if ($lastActivity === null) {
            // Existing browser sessions inherit their previous database activity
            // instead of acquiring a new login lifetime on every page refresh.
            $lastActivity = config('session.driver') === 'database'
                ? DB::table(config('session.table', 'sessions'))->where('id', $session->getId())->value('last_activity')
                : null;
            $lastActivity = (int) ($lastActivity ?? $now);
            $session->put('auth_last_activity_at', $lastActivity);
        }

        if ((int) $session->get('auth_version', 0) !== (int) $user->auth_version ||
            $now - (int) $lastActivity >= 45 * 60) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            return response()->json(['message' => 'Your session has expired. Please sign in again.'], 401);
        }

        // Only the browser's explicit interaction check renews the login.
        // Polling dashboards and ordinary /me reloads must not keep it alive.
        $age = $request->header('X-Session-Activity-Age');
        if ($request->is('api/me') && $request->isMethod('GET') && is_string($age) &&
            preg_match('/^\d{1,4}$/', $age) && (int) $age < 45 * 60) {
            $session->put('auth_last_activity_at', max((int) $lastActivity, $now - (int) $age));
        }

        return $next($request);
    }
}
