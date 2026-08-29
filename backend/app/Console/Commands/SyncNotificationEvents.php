<?php

namespace App\Console\Commands;

use App\Services\NotificationService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class SyncNotificationEvents extends Command
{
    protected $signature = 'notifications:sync-events';
    protected $description = 'Create notifications for recent task, project, review, and knowledge events';

    public function handle(NotificationService $notifications): int
    {
        $since = now()->subMinutes(20);
        $events = DB::table('audit_events')->where('created_at', '>=', $since)->orderBy('created_at')->limit(500)->get();
        foreach ($events as $event) {
            $after = json_decode((string) $event->after_json, true) ?: [];
            $before = json_decode((string) $event->before_json, true) ?: [];
            $payload = ['entity_id' => $event->entity_id, 'url' => config('app.url')];
            if ($event->entity_type === 'task') {
                $this->taskEvent($notifications, $event, $before, $after, $payload);
            } elseif ($event->entity_type === 'project') {
                $this->projectEvent($notifications, $event, $before, $after, $payload);
            } elseif ($event->entity_type === 'review') {
                $this->reviewEvent($notifications, $event, $payload);
            } elseif (in_array($event->entity_type, ['wiki_page', 'meeting_note', 'decision_log', 'lessons_learned'], true)) {
                $this->knowledgeEvent($notifications, $event, $before, $after, $payload);
            }
        }

        $this->syncRecentReviews($notifications, $since);
        $this->syncDueTasks($notifications);
        return self::SUCCESS;
    }

    private function taskEvent(NotificationService $notifications, object $event, array $before, array $after, array $payload): void
    {
        $assignee = $after['assignee_id'] ?? null;
        $previousAssignee = $before['assignee_id'] ?? null;
        if ($assignee && $assignee !== $previousAssignee) {
            $notifications->notifyUsers($event->tenant_id, [$assignee], 'task_assigned', array_merge($payload, [
                'title' => $after['title'] ?? 'Task',
                'message' => 'Task baru ditugaskan kepada Anda.',
            ]), "audit:{$event->id}:task_assigned:{$assignee}");
        }
        if (($after['board_column'] ?? null) === 'review' && ($before['board_column'] ?? null) !== 'review') {
            $reviewers = DB::table('project_people')->where('tenant_id', $event->tenant_id)->where('project_id', $after['project_id'] ?? null)->where('project_role', 'reviewer')->pluck('user_id')->all();
            $notifications->notifyUsers($event->tenant_id, $reviewers, 'task_review_requested', array_merge($payload, [
                'title' => $after['title'] ?? 'Task',
                'message' => 'Task menunggu review atau approval Anda.',
            ]), "audit:{$event->id}:task_review_requested");
        }
    }

    private function projectEvent(NotificationService $notifications, object $event, array $before, array $after, array $payload): void
    {
        $title = $after['name'] ?? 'Project';
        foreach ([['member_ids', 'project_member_added'], ['reviewer_ids', 'project_reviewer_added']] as [$field, $template]) {
            $current = array_values(array_filter((array) ($after[$field] ?? [])));
            $previous = array_values(array_filter((array) ($before[$field] ?? [])));
            $added = array_values(array_diff($current, $previous));
            if ($added) {
                $notifications->notifyUsers($event->tenant_id, $added, $template, array_merge($payload, [
                    'title' => $title,
                    'message' => $template === 'project_reviewer_added' ? 'Anda ditunjuk sebagai reviewer project.' : 'Anda ditambahkan ke project.',
                ]), "audit:{$event->id}:{$template}");
            }
        }
        $status = $after['status'] ?? null;
        if (in_array($status, ['done', 'closed'], true) && ($before['status'] ?? null) !== $status) {
            $recipients = array_values(array_unique(array_merge((array) ($after['member_ids'] ?? []), (array) ($after['reviewer_ids'] ?? []))));
            $notifications->notifyUsers($event->tenant_id, $recipients, 'project_finished', array_merge($payload, [
                'title' => $title,
                'message' => 'Project telah selesai atau ditutup.',
            ]), "audit:{$event->id}:project_finished");
        }
    }

    private function reviewEvent(NotificationService $notifications, object $event, array $payload): void
    {
        $reviewer = DB::table('reviews')->where('tenant_id', $event->tenant_id)->where('id', $event->entity_id)->value('reviewer_id');
        if ($reviewer) {
            $notifications->notifyUsers($event->tenant_id, [$reviewer], 'review_assigned', array_merge($payload, [
                'message' => 'Review baru ditugaskan kepada Anda.',
            ]), "audit:{$event->id}:review_assigned:{$reviewer}");
        }
    }

    private function knowledgeEvent(NotificationService $notifications, object $event, array $before, array $after, array $payload): void
    {
        $viewers = array_values(array_diff((array) ($after['accessible_user_ids'] ?? []), (array) ($before['accessible_user_ids'] ?? [])));
        $editors = array_values(array_diff((array) ($after['accessible_editor_user_ids'] ?? []), (array) ($before['accessible_editor_user_ids'] ?? [])));
        $title = $after['title'] ?? 'Knowledge';
        if ($viewers) $notifications->notifyUsers($event->tenant_id, $viewers, 'knowledge_shared', array_merge($payload, ['title' => $title, 'message' => 'Knowledge dibagikan langsung kepada Anda sebagai viewer.']), "audit:{$event->id}:knowledge_shared");
        if ($editors) $notifications->notifyUsers($event->tenant_id, $editors, 'knowledge_editor_shared', array_merge($payload, ['title' => $title, 'message' => 'Anda diberi akses editor untuk Knowledge ini.']), "audit:{$event->id}:knowledge_editor_shared");
    }

    private function syncRecentReviews(NotificationService $notifications, object $since): void
    {
        DB::table('reviews')->where('created_at', '>=', $since)->get()->each(function ($review) use ($notifications): void {
            $notifications->notifyUsers($review->tenant_id, [$review->reviewer_id], 'review_assigned', [
                'entity_id' => $review->entity_id,
                'message' => 'Review baru ditugaskan kepada Anda.',
                'url' => config('app.url'),
            ], "review:{$review->id}:assigned");
        });
        DB::table('reviews')->where('updated_at', '>=', $since)->whereIn('status', ['approved', 'rejected', 'revision_requested'])->get()->each(function ($review) use ($notifications): void {
            $recipient = $this->reviewOwner($review->tenant_id, $review->entity_type, $review->entity_id);
            if (!$recipient) return;
            $template = match ($review->status) {
                'approved' => 'review_approved',
                'rejected' => 'review_rejected',
                default => 'review_revision_requested',
            };
            $notifications->notifyUsers($review->tenant_id, [$recipient], $template, [
                'entity_id' => $review->entity_id,
                'message' => match ($review->status) {
                    'approved' => 'Review Anda telah disetujui.',
                    'rejected' => 'Review ditolak.',
                    default => 'Review membutuhkan revisi.',
                },
                'url' => config('app.url'),
            ], "review:{$review->id}:{$review->status}");
        });
    }

    private function reviewOwner(string $tenantId, string $type, string $id): ?string
    {
        if ($type === 'task') return DB::table('tasks')->where('tenant_id', $tenantId)->where('id', $id)->value('assignee_id');
        return DB::table('projects')->where('tenant_id', $tenantId)->where('id', $id)->value('created_by');
    }

    private function syncDueTasks(NotificationService $notifications): void
    {
        $tomorrow = now()->addDay()->toDateString();
        DB::table('tasks')->whereNull('deleted_at')->whereNotNull('assignee_id')->whereIn('due_date', [now()->toDateString(), $tomorrow])->where('board_column', '<>', 'done')->get()->each(function ($task) use ($notifications): void {
            $overdue = $task->due_date < now()->toDateString();
            $template = $overdue ? 'task_overdue' : 'task_due_soon';
            $notifications->notifyUsers($task->tenant_id, [$task->assignee_id], $template, [
                'entity_id' => $task->id,
                'title' => $task->title,
                'message' => $overdue ? 'Task telah melewati deadline.' : 'Task mendekati deadline.',
                'url' => config('app.url'),
            ], "task:{$task->id}:{$template}:{$task->due_date}");
        });
    }
}
