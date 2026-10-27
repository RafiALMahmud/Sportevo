<?php

namespace App\Providers;

use App\Models\Booking;
use App\Models\CancellationRequest;
use App\Models\CommissionRefund;
use App\Models\Field;
use App\Models\Review;
use App\Models\Turf;
use App\Models\TurfDeletionRequest;
use App\Models\TurfPhoto;
use App\Models\User;
use App\Models\WalletEntry;
use App\Observers\ActivityObserver;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        foreach ([User::class, Turf::class, Field::class,
            Booking::class, Review::class, TurfPhoto::class,
            WalletEntry::class, CancellationRequest::class,
            CommissionRefund::class, TurfDeletionRequest::class] as $model) {
            $model::observe(ActivityObserver::class);
        }
        // Strict throttle for credential / OTP endpoints (login, register,
        // verification and password reset flows) keyed by IP address.
        RateLimiter::for('auth', function (Request $request) {
            return Limit::perMinute(6)->by($request->ip());
        });
        RateLimiter::for('contact', fn (Request $request) => [
            Limit::perMinute(3)->by('contact-minute:'.$request->ip()),
            Limit::perHour(15)->by('contact-hour:'.$request->ip()),
        ]);

        // Public browsing endpoints (turf directory, sports list, slots).
        RateLimiter::for('browse', function (Request $request) {
            return Limit::perMinute(60)->by($request->user()?->id ?: $request->ip());
        });

        // Resource heavy admin listings and dashboard aggregates.
        RateLimiter::for('admin', function (Request $request) {
            return Limit::perMinute(60)->by($request->user()?->id ?: $request->ip());
        });
    }
}
