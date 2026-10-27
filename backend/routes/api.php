<?php

use App\Http\Controllers\Api\AdminController;
use App\Http\Controllers\Api\AdvancePaymentController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BookingController;
use App\Http\Controllers\Api\ContactMessageController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\FieldController;
use App\Http\Controllers\Api\IssueReportController;
use App\Http\Controllers\Api\OperationsController;
use App\Http\Controllers\Api\ReviewController;
use App\Http\Controllers\Api\TurfController;
use App\Http\Controllers\Api\WorkflowController;
use App\Http\Middleware\ValidateSessionVersion;
use App\Models\Sport;
use Illuminate\Support\Facades\Route;

// CSRF bootstrap for the SPA: stateful GETs answer with the XSRF-TOKEN cookie
// that axios echoes back as the X-XSRF-TOKEN header on writes.
Route::get('/sanctum/csrf-cookie', fn () => response()->noContent());

// Public auth & verification — strictly rate limited (6 requests / minute / IP)
Route::middleware('throttle:auth')->group(function () {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);
    Route::post('/verify-email', [AuthController::class, 'verifyEmail']);
    Route::post('/resend-code', [AuthController::class, 'resendCode']);
    Route::post('/forgot-password', [AuthController::class, 'forgotPassword']);
    Route::post('/reset-password', [AuthController::class, 'resetPassword']);
});

// Public turf browsing (home page & guests)
Route::post('/contact', [ContactMessageController::class, 'store'])->middleware('throttle:contact');
Route::middleware('throttle:browse')->group(function () {
    Route::get('/turfs', [TurfController::class, 'index']);
    Route::get('/turfs/{turf}', [TurfController::class, 'show']);
    Route::get('/turfs/{turf}/slots', [TurfController::class, 'getSlots']);

    // Public sports list (for search & registration forms)
    Route::get('/sports', function () {
        return response()->json(['sports' => Sport::orderBy('name')->get(['id', 'name', 'slug'])]);
    });
});

