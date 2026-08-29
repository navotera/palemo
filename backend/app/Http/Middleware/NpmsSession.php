<?php

namespace App\Http\Middleware;

use Illuminate\Cookie\Middleware\AddQueuedCookiesToResponse;
use Illuminate\Http\Request;
use Illuminate\Session\Middleware\StartSession;

class NpmsSession
{
    public function handle(Request $request, \Closure $next)
    {
        $encryptCookies = app(EncryptCookies::class);
        $addCookies = app(AddQueuedCookiesToResponse::class);
        $startSession = app(StartSession::class);

        return $encryptCookies->handle($request, function ($request) use ($startSession, $addCookies, $next) {
            return $startSession->handle($request, function ($request) use ($addCookies, $next) {
                return $addCookies->handle($request, $next);
            });
        });
    }
}
