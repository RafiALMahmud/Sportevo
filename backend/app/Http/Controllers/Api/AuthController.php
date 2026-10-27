<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ForgotPasswordRequest;
use App\Http\Requests\LoginRequest;
use App\Http\Requests\RegisterRequest;
use App\Http\Requests\ResendCodeRequest;
use App\Http\Requests\ResetPasswordRequest;
use App\Http\Requests\VerifyEmailRequest;
use App\Models\Role;
use App\Models\Turf;
use App\Models\User;
use App\Services\TrackedMail;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Laravel\Sanctum\PersonalAccessToken;

class AuthController extends Controller
{
    public function updateProfile(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:255'],
            'phone' => ['required', 'string', 'min:7', 'max:20'],
        ]);
        $user = $request->user();
        $user->update($data);

        return response()->json(['message' => 'Profile updated.', 'user' => $this->userPayload($user->fresh('role'))]);
    }

    public function register(RegisterRequest $request): JsonResponse
    {
        $roleName = $request->input('role', 'user');
        $role = in_array($roleName, ['turf', 'user'])
            ? Role::where('name', $roleName)->first()
            : Role::where('name', 'user')->first();

        $user = User::create([
            'name' => $request->name,
            'email' => $request->email,
            'phone' => $request->phone,
            'password' => Hash::make($request->password),
            'role_id' => $role?->id,
        ]);

        $this->issueVerificationCode($user);

        return response()->json([
            'message' => 'Registration successful. A 6-digit verification code was sent to your email.',
            'user' => $this->userPayload($user),
        ], 201);
    }

    public function login(LoginRequest $request): JsonResponse
    {
        $user = User::with('role')->whereEmail($request->email)->first();

        if (! $user || ! Hash::check($request->password, $user->password)) {
            return response()->json(['message' => 'Invalid credentials.'], 401);
        }

        if (! $user->email_verified_at) {
            return response()->json([
                'message' => 'Please verify your email first. A verification code was sent to your email.',
                'email' => $user->email,
                'email_verified' => false,
            ], 403);
        }

        $token = $user->createToken('auth_token', [$user->role?->name], now()->addMinutes(45))->plainTextToken;

        $this->startStatefulSession($request, $user);

        return response()->json([
            'message' => 'Login successful.',
            'user' => $this->userPayload($user),
            'token' => $token,
            ...$this->sessionPayload($request),
        ]);
    }

    public function verifyEmail(VerifyEmailRequest $request): JsonResponse
    {
        $user = DB::transaction(function () use ($request) {
            $user = User::with('role')->whereEmail($request->email)->lockForUpdate()->first();
            abort_if(! $user || $user->email_verified_at || ! $user->verification_code ||
                ! $user->verification_code_expires_at || $user->verification_code_expires_at->isPast() ||
                ! Hash::check($request->code, $user->verification_code), 422, 'Invalid or expired verification code.');
            $user->update(['email_verified_at' => now(), 'verification_code' => null, 'verification_code_expires_at' => null]);

            return $user;
        });

        $token = $user->createToken('auth_token', [$user->role?->name], now()->addMinutes(45))->plainTextToken;

        $this->startStatefulSession($request, $user);

        return response()->json([
            'message' => 'Email verified successfully.',
            'user' => $this->userPayload($user),
            'token' => $token,
            ...$this->sessionPayload($request),
        ]);
    }

    public function resendCode(ResendCodeRequest $request): JsonResponse
    {
        $user = User::whereEmail($request->email)->first();

        if (! $user) {
            return response()->json(['message' => 'If that email exists, a code has been sent.'], 200);
        }

        if ($user->email_verified_at) {
            return response()->json(['message' => 'This email is already verified. You can sign in.'], 200);
        }

        $this->issueVerificationCode($user);

        return response()->json(['message' => 'A new 6-digit verification code was sent to your email.']);
    }

    public function forgotPassword(ForgotPasswordRequest $request): JsonResponse
    {
        $user = User::whereEmail($request->email)->first();

        if (! $user) {
            return response()->json(['message' => 'If that email exists, a reset code has been sent.'], 200);
        }

        $code = $this->generateCode();

        $user->update([
            'password_reset_code' => Hash::make($code),
            'password_reset_code_expires_at' => now()->addMinutes(10),
        ]);

        $this->sendMail(
            $user->email,
            'Your Password Reset Code',
            'Hello '.e($user->name).",<br><br>Use the code below to reset your SportEvo password. It expires in 10 minutes.<br><br><strong>{$code}</strong>",
            $code
        );

        return response()->json(['message' => 'A 6-digit reset code was sent to your email.']);
    }

    public function resetPassword(ResetPasswordRequest $request): JsonResponse
    {
        DB::transaction(function () use ($request) {
            $user = User::whereEmail($request->email)->lockForUpdate()->first();
            abort_if(! $user || ! $user->password_reset_code || ! $user->password_reset_code_expires_at ||
                $user->password_reset_code_expires_at->isPast() ||
                ! Hash::check($request->code, $user->password_reset_code), 422, 'Invalid or expired reset code.');
            $user->update([
                'password' => Hash::make($request->password),
                'password_reset_code' => null,
                'password_reset_code_expires_at' => null,
                'remember_token' => Str::random(60),
                'auth_version' => (int) $user->auth_version + 1,
            ]);
            $user->tokens()->delete();
            if (config('session.driver') === 'database') {
                DB::table(config('session.table', 'sessions'))->where('user_id', $user->id)->delete();
            }
            TrackedMail::send($user->email, 'SportEvo password changed', '<p>Your password was changed. All previous sessions have been revoked.</p>');
        });
        if ($request->hasSession()) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->json(['message' => 'Password reset successfully. You can now sign in.']);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['user' => $this->userPayload($request->user()), ...$this->sessionPayload($request)]);
    }

    /**
     * Owners must use the admin-managed complex deletion workflow.
     */
    public function destroyProfile(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(Turf::withTrashed()->where('turf_manager_id', $user->id)->exists(), 409, 'Complex owner accounts must be managed by an admin. Request complex deletion from your profile page.');

        if ($request->hasSession()) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        $user->tokens()->delete();
        $user->delete();

        return response()->json(['message' => 'Your account has been deleted.']);
    }

    public function logout(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($request->hasSession()) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        $accessToken = $user?->currentAccessToken();
        if ($accessToken instanceof PersonalAccessToken) {
            $accessToken->delete();
        }

        return response()->json(['message' => 'Logged out successfully.']);
    }

    /**
     * Log the user into the session guard so SPA requests can be authenticated
     * through an HttpOnly session cookie (Sanctum stateful mode) instead of a
     * token readable by JavaScript.
     */
    private function startStatefulSession(Request $request, User $user): void
    {
        if (! $request->hasSession()) {
            return;
        }

        Auth::guard('web')->login($user);
        $request->session()->regenerate();
        $request->session()->put('auth_version', (int) $user->auth_version);
        $request->session()->put('auth_last_activity_at', now()->timestamp);
    }

    private function sessionPayload(Request $request): array
    {
        if (! $request->hasSession() || ! Auth::guard('web')->check()) {
            return [];
        }

        $expires = (int) $request->session()->get('auth_last_activity_at', now()->timestamp) + 45 * 60;

        return [
            'session_expires_at' => CarbonImmutable::createFromTimestampUTC($expires)->toIso8601String(),
            'session_idle_seconds_remaining' => max(0, $expires - now()->timestamp),
        ];
    }

    private function userPayload(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
            'role' => $user->role?->name,
            'role_id' => $user->role_id,
            'email_verified_at' => $user->email_verified_at,
        ];
    }

    private function generateCode(): string
    {
        return (string) random_int(100000, 999999);
    }

    private function issueVerificationCode(User $user): void
    {
        $code = $this->generateCode();

        $user->update([
            'verification_code' => Hash::make($code),
            'verification_code_expires_at' => now()->addMinutes(15),
        ]);

        $this->sendMail(
            $user->email,
            'Verify Your SportEvo Email',
            'Hello '.e($user->name).",<br><br>Your SportEvo verification code is:<br><br><strong style='font-size:24px'>{$code}</strong><br><br>This code expires in 15 minutes. If you didn't create this account, you can ignore this email.",
            $code
        );
    }

    private function sendMail(string $to, string $subject, string $body, ?string $devCode = null): void
    {
        TrackedMail::send($to, $subject, '<div style="font-family:Arial;padding:24px"><h2>SportEvo</h2><p>'.$body.'</p></div>');
    }
}
