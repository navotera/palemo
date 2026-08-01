<?php

namespace App\Http\Controllers;

use App\Support\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class OrganizationController extends Controller
{
    use ApiResponse;

    private function principal(Request $request): object
    {
        return $request->attributes->get('principal');
    }

    private function tenant(Request $request): string
    {
        return $this->principal($request)->tenant_id;
    }

    private function canManage(Request $request): bool
    {
        return in_array($this->principal($request)->role, ['admin', 'manager'], true);
    }

    private function audit(Request $request, string $action, string $entityType, string $entityId, array $state): void
    {
        DB::table('audit_events')->insert([
            'id' => (string) Str::uuid(),
            'tenant_id' => $this->tenant($request),
            'actor_id' => $this->principal($request)->id,
            'actor_source' => 'user',
            'action' => $action,
            'entity_type' => $entityType,
            'entity_id' => $entityId,
            'after_json' => json_encode($state),
            'request_id' => $request->attributes->get('request_id'),
            'created_at' => now(),
        ]);
    }

    private function teamData(string $tenant): array
    {
        return DB::table('teams')->where('tenant_id', $tenant)->orderBy('name')->get()->map(function ($team) use ($tenant) {
            return [
                'id' => $team->id,
                'division_id' => $team->division_id,
                'division_ids' => DB::table('team_divisions')->where('tenant_id', $tenant)->where('team_id', $team->id)->orderBy('division_id')->pluck('division_id')->all(),
                'member_ids' => DB::table('users')->where('tenant_id', $tenant)->where('team_id', $team->id)->orderBy('id')->pluck('id')->all(),
                'name' => $team->name,
                'color' => $team->color ?? '#4774b8',
                'icon' => $team->icon ?? '👥',
            ];
        })->all();
    }

    public function divisions(Request $request)
    {
        $tenant = $this->tenant($request);
        $teams = collect($this->teamData($tenant));
        $items = DB::table('divisions')->where('tenant_id', $tenant)->orderBy('name')->get()->map(function ($division) use ($tenant, $teams) {
            $linkedTeams = $teams->filter(fn (array $team) => in_array($division->id, $team['division_ids'], true))->values()->all();
            return [
                'id' => $division->id,
                'parent_division_id' => $division->parent_division_id,
                'name' => $division->name,
                'color' => $division->color ?? '#3b9a68',
                'icon' => $division->icon ?? '🏢',
                'created_at' => $division->created_at,
                'member_ids' => DB::table('division_members')->where('tenant_id', $tenant)->where('division_id', $division->id)->orderBy('user_id')->pluck('user_id')->all(),
                'team_ids' => collect($linkedTeams)->pluck('id')->all(),
                'teams' => $linkedTeams,
                'lead_user_ids' => DB::table('division_leads')->where('tenant_id', $tenant)->where('division_id', $division->id)->pluck('user_id')->all(),
            ];
        })->all();

        return $this->ok($request, $items);
    }

    public function teams(Request $request)
    {
        return $this->ok($request, $this->teamData($this->tenant($request)));
    }

    public function createTeam(Request $request)
    {
        if (!$this->canManage($request)) return $this->fail($request, 'FORBIDDEN', 'admin or manager role required', 403);
        if (trim((string) $request->header('Idempotency-Key')) === '') return $this->fail($request, 'VALIDATION_ERROR', 'Idempotency-Key is required', 400, 'Idempotency-Key');
        $data = $request->validate([
            'name' => 'required|string|max:100',
            'division_ids' => 'required|array|min:1|max:100',
            'division_ids.*' => 'uuid',
            'member_ids' => 'array|max:100',
            'member_ids.*' => 'uuid',
            'color' => 'sometimes|regex:/^#[0-9a-fA-F]{6}$/',
            'icon' => 'sometimes|required|string|max:16',
        ]);
        $tenant = $this->tenant($request);
        $divisionIds = array_values(array_unique($data['division_ids']));
        $memberIds = array_values(array_unique($data['member_ids'] ?? []));
        if (DB::table('divisions')->where('tenant_id', $tenant)->whereIn('id', $divisionIds)->count() !== count($divisionIds)) return $this->fail($request, 'NOT_FOUND', 'one or more divisions were not found', 404, 'division_ids');
        if (DB::table('users')->where('tenant_id', $tenant)->whereIn('id', $memberIds)->count() !== count($memberIds)) return $this->fail($request, 'NOT_FOUND', 'one or more users were not found', 404, 'member_ids');
        $name = trim($data['name']);
        if (DB::table('teams')->where('tenant_id', $tenant)->whereRaw('LOWER(name) = ?', [mb_strtolower($name)])->exists()) return $this->fail($request, 'CONFLICT', 'team name already exists', 409, 'name');

        return DB::transaction(function () use ($request, $tenant, $data, $divisionIds, $memberIds, $name) {
            $id = (string) Str::uuid();
            DB::table('teams')->insert(['id' => $id, 'tenant_id' => $tenant, 'division_id' => $divisionIds[0], 'name' => $name, 'color' => $data['color'] ?? '#4774b8', 'icon' => trim($data['icon'] ?? '👥'), 'created_at' => now(), 'updated_at' => now()]);
            foreach ($divisionIds as $divisionId) DB::table('team_divisions')->insert(['id' => (string) Str::uuid(), 'tenant_id' => $tenant, 'team_id' => $id, 'division_id' => $divisionId, 'created_at' => now(), 'updated_at' => now()]);
            if ($memberIds) DB::table('users')->where('tenant_id', $tenant)->whereIn('id', $memberIds)->update(['team_id' => $id, 'updated_at' => now()]);
            $item = collect($this->teamData($tenant))->firstWhere('id', $id);
            $this->audit($request, 'create', 'team', $id, $item);
            return $this->ok($request, $item, 201);
        });
    }

    public function setDivisionMembers(Request $request, string $id)
    {
        return $this->replaceRelation($request, 'division', $id, 'member_ids');
    }

    public function setTeamDivisions(Request $request, string $id)
    {
        return $this->replaceRelation($request, 'team', $id, 'division_ids');
    }

    public function setTeamMembers(Request $request, string $id)
    {
        return $this->replaceRelation($request, 'team', $id, 'member_ids');
    }

    private function replaceRelation(Request $request, string $ownerType, string $ownerId, string $field)
    {
        if (!$this->canManage($request)) return $this->fail($request, 'FORBIDDEN', 'admin or manager role required', 403);
        $rules = [$field => ($field === 'division_ids' ? 'required|array|min:1|max:100' : 'required|array|max:100'), $field.'.*' => 'uuid'];
        $ids = array_values(array_unique($request->validate($rules)[$field]));
        $tenant = $this->tenant($request);
        $ownerTable = $ownerType === 'division' ? 'divisions' : 'teams';
        if (!DB::table($ownerTable)->where('tenant_id', $tenant)->where('id', $ownerId)->exists()) return $this->fail($request, 'NOT_FOUND', $ownerType.' not found', 404);
        $targetTable = $field === 'division_ids' ? 'divisions' : 'users';
        if (DB::table($targetTable)->where('tenant_id', $tenant)->whereIn('id', $ids)->count() !== count($ids)) return $this->fail($request, 'NOT_FOUND', 'one or more related records were not found', 404, $field);

        return DB::transaction(function () use ($request, $ownerType, $ownerId, $field, $ids, $tenant) {
            if ($ownerType === 'division') {
                $before = DB::table('division_members')->where('tenant_id', $tenant)->where('division_id', $ownerId)->pluck('user_id')->all();
                DB::table('division_members')->where('tenant_id', $tenant)->where('division_id', $ownerId)->delete();
                foreach ($ids as $userId) DB::table('division_members')->insert(['id' => (string) Str::uuid(), 'tenant_id' => $tenant, 'division_id' => $ownerId, 'user_id' => $userId, 'created_at' => now(), 'updated_at' => now()]);
            } elseif ($field === 'division_ids') {
                $before = DB::table('team_divisions')->where('tenant_id', $tenant)->where('team_id', $ownerId)->pluck('division_id')->all();
                DB::table('team_divisions')->where('tenant_id', $tenant)->where('team_id', $ownerId)->delete();
                foreach ($ids as $divisionId) DB::table('team_divisions')->insert(['id' => (string) Str::uuid(), 'tenant_id' => $tenant, 'team_id' => $ownerId, 'division_id' => $divisionId, 'created_at' => now(), 'updated_at' => now()]);
                DB::table('teams')->where('tenant_id', $tenant)->where('id', $ownerId)->update(['division_id' => $ids[0], 'updated_at' => now()]);
            } else {
                $before = DB::table('users')->where('tenant_id', $tenant)->where('team_id', $ownerId)->pluck('id')->all();
                DB::table('users')->where('tenant_id', $tenant)->where('team_id', $ownerId)->whereNotIn('id', $ids ?: ['00000000-0000-0000-0000-000000000000'])->update(['team_id' => null, 'updated_at' => now()]);
                if ($ids) DB::table('users')->where('tenant_id', $tenant)->whereIn('id', $ids)->update(['team_id' => $ownerId, 'updated_at' => now()]);
            }
            $this->audit($request, 'replace_'.$field, $ownerType, $ownerId, ['before_ids' => $before, $field => $ids]);
            return $this->ok($request, ['id' => $ownerId, $field => $ids]);
        });
    }
}
