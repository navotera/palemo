<?php

namespace App\Console\Commands;

use App\Jobs\SendQueuedNotificationEmail;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class QueueNotificationEmails extends Command
{
    protected $signature = 'notifications:queue-email {--limit=200}';
    protected $description = 'Queue pending notification emails for background delivery';

    public function handle(): int
    {
        $remaining = min(500, max(1, (int) $this->option('limit')));
        $this->ensureTenantSettings();
        $queued = 0;

        DB::table('notification_delivery_settings')->orderBy('tenant_id')->get()->each(function ($settings) use (&$remaining, &$queued): void {
            if ($remaining <= 0 || !$this->isDue($settings)) return;
            DB::table('notification_delivery_settings')->where('id', $settings->id)->update(['queue_last_run_at' => now(), 'updated_at' => now()]);
            $ids = DB::transaction(function () use ($settings, $remaining): array {
                $rows = DB::table('notifications')
                    ->where('tenant_id', $settings->tenant_id)
                    ->where('channel', 'email')
                    ->where('status', 'queued')
                    ->where('available_at', '<=', now())
                    ->orderBy('created_at')
                    ->lock('for update skip locked')
                    ->limit($remaining)
                    ->pluck('id')
                    ->all();
                if ($rows) DB::table('notifications')->whereIn('id', $rows)->update(['available_at' => now()->addMinutes(20), 'updated_at' => now()]);
                return $rows;
            });
            foreach ($ids as $id) SendQueuedNotificationEmail::dispatch((string) $id)->onQueue('notifications');
            $queued += count($ids);
            $remaining -= count($ids);
        });

        $this->info(sprintf('Queued %d notification email(s).', $queued));
        return self::SUCCESS;
    }

    private function isDue(object $settings): bool
    {
        return !$settings->queue_last_run_at || Carbon::parse($settings->queue_last_run_at)->addMinutes((int) $settings->queue_interval_minutes)->lte(now());
    }

    private function ensureTenantSettings(): void
    {
        DB::table('notifications')->where('channel', 'email')->where('status', 'queued')->distinct()->pluck('tenant_id')->each(function ($tenantId): void {
            DB::table('notification_delivery_settings')->insertOrIgnore([
                'id' => (string) Str::uuid(),
                'tenant_id' => $tenantId,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        });
    }
}
