<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
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
        $request->attributes->set('principal', $user);
        return $next($request);
    }
}
