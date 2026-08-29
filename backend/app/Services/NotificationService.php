<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class NotificationService
{
    /**
     * Queue dashboard and email notifications for tenant-owned users.
     * The dedupe key makes retries and repeated mutations safe.
     */
    public function notifyUsers(string $tenantId, array $recipientIds, string $template, array $payload = [], ?string $dedupeKey = null, array $channels = ['dashboard', 'email']): void
    {
        $recipientIds = array_values(array_unique(array_filter($recipientIds, fn ($id) => is_string($id) && Str::isUuid($id))));
        if (!$recipientIds || trim($template) === '') {
            return;
        }

        $validIds = DB::table('users')
            ->where('tenant_id', $tenantId)
            ->whereIn('id', array_slice($recipientIds, 0, 100))
            ->pluck('id')
            ->all();
        if (!$validIds) {
            return;
        }

        $now = now();
        $rows = [];
        foreach ($validIds as $recipientId) {
            foreach (array_values(array_unique($channels)) as $channel) {
                if (!in_array($channel, ['dashboard', 'email'], true)) continue;
                $rows[] = [
                    'id' => (string) Str::uuid(),
                    'tenant_id' => $tenantId,
                    'recipient_id' => $recipientId,
                    'channel' => $channel,
                    'template' => trim($template),
                    'payload_json' => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    'status' => 'queued',
                    'dedupe_key' => $dedupeKey ? mb_substr($dedupeKey, 0, 255) : null,
                    'available_at' => $now,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }
        }

        DB::table('notifications')->insertOrIgnore($rows);
    }
}
