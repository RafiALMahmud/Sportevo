<?php

use App\Http\Controllers\Api\AdminController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BookingController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\TurfController;
use App\Http\Controllers\Api\ReviewController;
use Illuminate\Support\Facades\Route;

// Public auth & verification
Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);
Route::post('/verify-email', [AuthController::class, 'verifyEmail']);
Route::post('/resend-code', [AuthController::class, 'resendCode']);
Route::post('/forgot-password', [AuthController::class, 'forgotPassword']);
Route::post('/reset-password', [AuthController::class, 'resetPassword']);

// Public turf browsing (home page & guests)
Route::get('/turfs', [TurfController::class, 'index']);
Route::get('/turfs/{turf}', [TurfController::class, 'show']);
Route::get('/turfs/{turf}/slots', [TurfController::class, 'getSlots']);

// Public sports list (for search & registration forms)
Route::get('/sports', function () {
    return response()->json(['sports' => \App\Models\Sport::orderBy('name')->get(['id', 'name', 'slug'])]);
});

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);

    // Dashboard endpoints (role-specific)
    Route::middleware('role:user')->group(function () {
        Route::get('/dashboard/user', [DashboardController::class, 'user']);
    });
    Route::middleware('role:turf,admin,superadmin')->group(function () {
        Route::get('/dashboard/turf', [DashboardController::class, 'turf']);
    });
    Route::middleware('role:admin,superadmin')->group(function () {
        Route::get('/dashboard/platform', [DashboardController::class, 'platform']);
    });

    // Booking requests (authenticated users)
    Route::middleware('role:user')->group(function () {
        Route::post('/bookings', [BookingController::class, 'store']);
        Route::get('/bookings', [BookingController::class, 'myBookings']);
        Route::post('/bookings/{booking}/cancel', [BookingController::class, 'cancel']);
        Route::post('/turfs/{turf}/reviews', [ReviewController::class, 'store']);
    });

    // Facility (Manager) routes
    Route::middleware('role:turf,admin,superadmin')->group(function () {
        Route::post('/turfs', [TurfController::class, 'store']);
        Route::get('/my-turf', [TurfController::class, 'myTurf']);
        Route::put('/my-turf', [TurfController::class, 'updateMyTurf']);
        Route::post('/turfs/{turf}/slots', [TurfController::class, 'generateSlots']);
        Route::post('/turfs/{turf}/photos', [TurfController::class, 'uploadPhotos']);
        Route::delete('/turfs/{turf}/photos/{photo}', [TurfController::class, 'destroyPhoto']);
        Route::get('/turfs/{turf}/schedule', [TurfController::class, 'schedule']);
        Route::post('/bookings/{booking}/complete', [BookingController::class, 'complete']);
        Route::post('/bookings/{booking}/accept', [BookingController::class, 'accept']);
        Route::post('/bookings/{booking}/reject', [BookingController::class, 'reject']);
    });

    // Admin & Superadmin routes
    Route::middleware('role:admin,superadmin')->group(function () {
        Route::get('/admin/stats', [AdminController::class, 'getStats']);
        Route::get('/admin/turfs', [AdminController::class, 'listTurfs']);
        Route::post('/admin/turfs/{turf}/approve', [AdminController::class, 'approveTurf']);
        Route::post('/admin/turfs/{turf}/reject', [AdminController::class, 'rejectTurf']);
        Route::delete('/admin/turfs/{turf}', [AdminController::class, 'destroyTurf']);
        Route::get('/admin/users', [AdminController::class, 'listUsers']);
        Route::post('/admin/users', [AdminController::class, 'createUser']);
        Route::delete('/admin/users/{user}', [AdminController::class, 'destroyUser']);
        Route::post('/admin/users/{user}/role', [AdminController::class, 'assignRole']);
        Route::get('/admin/slots', [AdminController::class, 'listSlots']);
        Route::post('/admin/slots/{booking}/accept', [BookingController::class, 'accept']);
        Route::post('/admin/slots/{booking}/reject', [BookingController::class, 'reject']);
        Route::post('/admin/slots/{booking}/cancel', [BookingController::class, 'cancel']);
        Route::put('/admin/turfs/{turf}/commission', [AdminController::class, 'updateCommission']);
        Route::get('/admin/turfs/{turf}/wallet', [AdminController::class, 'wallet']);
        Route::post('/admin/turfs/{turf}/wallet/settlements', [AdminController::class, 'settleWallet']);
    });
});
