<?php

namespace App\Http\Controllers;

use App\Support\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ProjectWorkflowController extends Controller
{
    use ApiResponse;

    private function user(Request $request): object
    {
        return $request->attributes->get('principal');
    }

    private function tenant(Request $request): string
    {
        return $this->user($request)->tenant_id;
    }

    private function project(Request $request, string $id): ?object
    {
        return DB::table('projects')
            ->where('tenant_id', $this->tenant($request))
            ->where('id', $id)
            ->whereNull('deleted_at')
            ->first();
    }

    private function canManage(Request $request, object $project): bool
    {
        $actor = $this->user($request);
        if (in_array($actor->role, ['admin', 'manager'], true) || $project->created_by === $actor->id) {
            return true;
        }

        return DB::table('project_people')
            ->where('tenant_id', $this->tenant($request))
            ->where('project_id', $project->id)
            ->where('user_id', $actor->id)
            ->exists();
    }

    private function requireIdempotencyKey(Request $request): ?string
    {
        $key = trim((string) $request->header('Idempotency-Key'));
        return $key !== '' && strlen($key) <= 200 ? $key : null;
    }

    private function replay(Request $request, string $key, string $path): mixed
    {
        $existing = DB::table('user_idempotency_keys')
            ->where('tenant_id', $this->tenant($request))
            ->where('user_id', $this->user($request)->id)
            ->where('key', $key)
            ->where('expires_at', '>', now())
            ->first();
        if (!$existing) {
            return null;
        }
        if ($existing->command_path !== $path) {
            return $this->fail($request, 'CONFLICT', 'Idempotency-Key was already used for another command', 409, 'Idempotency-Key');
        }
        return $this->ok($request, json_decode($existing->response_snapshot_json, true), (int) ($existing->response_status ?: 200));
    }

    private function remember(Request $request, string $key, string $path, array $data, int $status = 200): void
    {
        DB::table('user_idempotency_keys')->insert([
            'tenant_id' => $this->tenant($request),
            'user_id' => $this->user($request)->id,
            'key' => $key,
            'command_path' => $path,
            'request_hash' => hash('sha256', $path),
            'response_status' => $status,
            'response_snapshot_json' => json_encode($data),
            'created_at' => now(),
            'expires_at' => now()->addDay(),
        ]);
    }

    public function submitReview(Request $request, string $id)
    {
        $commandPath = 'projects/'.$id.'/submit-review';
        $key = $this->requireIdempotencyKey($request);
        if (!$key) {
            return $this->fail($request, 'VALIDATION_ERROR', 'A valid Idempotency-Key is required', 400, 'Idempotency-Key');
        }
        if ($replay = $this->replay($request, $key, $commandPath)) {
            return $replay;
        }
        $project = $this->project($request, $id);
        if (!$project) {
            return $this->fail($request, 'NOT_FOUND', 'project not found', 404);
        }
        if (!$this->canManage($request, $project)) {
            return $this->fail($request, 'FORBIDDEN', 'project access required', 403);
        }
        if (!in_array($project->status, ['planning', 'active', 'on_hold'], true)) {
            return $this->fail($request, 'CONFLICT', 'Only planning, active, or on-hold projects can be finished', 409);
        }

        $tenant = $this->tenant($request);
        $reviewers = DB::table('project_people')->where('tenant_id', $tenant)->where('project_id', $id)->where('project_role', 'reviewer')->pluck('user_id');
        $status = $reviewers->isEmpty() ? 'done' : 'review';
        $item = DB::transaction(function () use ($request, $project, $reviewers, $status, $key, $tenant, $commandPath) {
            DB::table('projects')->where('tenant_id', $tenant)->where('id', $project->id)->whereIn('status', ['planning', 'active', 'on_hold'])->update(['status' => $status, 'updated_at' => now()]);
            foreach ($reviewers as $reviewer) {
                DB::table('reviews')->insert(['id' => (string) Str::uuid(), 'tenant_id' => $tenant, 'entity_type' => 'project', 'entity_id' => $project->id, 'reviewer_id' => $reviewer, 'status' => 'pending', 'created_at' => now(), 'updated_at' => now()]);
            }
            $after = (array) DB::table('projects')->where('tenant_id', $tenant)->where('id', $project->id)->first();
            DB::table('audit_events')->insert(['id' => (string) Str::uuid(), 'tenant_id' => $tenant, 'actor_id' => $this->user($request)->id, 'actor_source' => 'user', 'action' => 'submit_review', 'entity_type' => 'project', 'entity_id' => $project->id, 'before_json' => json_encode((array) $project), 'after_json' => json_encode($after), 'request_id' => $request->attributes->get('request_id'), 'created_at' => now()]);
            $this->remember($request, $key, $commandPath, $after);
            return $after;
        });
        return $this->ok($request, $item);
    }

    public function reopen(Request $request, string $id)
    {
        $commandPath = 'projects/'.$id.'/reopen';
        $key = $this->requireIdempotencyKey($request);
        if (!$key) {
            return $this->fail($request, 'VALIDATION_ERROR', 'A valid Idempotency-Key is required', 400, 'Idempotency-Key');
        }
        if ($replay = $this->replay($request, $key, $commandPath)) {
            return $replay;
        }
        $project = $this->project($request, $id);
        if (!$project) {
            return $this->fail($request, 'NOT_FOUND', 'project not found', 404);
        }
        if (!$this->canManage($request, $project)) {
            return $this->fail($request, 'FORBIDDEN', 'project access required', 403);
        }
        if (!in_array($project->status, ['review', 'done'], true)) {
            return $this->fail($request, 'CONFLICT', 'Only projects in review or done can be reopened', 409);
        }

        $item = DB::transaction(function () use ($request, $project, $key, $commandPath) {
            DB::table('projects')->where('tenant_id', $this->tenant($request))->where('id', $project->id)->whereIn('status', ['review', 'done'])->update(['status' => 'active', 'updated_at' => now()]);
            $after = (array) DB::table('projects')->where('tenant_id', $this->tenant($request))->where('id', $project->id)->first();
            DB::table('audit_events')->insert(['id' => (string) Str::uuid(), 'tenant_id' => $this->tenant($request), 'actor_id' => $this->user($request)->id, 'actor_source' => 'user', 'action' => 'reopen', 'entity_type' => 'project', 'entity_id' => $project->id, 'before_json' => json_encode((array) $project), 'after_json' => json_encode($after), 'request_id' => $request->attributes->get('request_id'), 'created_at' => now()]);
            $this->remember($request, $key, $commandPath, $after);
            return $after;
        });
        return $this->ok($request, $item);
    }
}
