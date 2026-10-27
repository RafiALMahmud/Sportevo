<?php

namespace App\Http\Controllers;

use App\Models\Turf;
use Illuminate\Http\Response;

class SitemapController extends Controller
{
    /**
     * Automated sitemap for the public facing routes of the SPA.
     */
    public function index(): Response
    {
        $base = rtrim(config('app.url'), '/');

        $entries = [
            ['loc' => $base.'/', 'changefreq' => 'daily', 'priority' => '1.0'],
            ['loc' => $base.'/turfs', 'changefreq' => 'daily', 'priority' => '0.9'],
            ['loc' => $base.'/login', 'changefreq' => 'monthly', 'priority' => '0.3'],
            ['loc' => $base.'/register', 'changefreq' => 'monthly', 'priority' => '0.5'],
        ];

        try {
            Turf::where('is_approved', true)
                ->whereHas('fields')
                ->orderBy('id')
                ->pluck('id')
                ->each(function ($id) use (&$entries, $base) {
                    $entries[] = [
                        'loc' => $base.'/turfs/'.$id,
                        'changefreq' => 'weekly',
                        'priority' => '0.8',
                    ];
                });
        } catch (\Throwable $e) {
            // Database unavailable: still serve the static portion of the sitemap.
        }

        $rows = collect($entries)->map(fn (array $entry) => implode('', [
            '  <url>',
            '<loc>'.e($entry['loc']).'</loc>',
            '<lastmod>'.now()->toIso8601String().'</lastmod>',
            '<changefreq>'.$entry['changefreq'].'</changefreq>',
            '<priority>'.$entry['priority'].'</priority>',
            '</url>',
        ]))->implode("\n");

        $xml = implode("\n", [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
            $rows,
            '</urlset>',
        ]);

        return response($xml, 200, [
            'Content-Type' => 'application/xml; charset=UTF-8',
            'Cache-Control' => 'public, max-age=3600',
        ]);
    }

    /**
     * robots.txt with private/authenticated paths disallowed.
     */
    public function robots(): Response
    {
        $base = rtrim(config('app.url'), '/');

        $body = implode("\n", [
            'User-agent: *',
            'Disallow: /api/',
            'Disallow: /dashboard',
            'Disallow: /admin',
            'Disallow: /login',
            'Disallow: /register',
            'Disallow: /verify-email',
            'Disallow: /forgot-password',
            'Disallow: /reset-password',
            'Disallow: /bookings',
            'Disallow: /profile',
            'Disallow: /reports',
            '',
            'Sitemap: '.$base.'/sitemap.xml',
            '',
        ]);

        return response($body, 200, [
            'Content-Type' => 'text/plain; charset=UTF-8',
            'Cache-Control' => 'public, max-age=86400',
        ]);
    }
}
