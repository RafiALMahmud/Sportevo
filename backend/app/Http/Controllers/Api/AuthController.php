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
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class AuthController extends Controller
{
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
        $user = User::with('role')->where('email', $request->email)->first();

        if (!$user || !Hash::check($request->password, $user->password)) {
            return response()->json(['message' => 'Invalid credentials.'], 401);
        }

        if (!$user->email_verified_at) {
            return response()->json([
                'message' => 'Please verify your email first. A verification code was sent to your email.',
                'email' => $user->email,
                'email_verified' => false,
            ], 403);
        }

        $token = $user->createToken('auth_token', [$user->role?->name])->plainTextToken;

        return response()->json([
            'message' => 'Login successful.',
            'user' => $this->userPayload($user),
            'token' => $token,
        ]);
    }

    public function verifyEmail(VerifyEmailRequest $request): JsonResponse
    {
        $user = User::with('role')->where('email', $request->email)->first();

        if (!$user->email_verified_at) {
            if (!$user->verification_code || !$user->verification_code_expires_at ||
                $user->verification_code_expires_at->isPast() ||
                !Hash::check($request->code, $user->verification_code)) {
                return response()->json(['message' => 'Invalid or expired verification code.'], 422);
            }

            $user->update([
                'email_verified_at' => now(),
                'verification_code' => null,
                'verification_code_expires_at' => null,
            ]);
        }

        $token = $user->createToken('auth_token', [$user->role?->name])->plainTextToken;

        return response()->json([
            'message' => 'Email verified successfully.',
            'user' => $this->userPayload($user),
            'token' => $token,
        ]);
    }

    public function resendCode(ResendCodeRequest $request): JsonResponse
    {
        $user = User::where('email', $request->email)->first();

        if (!$user) {
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
        $user = User::where('email', $request->email)->first();

        if (!$user) {
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
            "Hello {$user->name},<br><br>Use the code below to reset your Sports Evo password. It expires in 10 minutes.<br><br><strong>{$code}</strong>",
            $code
        );

        return response()->json(['message' => 'A 6-digit reset code was sent to your email.']);
    }

    public function resetPassword(ResetPasswordRequest $request): JsonResponse
    {
        $user = User::where('email', $request->email)->first();

        if (!$user) {
            return response()->json(['message' => 'Invalid email or code.'], 422);
        }

        $expired = !$user->password_reset_code || !$user->password_reset_code_expires_at ||
            $user->password_reset_code_expires_at->isPast();
        $valid = $user->password_reset_code && Hash::check($request->code, $user->password_reset_code);

        if ($expired || !$valid) {
            return response()->json(['message' => 'Invalid or expired reset code.'], 422);
        }

        $user->update([
            'password' => Hash::make($request->password),
            'password_reset_code' => null,
            'password_reset_code_expires_at' => null,
        ]);

        return response()->json(['message' => 'Password reset successfully. You can now sign in.']);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['user' => $this->userPayload($request->user())]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Logged out successfully.']);
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
            'Verify Your Sports Evo Email',
            "Hello {$user->name},<br><br>Your Sports Evo verification code is:<br><br><strong style='font-size:24px'>{$code}</strong><br><br>This code expires in 15 minutes. If you didn't create this account, you can ignore this email.",
            $code
        );
    }

    private function sendMail(string $to, string $subject, string $body, ?string $devCode = null): void
    {
        try {
            $html = '<div style="background:#f6f6f6;padding:24px;font-family:Arial,Helvetica,sans-serif">'
                . '<div style="max-width:420px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px">'
                . '<div style="font-size:20px;font-weight:bold;color:#065f46">Sports Evo</div>'
                . '<p style="color:#374151;font-size:14px;line-height:1.6">' . $body . '</p>'
                . '<p style="color:#9ca3af;font-size:12px;margin-top:24px">© ' . date('Y') . ' Sports Evo. All rights reserved.</p>'
                . '</div></div>';

            Mail::html($html, function ($message) use ($to, $subject) {
                $message->to($to)
                    ->subject($subject);
            });
        } catch (\Throwable $e) {
            Log::warning('Mail sending failed for ' . $to . ': ' . $e->getMessage());
        }

        // Always surface the code in dev so flows are testable without real delivery.
        if ($devCode && config('app.debug')) {
            Log::info('[DEV CODE] Verification/reset code for ' . $to . ' is: ' . $devCode);
        }
    }
}
