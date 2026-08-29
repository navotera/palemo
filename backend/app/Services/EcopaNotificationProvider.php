<?php

namespace App\Services;

use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;

class EcopaNotificationProvider implements NotificationDeliveryProvider
{
    public function __construct(private readonly object $settings)
    {
    }

    public function send(object $notification, object $recipient, string $subject, string $body, array $payload): void
    {
        $secret = '';
        if (!empty($this->settings->ecopa_secret_ciphertext)) {
            try {
                $secret = Crypt::decryptString($this->settings->ecopa_secret_ciphertext);
            } catch (\Throwable) {
                throw new \RuntimeException('Stored Ecopa credentials are invalid');
            }
        }
        $baseUrl = rtrim((string) $this->settings->ecopa_base_url, '/');
        if ($baseUrl === '' || (string) $this->settings->ecopa_client_id === '' || $secret === '') {
            throw new \RuntimeException('Ecopa notification provider is not fully configured');
        }

        $response = Http::timeout(10)
            ->retry(2, 250)
            ->withHeaders([
                'Accept' => 'application/json',
                'X-Ecopa-Client-Id' => (string) $this->settings->ecopa_client_id,
                'Authorization' => 'Bearer '.$secret,
            ])
            ->post($baseUrl, [
                'notification_id' => $notification->id,
                'channel' => 'email',
                'recipient_email' => $recipient->email,
                'recipient_name' => $recipient->name,
                'template' => $notification->template,
                'subject' => $subject,
                'body' => $body,
                'payload' => $payload,
            ]);

        if ($response->failed()) {
            throw new \RuntimeException('Ecopa notification delivery failed with HTTP '.$response->status());
        }
    }
}
