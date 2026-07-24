<?php

use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\DB;

Route::get('/health/live', fn () => response()->json(['status'=>'ok']));
Route::get('/healthz', fn () => response()->json(['status'=>'ok']));
Route::get('/readyz', function () { DB::select('select 1'); return response()->json(['status'=>'ready']); });
Route::get('/health/ready', fn () => response()->json(['status'=>'ready']));
Route::get('/openapi.yaml', fn () => response()->file(base_path('../internal/openapi/openapi.yaml'), ['Content-Type'=>'application/yaml']));
Route::get('/{path?}', fn () => file_exists(public_path('spa/index.html')) ? response()->file(public_path('spa/index.html')) : response('Palemo frontend is served by Vite in development.', 200))
    ->where('path', '^(?!api/|health/|healthz$|readyz$|openapi\.yaml).*$');

/*
|--------------------------------------------------------------------------
| Web Routes
|--------------------------------------------------------------------------
|
| Here is where you can register web routes for your application. These
| routes are loaded by the RouteServiceProvider and all of them will
| be assigned to the "web" middleware group. Make something great!
|
*/

Route::get('/', function () {
    return view('welcome');
});
