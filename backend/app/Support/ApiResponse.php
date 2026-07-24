<?php

namespace App\Support;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

trait ApiResponse
{
    protected function ok(Request $request, mixed $data, int $status = 200): JsonResponse
    {
        return response()->json(['data' => $data, 'meta' => ['request_id' => $request->attributes->get('request_id')], 'errors' => null], $status);
    }

    protected function fail(Request $request, string $code, string $message, int $status, ?string $field = null): JsonResponse
    {
        $error = ['code' => $code, 'message' => $message];
        if ($field) $error['field'] = $field;
        return response()->json(['data' => null, 'meta' => ['request_id' => $request->attributes->get('request_id')], 'errors' => [$error]], $status);
    }
}
