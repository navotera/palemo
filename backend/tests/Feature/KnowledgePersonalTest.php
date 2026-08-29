<?php

namespace Tests\Feature;

use App\Http\Controllers\PlatformController;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class KnowledgePersonalTest extends TestCase
{
    use DatabaseTransactions;

    public function test_personal_scope_returns_only_owned_unshared_published_knowledge(): void
    {
        [$tenant, $owner, $workspace] = $this->principalFixture('personal');
        $personal = $this->wiki($tenant, $workspace, $owner, 'Personal page', []);
        $shared = $this->wiki($tenant, $workspace, $owner, 'Shared page', ['accessible_user_ids' => [$owner]]);
        $draft = $this->wiki($tenant, $workspace, $owner, 'Personal draft', [], 'draft');
        [, $otherTenantUser, $otherWorkspace] = $this->principalFixture('other');
        $otherTenantPersonal = $this->wiki($this->tenantOf($otherTenantUser), $otherWorkspace, $otherTenantUser, 'Other tenant page', []);

        $response = $this->controllerResponse($owner, 'GET', ['scope' => 'personal'], fn (PlatformController $controller, Request $request) => $controller->knowledge($request, 'wiki'));

        $response->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $personal);
        $this->assertNotSame($personal, $shared);
        $this->assertNotSame($personal, $draft);
        $this->assertNotSame($personal, $otherTenantPersonal);
    }

    private function controllerResponse(string $userID, string $method, array $query, callable $action)
    {
        $request = Request::create('/api/v1/knowledge/wiki', $method, $query);
        $request->attributes->set('principal', DB::table('users')->where('id', $userID)->first());
        $request->attributes->set('request_id', (string) Str::uuid());
        return $this->createTestResponse($action(app(PlatformController::class), $request));
    }

    private function principalFixture(string $suffix): array
    {
        $tenant = (string) Str::uuid();
        DB::table('tenants')->insert(['id' => $tenant, 'name' => 'Personal test '.$suffix, 'created_at' => now(), 'updated_at' => now()]);
        $user = (string) Str::uuid();
        DB::table('users')->insert([
            'id' => $user, 'tenant_id' => $tenant, 'name' => 'User '.$suffix,
            'email' => $suffix.'.'.Str::lower(Str::random(8)).'@example.test', 'role' => 'admin',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $workspace = (string) Str::uuid();
        DB::table('knowledge_workspaces')->insert([
            'id' => $workspace, 'tenant_id' => $tenant, 'name' => 'Knowledge '.$suffix,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        return [$tenant, $user, $workspace];
    }

    private function tenantOf(string $userID): string
    {
        return (string) DB::table('users')->where('id', $userID)->value('tenant_id');
    }

    private function wiki(string $tenant, string $workspace, string $author, string $title, array $sharing, string $status = 'published'): string
    {
        $id = (string) Str::uuid();
        DB::table('wiki_pages')->insert([
            'id' => $id, 'tenant_id' => $tenant, 'workspace_id' => $workspace,
            'title' => $title, 'content' => 'Personal content', 'author_id' => $author,
            'knowledge_types' => '{"wiki"}', 'publication_status' => $status,
            'accessible_division_ids' => '{}', 'accessible_team_ids' => '{}',
            'accessible_user_ids' => $this->pg($sharing['accessible_user_ids'] ?? []),
            'created_at' => now(), 'updated_at' => now(),
        ]);
        return $id;
    }

    private function pg(array $values): string
    {
        return '{'.implode(',', array_map(fn ($value) => '"'.$value.'"', $values)).'}';
    }
}
