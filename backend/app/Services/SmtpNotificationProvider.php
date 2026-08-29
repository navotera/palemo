<?php

namespace App\Services;

use Illuminate\Mail\Message;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Mail;

class SmtpNotificationProvider implements NotificationDeliveryProvider
{
    public function __construct(private readonly ?object $settings = null)
    {
    }

    public function send(object $notification, object $recipient, string $subject, string $body, array $payload): void
    {
        $this->configure();
        Mail::raw($body, function (Message $message) use ($recipient, $subject): void {
            $message->to($recipient->email, $recipient->name)->subject($subject);
        });
    }

    private function configure(): void
    {
        if (!$this->settings) {
            if (!config('mail.mailers.smtp.host')) {
                throw new \RuntimeException('No SMTP delivery provider is configured');
            }
            return;
        }
        if (($this->settings->provider ?? null) !== 'palemo_smtp') {
            throw new \RuntimeException('Invalid SMTP notification provider configuration');
        }
        $password = null;
        if (!empty($this->settings->smtp_password_ciphertext)) {
            try {
                $password = Crypt::decryptString($this->settings->smtp_password_ciphertext);
            } catch (\Throwable) {
                throw new \RuntimeException('Stored SMTP credentials are invalid');
            }
        }
        Config::set('mail.mailers.smtp.host', $this->settings->smtp_host);
        Config::set('mail.mailers.smtp.port', $this->settings->smtp_port ?: 587);
        Config::set('mail.mailers.smtp.username', $this->settings->smtp_username);
        Config::set('mail.mailers.smtp.password', $password);
        Config::set('mail.mailers.smtp.encryption', $this->settings->smtp_encryption === 'none' ? null : ($this->settings->smtp_encryption ?: 'tls'));
        Config::set('mail.from.address', $this->settings->smtp_from_email);
        Config::set('mail.from.name', $this->settings->smtp_from_name ?: config('app.name'));
    }
}
