<?php

namespace App\Http\Controllers;

use App\Support\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ProjectTemplateController extends Controller
{
    use ApiResponse;

    private function user(Request $request): object { return $request->attributes->get('principal'); }
    private function tenant(Request $request): string { return $this->user($request)->tenant_id; }

    private function key(Request $request): ?string
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
        if (!$existing) return null;
        if ($existing->command_path !== $path) return $this->fail($request, 'CONFLICT', 'Idempotency-Key was already used for another command', 409, 'Idempotency-Key');
        return $this->ok($request, json_decode($existing->response_snapshot_json, true), (int) ($existing->response_status ?: 200));
    }

    private function remember(Request $request, string $key, string $path, array $data, int $status = 200): void
    {
        DB::table('user_idempotency_keys')->insert([
            'tenant_id' => $this->tenant($request), 'user_id' => $this->user($request)->id,
            'key' => $key, 'command_path' => $path, 'request_hash' => hash('sha256', $path),
            'response_status' => $status, 'response_snapshot_json' => json_encode($data),
            'created_at' => now(), 'expires_at' => now()->addDay(),
        ]);
    }

    private function canManageProject(Request $request, object $project): bool
    {
        $actor = $this->user($request);
        if (in_array($actor->role, ['admin', 'manager'], true) || $project->created_by === $actor->id) return true;
        return DB::table('project_people')->where('tenant_id', $this->tenant($request))->where('project_id', $project->id)->where('user_id', $actor->id)->exists();
    }

    private function canManageTemplate(Request $request, object $template): bool
    {
        $actor = $this->user($request);
        return in_array($actor->role, ['admin', 'manager'], true) || $template->created_by === $actor->id;
    }

    private function structureForProject(Request $request, object $project): array
    {
        $tasks = DB::table('tasks')->where('tenant_id', $this->tenant($request))->where('project_id', $project->id)->whereNull('deleted_at')->orderBy('position')->get();
        $metadata = is_string($project->metadata ?? null) ? (json_decode($project->metadata, true) ?: []) : (($project->metadata ?? []) ?: []);
        $tags = trim((string) ($project->tags ?? ''), '{}');
        $people = DB::table('project_people')->where('tenant_id', $this->tenant($request))->where('project_id', $project->id)->get(['user_id', 'project_role']);
        return [
            'project_title' => (string) $project->name,
            'team_id' => (string) $project->team_id,
            'project_scope' => is_array($metadata['project_scope'] ?? null) ? $metadata['project_scope'] : [],
            'member_ids' => $people->where('project_role', 'member')->pluck('user_id')->values()->all(),
            'reviewer_ids' => $people->where('project_role', 'reviewer')->pluck('user_id')->values()->all(),
            'metadata' => ['custom_fields' => is_array($metadata['custom_fields'] ?? null) ? $metadata['custom_fields'] : [], 'knowledge_page_ids' => array_values(array_filter($metadata['knowledge_page_ids'] ?? [], 'is_string'))],
            'tags' => $tags === '' ? [] : str_getcsv($tags),
            'preliminary_notes' => (string) ($project->preliminary_notes ?? ''),
            'tasks' => $tasks->map(function ($task) use ($request) {
                return [
                    'title' => $task->title,
                    'description' => $task->description ?? '',
                    'board_column' => 'todo',
                    'position' => (int) $task->position,
                    'estimated_hours' => $task->estimated_hours,
                    'checklist' => DB::table('checklist_items')->where('tenant_id', $this->tenant($request))->where('task_id', $task->id)->orderBy('item_order')->pluck('label')->values()->all(),
                ];
            })->values()->all(),
            'milestones' => DB::table('milestones')->where('tenant_id', $this->tenant($request))->where('project_id', $project->id)->orderBy('created_at')->get(['name', 'status'])->map(fn ($milestone) => ['name' => $milestone->name, 'status' => 'planning'])->values()->all(),
        ];
    }

    private function templateData(object $template, bool $includeStructure = false): array
    {
        $structure = is_string($template->structure_json ?? null) ? (json_decode($template->structure_json, true) ?: []) : (($template->structure_json ?? []) ?: []);
        $data = [
            'id' => $template->id, 'name' => $template->name, 'description' => $template->description,
            'project_type' => $template->project_type, 'visibility' => $template->visibility,
            'version' => (int) $template->version, 'source_project_id' => $template->source_project_id,
            'created_by' => $template->created_by, 'created_by_name' => $template->created_by_name ?? null,
            'usage_count' => (int) ($template->usage_count ?? 0), 'tags' => array_values(array_filter($structure['tags'] ?? [], 'is_string')), 'created_at' => $template->created_at, 'updated_at' => $template->updated_at,
        ];
        if ($includeStructure) $data['structure'] = $structure;
        return $data;
    }

    public function index(Request $request)
    {
        $tenant = $this->tenant($request);
        $templates = DB::table('project_templates as pt')
            ->leftJoin('users as creator', function ($join) {
                $join->on('creator.id', '=', 'pt.created_by')->on('creator.tenant_id', '=', 'pt.tenant_id');
            })
            ->select('pt.*', 'creator.name as created_by_name')
            ->selectSub(function ($query) {
                $query->from('projects')
                    ->selectRaw('count(*)')
                    ->whereColumn('projects.template_id', 'pt.id')
                    ->whereColumn('projects.tenant_id', 'pt.tenant_id')
                    ->whereNull('projects.deleted_at');
            }, 'usage_count')
            ->where('pt.tenant_id', $tenant)->whereNull('pt.deleted_at')
            ->orderByDesc('pt.updated_at')->limit(50)->get();
        return $this->ok($request, $templates->map(fn ($template) => $this->templateData($template))->values()->all());
    }

    public function show(Request $request, string $id)
    {
        $template = DB::table('project_templates')->where('tenant_id', $this->tenant($request))->where('id', $id)->whereNull('deleted_at')->first();
        return $template ? $this->ok($request, $this->templateData($template, true)) : $this->fail($request, 'NOT_FOUND', 'project template not found', 404);
    }

    public function update(Request $request, string $id)
    {
        $tenant = $this->tenant($request);
        $template = DB::table('project_templates')->where('tenant_id', $tenant)->where('id', $id)->whereNull('deleted_at')->first();
        if (!$template) return $this->fail($request, 'NOT_FOUND', 'project template not found', 404);
        if (!$this->canManageTemplate($request, $template)) return $this->fail($request, 'FORBIDDEN', 'project template access required', 403);

        $data = $request->validate([
            'name' => 'sometimes|required|string|max:160',
            'description' => 'sometimes|nullable|string|max:1000',
            'project_type' => 'sometimes|nullable|string|max:40',
            'visibility' => 'sometimes|in:private,team,tenant',
            'version' => 'required|integer|min:1',
            'structure' => 'sometimes|array',
            'structure.project_title' => 'sometimes|string|max:160',
            'structure.team_id' => 'sometimes|uuid',
            'structure.project_scope' => 'sometimes|array',
            'structure.project_scope.division_ids' => 'sometimes|array|max:50',
            'structure.project_scope.division_ids.*' => 'uuid',
            'structure.project_scope.team_ids' => 'sometimes|array|max:100',
            'structure.project_scope.team_ids.*' => 'uuid',
            'structure.project_scope.user_ids' => 'sometimes|array|max:100',
            'structure.project_scope.user_ids.*' => 'uuid',
            'structure.member_ids' => 'sometimes|array|max:100',
            'structure.member_ids.*' => 'uuid',
            'structure.reviewer_ids' => 'sometimes|array|max:50',
            'structure.reviewer_ids.*' => 'uuid',
            'structure.tags' => 'sometimes|array|max:50',
            'structure.tags.*' => 'string|max:60',
            'structure.preliminary_notes' => 'sometimes|nullable|string|max:200000',
            'structure.metadata' => 'sometimes|array',
            'structure.metadata.knowledge_page_ids' => 'sometimes|array|max:20',
            'structure.metadata.knowledge_page_ids.*' => 'uuid',
            'structure.tasks' => 'sometimes|array|max:200',
            'structure.tasks.*.title' => 'required|string|max:200',
            'structure.tasks.*.description' => 'nullable|string|max:200000',
            'structure.tasks.*.position' => 'integer|min:0|max:10000',
        ]);
        if ((int) $data['version'] !== (int) $template->version) return $this->fail($request, 'CONFLICT', 'template was changed by another request', 409, 'version');

        $structure = $data['structure'] ?? null;
        if ($structure) {
            $teamID = $structure['team_id'] ?? null;
            if ($teamID && !DB::table('teams')->where('tenant_id', $tenant)->where('id', $teamID)->exists()) return $this->fail($request, 'VALIDATION_ERROR', 'template team does not belong to this workspace', 422, 'structure.team_id');
            $scope = $structure['project_scope'] ?? [];
            foreach ([['division_ids', 'divisions'], ['team_ids', 'teams'], ['user_ids', 'users']] as [$field, $table]) {
                $ids = array_values(array_unique($scope[$field] ?? []));
                if ($ids && DB::table($table)->where('tenant_id', $tenant)->whereIn('id', $ids)->count() !== count($ids)) return $this->fail($request, 'VALIDATION_ERROR', 'template scope contains a resource from another workspace', 422, 'structure.project_scope.'.$field);
            }
            $people = array_values(array_unique(array_merge($structure['member_ids'] ?? [], $structure['reviewer_ids'] ?? [])));
            if ($people && DB::table('users')->where('tenant_id', $tenant)->whereIn('id', $people)->count() !== count($people)) return $this->fail($request, 'VALIDATION_ERROR', 'template people contain a user from another workspace', 422, 'structure.member_ids');
            $knowledgeIDs = array_values(array_unique($structure['metadata']['knowledge_page_ids'] ?? []));
            if ($knowledgeIDs && DB::table('wiki_pages')->where('tenant_id', $tenant)->whereNull('deleted_at')->whereIn('id', $knowledgeIDs)->count() !== count($knowledgeIDs)) return $this->fail($request, 'VALIDATION_ERROR', 'template knowledge sources contain a page from another workspace', 422, 'structure.metadata.knowledge_page_ids');
            $data['structure'] = $structure;
        }

        $before = $this->templateData($template, true);
        $nextVersion = (int) $template->version + 1;
        $updates = ['version' => $nextVersion, 'updated_at' => now()];
        if ($structure !== null) $updates['structure_json'] = json_encode($structure);
        foreach (['name', 'description', 'project_type', 'visibility'] as $field) if (array_key_exists($field, $data)) $updates[$field] = is_string($data[$field]) ? trim($data[$field]) : $data[$field];
        $item = DB::transaction(function () use ($request, $tenant, $id, $template, $updates, $nextVersion, $before) {
            DB::table('project_templates')->where('tenant_id', $tenant)->where('id', $id)->update($updates);
            DB::table('project_template_versions')->insert([
                'id' => (string) Str::uuid(), 'tenant_id' => $tenant, 'project_template_id' => $id,
                'version' => $nextVersion, 'project_type' => $updates['project_type'] ?? $template->project_type,
                'structure_json' => $updates['structure_json'] ?? $template->structure_json, 'created_by' => $this->user($request)->id, 'created_at' => now(),
            ]);
            $after = $this->templateData(DB::table('project_templates')->where('tenant_id', $tenant)->where('id', $id)->first(), true);
            DB::table('audit_events')->insert([
                'id' => (string) Str::uuid(), 'tenant_id' => $tenant, 'actor_id' => $this->user($request)->id,
                'actor_source' => 'user', 'action' => 'update', 'entity_type' => 'project_template', 'entity_id' => $id,
                'before_json' => json_encode($before), 'after_json' => json_encode($after),
                'request_id' => $request->attributes->get('request_id'), 'created_at' => now(),
            ]);
            return $after;
        });
        return $this->ok($request, $item);
    }

    public function store(Request $request)
    {
        $key = $this->key($request);
        if (!$key) return $this->fail($request, 'VALIDATION_ERROR', 'A valid Idempotency-Key is required', 400, 'Idempotency-Key');
        $path = 'project-templates/create';
        if ($replay = $this->replay($request, $key, $path)) return $replay;
        $data = $request->validate(['name' => 'required|string|max:160', 'description' => 'nullable|string|max:1000', 'project_type' => 'nullable|string|max:40', 'visibility' => 'nullable|in:private,team,tenant', 'source_project_id' => 'required|uuid', 'allow_incomplete' => 'sometimes|boolean']);
        $project = DB::table('projects')->where('tenant_id', $this->tenant($request))->where('id', $data['source_project_id'])->whereNull('deleted_at')->first();
        if (!$project) return $this->fail($request, 'NOT_FOUND', 'source project not found', 404, 'source_project_id');
        if ($project->status !== 'done' && !($data['allow_incomplete'] ?? false && $project->created_by === $this->user($request)->id)) return $this->fail($request, 'CONFLICT', 'Only completed projects can become templates unless you are saving your newly created project', 409, 'source_project_id');
        if (!$this->canManageProject($request, $project)) return $this->fail($request, 'FORBIDDEN', 'project template access required', 403);
        $id = (string) Str::uuid();
        $structure = $this->structureForProject($request, $project);
        $result = DB::transaction(function () use ($request, $data, $id, $project, $structure) {
            $now = now();
            DB::table('project_templates')->insert([
                'id' => $id, 'tenant_id' => $this->tenant($request), 'name' => trim($data['name']),
                'description' => isset($data['description']) ? trim($data['description']) : null,
                'project_type' => $data['project_type'] ?? $project->project_type,
                'visibility' => $data['visibility'] ?? 'tenant', 'version' => 1,
                'source_project_id' => $project->id, 'created_by' => $this->user($request)->id,
                'structure_json' => json_encode($structure), 'created_at' => $now, 'updated_at' => $now,
            ]);
            DB::table('project_template_versions')->insert(['id' => (string) Str::uuid(), 'tenant_id' => $this->tenant($request), 'project_template_id' => $id, 'version' => 1, 'project_type' => $data['project_type'] ?? $project->project_type, 'structure_json' => json_encode($structure), 'created_by' => $this->user($request)->id, 'created_at' => $now]);
            $item = $this->templateData(DB::table('project_templates')->where('tenant_id', $this->tenant($request))->where('id', $id)->first(), true);
            DB::table('audit_events')->insert(['id' => (string) Str::uuid(), 'tenant_id' => $this->tenant($request), 'actor_id' => $this->user($request)->id, 'actor_source' => 'user', 'action' => 'create', 'entity_type' => 'project_template', 'entity_id' => $id, 'after_json' => json_encode($item), 'request_id' => $request->attributes->get('request_id'), 'created_at' => $now]);
            return $item;
        });
        $this->remember($request, $key, $path, $result, 201);
        return $this->ok($request, $result, 201);
    }

    public function createProject(Request $request, string $templateId)
    {
        $key = $this->key($request);
        if (!$key) return $this->fail($request, 'VALIDATION_ERROR', 'A valid Idempotency-Key is required', 400, 'Idempotency-Key');
        $path = 'project-templates/'.$templateId.'/projects';
        if ($replay = $this->replay($request, $key, $path)) return $replay;
        $template = DB::table('project_templates')->where('tenant_id', $this->tenant($request))->where('id', $templateId)->whereNull('deleted_at')->first();
        if (!$template) return $this->fail($request, 'NOT_FOUND', 'project template not found', 404);
        $data = $request->validate([
            'name' => 'required|string|max:160', 'team_id' => 'required|uuid', 'project_type' => 'nullable|string|max:40',
            'tags' => 'array|max:50', 'tags.*' => 'string|max:60', 'metadata' => 'array',
            'metadata.project_scope' => 'nullable|array', 'member_ids' => 'array|max:100', 'member_ids.*' => 'uuid',
            'reviewer_ids' => 'array|max:50', 'reviewer_ids.*' => 'uuid', 'preliminary_notes' => 'nullable|string|max:200000',
            'knowledge_page_ids' => 'array|max:20', 'knowledge_page_ids.*' => 'uuid',
        ]);
        $tenant = $this->tenant($request);
        if (!DB::table('teams')->where('tenant_id', $tenant)->where('id', $data['team_id'])->exists()) return $this->fail($request, 'VALIDATION_ERROR', 'team does not belong to this workspace', 422, 'team_id');
        $people = array_values(array_unique(array_merge($data['member_ids'] ?? [], $data['reviewer_ids'] ?? [])));
        if ($people && DB::table('users')->where('tenant_id', $tenant)->whereIn('id', $people)->count() !== count($people)) return $this->fail($request, 'VALIDATION_ERROR', 'one or more users do not belong to this workspace', 422, 'member_ids');
        $id = (string) Str::uuid();
        $structure = is_string($template->structure_json) ? json_decode($template->structure_json, true) : ($template->structure_json ?? []);
        $result = DB::transaction(function () use ($request, $data, $tenant, $id, $templateId, $structure) {
            $displayNumber = (int) (DB::table('projects')->where('tenant_id', $tenant)->max('display_number') ?? 0) + 1;
            $tags = '{'.implode(',', array_map(fn ($tag) => '"'.str_replace('"', '\\"', $tag).'"', $data['tags'] ?? [])).'}';
            DB::table('projects')->insert([
                'id' => $id, 'tenant_id' => $tenant, 'created_by' => $this->user($request)->id, 'display_number' => $displayNumber,
                'team_id' => $data['team_id'], 'template_id' => $templateId, 'name' => trim($data['name']),
                'project_type' => $data['project_type'] ?? $template->project_type, 'tags' => $tags,
                'preliminary_notes' => $data['preliminary_notes'] ?? '', 'status' => 'planning',
                'metadata' => json_encode($data['metadata'] ?? []), 'created_at' => now(), 'updated_at' => now(),
            ]);
            foreach (['member_ids' => 'member', 'reviewer_ids' => 'reviewer'] as $field => $role) foreach (array_unique($data[$field] ?? []) as $userId) DB::table('project_people')->insert(['id' => (string) Str::uuid(), 'tenant_id' => $tenant, 'project_id' => $id, 'user_id' => $userId, 'project_role' => $role, 'created_at' => now()]);
            foreach (($structure['tasks'] ?? []) as $position => $task) {
                if (!is_array($task) || trim((string) ($task['title'] ?? '')) === '') continue;
                $taskId = (string) Str::uuid();
                DB::table('tasks')->insert(['id' => $taskId, 'tenant_id' => $tenant, 'project_id' => $id, 'assignee_id' => null, 'title' => trim($task['title']), 'description' => (string) ($task['description'] ?? ''), 'board_column' => 'todo', 'position' => (int) ($task['position'] ?? $position), 'estimated_hours' => $task['estimated_hours'] ?? null, 'created_at' => now(), 'updated_at' => now()]);
                foreach (array_values(array_filter($task['checklist'] ?? [], fn ($label) => is_string($label) && trim($label) !== '')) as $order => $label) DB::table('checklist_items')->insert(['id' => (string) Str::uuid(), 'tenant_id' => $tenant, 'task_id' => $taskId, 'label' => trim($label), 'is_done' => false, 'item_order' => $order, 'created_at' => now(), 'updated_at' => now()]);
            }
            $item = (array) DB::table('projects')->where('tenant_id', $tenant)->where('id', $id)->first();
            DB::table('audit_events')->insert(['id' => (string) Str::uuid(), 'tenant_id' => $tenant, 'actor_id' => $this->user($request)->id, 'actor_source' => 'user', 'action' => 'create_from_template', 'entity_type' => 'project', 'entity_id' => $id, 'after_json' => json_encode(['project_id' => $id, 'template_id' => $templateId]), 'request_id' => $request->attributes->get('request_id'), 'created_at' => now()]);
            return $item;
        });
        $this->remember($request, $key, $path, $result, 201);
        return $this->ok($request, $result, 201);
    }
}
