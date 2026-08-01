<?php

namespace Tests\Feature;

use App\Http\Controllers\ExecutionController;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class PreliminaryKnowledgeSearchTest extends TestCase
{
    use DatabaseTransactions;

    public function test_search_is_bounded_and_never_returns_another_tenants_knowledge(): void
    {
        [$tenantA, $userA, $workspaceA, $typeA] = $this->fixture('alpha');
        [$tenantB, $userB, $workspaceB, $typeB] = $this->fixture('beta');
        $visible = $this->wiki($tenantA, $workspaceA, $userA, $typeA, 'Launch checklist', 'published');
        $this->wiki($tenantA, $workspaceA, $userA, $typeA, 'Private launch draft', 'draft');
        $this->wiki($tenantB, $workspaceB, $userB, $typeB, 'Launch checklist other tenant', 'published');

        $request = Request::create('/api/v1/preliminary-note-templates', 'GET', [
            'q' => 'Launch', 'source' => 'knowledge', 'limit' => 20,
        ]);
        $request->attributes->set('principal', DB::table('users')->where('id', $userA)->first());
        $request->attributes->set('request_id', (string) Str::uuid());

        $response = $this->createTestResponse(app(ExecutionController::class)->noteTemplates($request));

        $response->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', 'knowledge:'.$visible)
            ->assertJsonPath('data.0.name', 'Launch checklist');
    }

    public function test_regular_user_sees_only_global_and_authorized_division_sources_while_admin_sees_all(): void
    {
        [$tenant, $user, $workspace, $type] = $this->fixture('division-access');
        $divisionA = $this->division($tenant, 'Operations');
        $divisionB = $this->division($tenant, 'Finance');
        $team = (string) Str::uuid();
        DB::table('teams')->insert(['id' => $team, 'tenant_id' => $tenant, 'division_id' => $divisionA, 'name' => 'Operations Team', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('users')->where('id', $user)->update(['team_id' => $team, 'role' => 'staff']);
        $global = $this->wiki($tenant, $workspace, $user, $type, 'Global source', 'published');
        $allowed = $this->wiki($tenant, $workspace, $user, $type, 'Operations source', 'published', [$divisionA]);
        $restricted = $this->wiki($tenant, $workspace, $user, $type, 'Finance source', 'published', [$divisionB]);

        $staffResponse = $this->searchResponse($user);
        $staffResponse->assertOk()->assertJsonCount(2, 'data');
        $staffIDs = collect($staffResponse->json('data'))->pluck('id')->all();
        $this->assertContains('knowledge:'.$global, $staffIDs);
        $this->assertContains('knowledge:'.$allowed, $staffIDs);
        $this->assertNotContains('knowledge:'.$restricted, $staffIDs);

        DB::table('users')->where('id', $user)->update(['role' => 'admin']);
        $adminResponse = $this->searchResponse($user);
        $adminResponse->assertOk()->assertJsonCount(3, 'data');
    }

    private function fixture(string $suffix): array
    {
        $tenant = (string) Str::uuid();
        DB::table('tenants')->insert(['id' => $tenant, 'name' => 'Search '.$suffix, 'created_at' => now(), 'updated_at' => now()]);
        $user = (string) Str::uuid();
        DB::table('users')->insert(['id' => $user, 'tenant_id' => $tenant, 'name' => 'User '.$suffix, 'email' => $suffix.'.'.Str::lower(Str::random(8)).'@example.test', 'role' => 'admin', 'created_at' => now(), 'updated_at' => now()]);
        $workspace = (string) Str::uuid();
        DB::table('knowledge_workspaces')->insert(['id' => $workspace, 'tenant_id' => $tenant, 'name' => 'Knowledge '.$suffix, 'created_at' => now(), 'updated_at' => now()]);
        $type = (string) Str::uuid();
        DB::table('knowledge_types')->insert(['id' => $type, 'tenant_id' => $tenant, 'slug' => 'project_preliminary_notes', 'label' => 'Project Preliminary Notes', 'is_system' => true, 'created_at' => now(), 'updated_at' => now()]);
        return [$tenant, $user, $workspace, $type];
    }

    private function searchResponse(string $user)
    {
        $request = Request::create('/api/v1/preliminary-note-templates', 'GET', ['source' => 'knowledge', 'limit' => 20]);
        $request->attributes->set('principal', DB::table('users')->where('id', $user)->first());
        $request->attributes->set('request_id', (string) Str::uuid());
        return $this->createTestResponse(app(ExecutionController::class)->noteTemplates($request));
    }

    private function division(string $tenant, string $name): string
    {
        $id = (string) Str::uuid();
        DB::table('divisions')->insert(['id' => $id, 'tenant_id' => $tenant, 'name' => $name, 'created_at' => now(), 'updated_at' => now()]);
        return $id;
    }

    private function wiki(string $tenant, string $workspace, string $author, string $type, string $title, string $status, array $divisionIDs = []): string
    {
        $id = (string) Str::uuid();
        $divisions = '{'.implode(',', array_map(fn ($division) => '"'.$division.'"', $divisionIDs)).'}';
        DB::table('wiki_pages')->insert(['id' => $id, 'tenant_id' => $tenant, 'workspace_id' => $workspace, 'title' => $title, 'content' => '# '.$title, 'author_id' => $author, 'knowledge_type_id' => $type, 'knowledge_types' => '{project_preliminary_notes}', 'accessible_division_ids' => $divisions, 'knowledge_source_mode' => 'internal', 'publication_status' => $status, 'published_at' => $status === 'published' ? now() : null, 'created_at' => now(), 'updated_at' => now()]);
        return $id;
    }
}
