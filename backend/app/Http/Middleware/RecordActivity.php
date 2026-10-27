<?php

namespace App\Http\Middleware;

use App\Services\ActivityLog;
use Closure;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

class RecordActivity
{
    public function handle(Request $request, Closure $next)
    {
        try {
            $response = $next($request);
        } catch (\Throwable $error) {
            $status = $error instanceof ValidationException ? 422
                : ($error instanceof AuthenticationException ? 401
                : ($error instanceof AuthorizationException ? 403
                : ($error instanceof ModelNotFoundException ? 404
                : ($error instanceof HttpExceptionInterface ? $error->getStatusCode() : 500))));
            ActivityLog::record('request.failed', ['method' => $request->method(), 'path' => $request->path(), 'status' => $status]);
            throw $error;
        }
        if ($request->is('api/*') && ! $request->isMethod('OPTIONS')) {
            ActivityLog::record('request', ['method' => $request->method(), 'path' => $request->path(), 'status' => $response->getStatusCode()]);
        }

        return $response;
    }
}
