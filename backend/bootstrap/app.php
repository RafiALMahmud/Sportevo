<?php

use App\Http\Middleware\RecordActivity;
use App\Http\Middleware\RoleMiddleware;
use App\Http\Middleware\SecurityHeaders;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        apiPrefix: 'api',
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'role' => RoleMiddleware::class,
        ]);

        // The default redirects guests to route('login'), which does not exist
        // in this SPA/API app and throws RouteNotFoundException while building
        // the AuthenticationException (a 500). Point at a plain URL instead.
        $middleware->redirectGuestsTo(fn () => url('/login'));

        $middleware->statefulApi();
        $middleware->api(append: [RecordActivity::class]);

        // Security headers on every response (API, SPA shell and assets).
        $middleware->append(SecurityHeaders::class);

        $middleware->trustProxies(at: '*');
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(function (Request $request) {
            return $request->is('api/*') || $request->expectsJson();
        });

        // Never leak Eloquent model/class names through 404 payloads.
        // Route model binding converts ModelNotFoundException into
        // NotFoundHttpException before render callbacks, so mask both.
        $exceptions->render(function (ModelNotFoundException|NotFoundHttpException $e, Request $request) {
            if ($request->is('api/*')) {
                return response()->json(['message' => 'Resource not found.'], 404);
            }
        });

        // Keep validation failures a consistent, machine readable shape.
        $exceptions->render(function (ValidationException $e, Request $request) {
            if ($request->is('api/*')) {
                return response()->json([
                    'message' => $e->getMessage(),
                    'errors' => $e->errors(),
                ], 422);
            }
        });

        // API clients always get 401 JSON when unauthenticated; the default
        // handler would redirect to a named "login" route that does not exist
        // in this SPA/API app and blow up with a 500.
        $exceptions->render(function (AuthenticationException $e, Request $request) {
            if ($request->is('api/*')) {
                return response()->json(['message' => 'Unauthenticated.'], 401);
            }
        });
    })->create();
