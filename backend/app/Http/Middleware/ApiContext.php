<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class ApiContext
{
    public function handle(Request $request, Closure $next): Response
    {
        $request->attributes->set('request_id', (string) Str::uuid());
        try {
            $userId = Crypt::decryptString((string) $request->cookie('npms_session'));
            $user = DB::table('users')->where('id', $userId)->first();
        } catch (\Throwable) { $user = null; }
        if (!$user) return response()->json(['data'=>null,'meta'=>['request_id'=>$request->attributes->get('request_id')],'errors'=>[['code'=>'UNAUTHORIZED','message'=>'sign in required']]],401);
        if (session()->has(config('laravel-impersonate.session_key')) && Auth::guard('web')->check()) {
            $impersonatorId = (string) session(config('laravel-impersonate.session_key'));
            $candidate = Auth::guard('web')->user();
            if ((string) $user->id === $impersonatorId && $candidate
                && (string) $candidate->tenant_id === (string) $user->tenant_id
                && (string) $candidate->id !== $impersonatorId) {
                $user = DB::table('users')->where('tenant_id', $user->tenant_id)->where('id', $candidate->id)->first();
            }
        }
        $request->attributes->set('principal', $user);
        return $next($request);
    }
}
