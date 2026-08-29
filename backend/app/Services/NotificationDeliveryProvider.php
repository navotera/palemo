<?php

namespace App\Services;

interface NotificationDeliveryProvider
{
    public function send(object $notification, object $recipient, string $subject, string $body, array $payload): void;
}
