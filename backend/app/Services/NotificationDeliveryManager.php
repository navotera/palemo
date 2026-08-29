<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

class NotificationDeliveryManager
{
    public function send(object $notification, object $recipient, string $subject, string $body, array $payload): void
    {
        $settings = DB::table('notification_delivery_settings')
            ->where('tenant_id', $notification->tenant_id)
            ->first();

        $provider = match ($settings?->provider ?? 'palemo_smtp') {
            'ecopa' => new EcopaNotificationProvider($settings),
            'palemo_smtp' => new SmtpNotificationProvider($settings),
            default => throw new \RuntimeException('Unsupported notification delivery provider'),
        };
        $provider->send($notification, $recipient, $subject, $body, $payload);
    }
}
