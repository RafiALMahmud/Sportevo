<?php

use App\Http\Controllers\SitemapController;
use Illuminate\Support\Facades\Route;

// SEO endpoints (must be registered before the SPA catch-all)
Route::get('/sitemap.xml', [SitemapController::class, 'index']);
Route::get('/robots.txt', [SitemapController::class, 'robots']);

// SPA shell for every other path
Route::get('/{any}', function () {
    return view('app');
})->where('any', '.*');