Route::middleware(['auth:sanctum', ValidateSessionVersion::class])->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
    Route::patch('/profile', [AuthController::class, 'updateProfile']);
    Route::delete('/profile', [AuthController::class, 'destroyProfile']);
    Route::middleware('role:user,turf')->group(function () {
        Route::get('/reports', [IssueReportController::class, 'index']);
        Route::post('/reports', [IssueReportController::class, 'store'])->middleware('throttle:5,1');
    });

    // Dashboard endpoints (role-specific)
    Route::middleware('role:user')->group(function () {
        Route::post('/bookings/{booking}/advance/reference', [AdvancePaymentController::class, 'submit'])->middleware('throttle:10,1');
        Route::get('/dashboard/user', [DashboardController::class, 'user']);
    });
    Route::middleware('role:turf')->group(function () {
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
    Route::middleware('role:turf')->group(function () {
        Route::post('/turfs', [TurfController::class, 'store']);
        Route::get('/my-turf', [TurfController::class, 'myTurf']);
        Route::put('/my-turf', [TurfController::class, 'updateMyTurf']);
        Route::post('/turfs/{turf}/slots', [TurfController::class, 'generateSlots']);
        Route::delete('/turfs/{turf}/slots', [TurfController::class, 'deleteSlots']);
        Route::patch('/turfs/{turf}/slots/{booking}/availability', [TurfController::class, 'setSlotAvailability']);
        Route::patch('/turfs/{turf}/slots/{booking}/price', [TurfController::class, 'updateSlotPrice']);
        Route::post('/turfs/{turf}/photos', [TurfController::class, 'uploadPhotos']);
        Route::delete('/turfs/{turf}/photos/{photo}', [TurfController::class, 'destroyPhoto']);
        Route::get('/turfs/{turf}/schedule', [TurfController::class, 'schedule']);
        Route::post('/turfs/{turf}/fields', [FieldController::class, 'store']);
        Route::put('/turfs/{turf}/fields/{field}', [FieldController::class, 'update']);
        Route::post('/turfs/{turf}/deletion-request', [WorkflowController::class, 'requestDeletion']);
        Route::get('/cancellations', [WorkflowController::class, 'cancellations']);
        Route::post('/cancellations/{cancellation}/decision', [WorkflowController::class, 'ownerDecision']);
    });
    Route::middleware('role:turf,admin,superadmin')->group(function () {
        Route::get('/turfs/{turf}/advance-settings', [AdvancePaymentController::class, 'settings']);
        Route::get('/turfs/{turf}/advance-bookings', [AdvancePaymentController::class, 'inbox']);
        Route::put('/turfs/{turf}/advance-settings', [AdvancePaymentController::class, 'updateSettings']);
        Route::post('/bookings/{booking}/advance/confirm', [AdvancePaymentController::class, 'confirm']);
        Route::post('/bookings/{booking}/advance/reject', [AdvancePaymentController::class, 'reject']);
        Route::post('/bookings/{booking}/advance/waive', [AdvancePaymentController::class, 'waive']);
        Route::get('/reviews', [ReviewController::class, 'index']);
        Route::patch('/reviews/{review}', [ReviewController::class, 'moderate']);
        Route::delete('/reviews/{review}', [ReviewController::class, 'destroy']);
        Route::post('/bookings/{booking}/complete', [BookingController::class, 'complete']);
        Route::post('/bookings/{booking}/accept', [BookingController::class, 'accept']);
        Route::post('/bookings/{booking}/reject', [BookingController::class, 'reject']);
    });

    // Admin & Superadmin routes
    Route::middleware(['role:admin,superadmin', 'throttle:admin'])->group(function () {
        Route::get('/admin/contact-messages', [ContactMessageController::class, 'index']);
        Route::patch('/admin/contact-messages/{contactMessage}', [ContactMessageController::class, 'update']);
        Route::get('/admin/reports', [IssueReportController::class, 'adminIndex']);
        Route::patch('/admin/reports/{issueReport}', [IssueReportController::class, 'update']);
        Route::get('/admin/cancellations', [WorkflowController::class, 'cancellations']);
        Route::post('/admin/cancellations/{cancellation}/refund', [WorkflowController::class, 'refundDecision']);
        Route::get('/admin/deletion-requests', [WorkflowController::class, 'deletionRequests']);
        Route::post('/admin/deletion-requests/{deletion}/decision', [WorkflowController::class, 'deletionDecision']);
        Route::get('/admin/activity', [OperationsController::class, 'logs']);
        Route::get('/admin/activity/download', [OperationsController::class, 'downloadLogs']);
        Route::get('/admin/emails', [OperationsController::class, 'emails']);
        Route::post('/admin/emails/{emailDelivery}/retry', [OperationsController::class, 'retryEmail']);
        Route::get('/admin/stats', [AdminController::class, 'getStats']);
        Route::get('/admin/turfs', [AdminController::class, 'listTurfs']);
        Route::post('/admin/turfs/{turf}/approve', [AdminController::class, 'approveTurf']);
        Route::post('/admin/turfs/{turf}/reject', [AdminController::class, 'rejectTurf']);
        Route::delete('/admin/turfs/{turf}', [AdminController::class, 'destroyTurf']);
        Route::delete('/admin/turfs/{turf}/fields/{field}', [AdminController::class, 'destroyField']);
        Route::get('/admin/users', [AdminController::class, 'listUsers']);
        Route::post('/admin/users', [AdminController::class, 'createUser']);
        Route::delete('/admin/users/{user}', [AdminController::class, 'destroyUser']);
        Route::post('/admin/users/{user}/role', [AdminController::class, 'assignRole']);
        Route::get('/admin/slots', [AdminController::class, 'listSlots']);
        Route::post('/admin/slots/{booking}/accept', [BookingController::class, 'accept']);
        Route::post('/admin/slots/{booking}/reject', [BookingController::class, 'reject']);
        Route::post('/admin/slots/{booking}/cancel', [BookingController::class, 'cancel']);
        Route::post('/admin/slots/{booking}/complete', [BookingController::class, 'complete']);
        Route::put('/admin/turfs/{turf}/commission', [AdminController::class, 'updateCommission']);
        Route::get('/admin/turfs/{turf}/wallet', [AdminController::class, 'wallet'])->withTrashed();
        Route::post('/admin/turfs/{turf}/wallet/settlements', [AdminController::class, 'settleWallet'])->withTrashed();
    });
});

// Unknown /api paths must answer with the masked JSON 404, never the SPA shell.
// Registered after every real api route but before the web SPA catch-all.
Route::match(
    ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    '/{apiCatchAll}',
    fn () => response()->json(['message' => 'Resource not found.'], 404)
)->where('apiCatchAll', '.*');
