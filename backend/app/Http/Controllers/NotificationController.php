<?php

namespace App\Http\Controllers;

use App\Support\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class NotificationController extends Controller
{
    use ApiResponse;

    private function user(Request $request): object
    {
        return $request->attributes->get('principal');
    }

    public function index(Request $request)
    {
        $user = $this->user($request);
        $limit = min(50, max(1, (int) $request->query('limit', 20)));
        $items = DB::table('notifications')
            ->where('tenant_id', $user->tenant_id)
            ->where('recipient_id', $user->id)
            ->where('channel', 'dashboard')
            ->orderByDesc('created_at')
            ->limit($limit)
            ->get()
            ->map(function ($item) {
                $item->payload = json_decode((string) $item->payload_json, true) ?: [];
                unset($item->payload_json);
                return (array) $item;
            })
            ->all();

        return $this->ok($request, [
            'items' => $items,
            'unread_count' => DB::table('notifications')
                ->where('tenant_id', $user->tenant_id)
                ->where('recipient_id', $user->id)
                ->where('channel', 'dashboard')
                ->where('status', 'queued')
                ->count(),
        ]);
    }

    public function read(Request $request, string $id)
    {
        $user = $this->user($request);
        $updated = DB::table('notifications')
            ->where('tenant_id', $user->tenant_id)
            ->where('recipient_id', $user->id)
            ->where('channel', 'dashboard')
            ->where('id', $id)
            ->where('status', 'queued')
            ->update(['status' => 'read', 'updated_at' => now()]);
        if (!$updated) {
            return $this->fail($request, 'NOT_FOUND', 'notification not found', 404);
        }
        return $this->ok($request, ['read' => true]);
    }
}
