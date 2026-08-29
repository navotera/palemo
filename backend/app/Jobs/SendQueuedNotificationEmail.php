<?php

namespace App\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;

class SendQueuedNotificationEmail implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;
    public array $backoff = [60, 300, 900];

    public function __construct(public string $notificationId)
    {
    }

    public function handle(): void
    {
        $notification = DB::table('notifications as n')
            ->join('users as u', function ($join) {
                $join->on('u.id', '=', 'n.recipient_id')->on('u.tenant_id', '=', 'n.tenant_id');
            })
            ->where('n.id', $this->notificationId)
            ->where('n.channel', 'email')
            ->where('n.status', 'queued')
            ->select('n.*', 'u.email', 'u.name')
            ->first();
        if (!$notification) {
            return;
        }

        $payload = json_decode((string) $notification->payload_json, true) ?: [];
        $subject = (string) ($payload['subject'] ?? $this->subject($notification->template));
        $body = $this->body($notification->template, $payload);
        app(\App\Services\NotificationDeliveryManager::class)
            ->send($notification, (object) ['email' => $notification->email, 'name' => $notification->name], $subject, $body, $payload);

        DB::table('notifications')->where('id', $notification->id)->update([
            'status' => 'sent',
            'sent_at' => now(),
            'updated_at' => now(),
            'failure_reason' => null,
        ]);
    }

    public function failed(\Throwable $exception): void
    {
        DB::table('notifications')->where('id', $this->notificationId)->update([
            'status' => 'failed',
            'failed_at' => now(),
            'failure_reason' => mb_substr($exception->getMessage(), 0, 500),
            'updated_at' => now(),
        ]);
    }

    private function subject(string $template): string
    {
        return match ($template) {
            'task_assigned' => 'Task baru ditugaskan kepada Anda',
            'task_due_soon' => 'Task mendekati deadline',
            'task_overdue' => 'Task telah melewati deadline',
            'task_review_requested' => 'Task menunggu review Anda',
            'project_member_added' => 'Anda ditambahkan ke project',
            'project_reviewer_added' => 'Anda ditunjuk sebagai reviewer project',
            'project_finished' => 'Project telah selesai',
            'review_assigned' => 'Review baru ditugaskan kepada Anda',
            'review_approved' => 'Review telah disetujui',
            'review_rejected' => 'Review ditolak',
            'review_revision_requested' => 'Review membutuhkan revisi',
            'review_published' => 'Hasil review telah diterbitkan',
            'knowledge_shared' => 'Knowledge dibagikan kepada Anda',
            'knowledge_editor_shared' => 'Anda diberi akses editor Knowledge',
            'notification_test' => 'Test notification NPMS',
            default => 'Notifikasi NPMS',
        };
    }

    private function body(string $template, array $payload): string
    {
        $title = trim((string) ($payload['title'] ?? $payload['name'] ?? 'Item NPMS'));
        $link = (string) ($payload['url'] ?? config('app.url'));
        return $this->subject($template)."\n\n{$title}\n\n".($payload['message'] ?? 'Silakan buka NPMS untuk melihat detail dan mengambil tindakan.')."\n\n{$link}";
    }
}
