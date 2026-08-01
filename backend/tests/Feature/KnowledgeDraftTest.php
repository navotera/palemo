<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use App\Http\Controllers\PlatformController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class KnowledgeDraftTest extends TestCase
{
    use DatabaseTransactions;

    public function test_your_drafts_returns_only_the_authenticated_authors_tenant_scoped_drafts(): void
    {
        [$tenantA, $owner, $workspaceA] = $this->principalFixture('owner');
        [, $colleague] = $this->userFixture($tenantA, 'colleague');
        [$tenantB, $otherTenantUser, $workspaceB] = $this->principalFixture('other-tenant');

        $ownedDraft = $this->wiki($tenantA, $workspaceA, $owner, 'Owned draft', 'draft');
        $this->wiki($tenantA, $workspaceA, $colleague, 'Colleague draft', 'draft');
        $this->wiki($tenantB, $workspaceB, $otherTenantUser, 'Other tenant draft', 'draft');
        $this->wiki($tenantA, $workspaceA, $owner, 'Owned published', 'published');

        $response = $this->controllerResponse($owner, 'GET', [], fn (PlatformController $controller, Request $request) => $controller->knowledgeDrafts($request));

        $response->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $ownedDraft);
    }

    public function test_normal_knowledge_category_excludes_drafts(): void
    {
        [$tenant, $owner, $workspace] = $this->principalFixture('list-owner');
        $this->wiki($tenant, $workspace, $owner, 'Hidden draft', 'draft');
        $published = $this->wiki($tenant, $workspace, $owner, 'Visible published', 'published');

        $response = $this->controllerResponse($owner, 'GET', [], fn (PlatformController $controller, Request $request) => $controller->knowledge($request, 'wiki'));

        $response->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $published);
    }

    public function test_author_can_publish_a_complete_draft_and_the_transition_is_audited(): void
    {
        [$tenant, $owner, $workspace] = $this->principalFixture('publisher');
        $draft = $this->wiki($tenant, $workspace, $owner, 'Ready draft', 'draft');

        $response = $this->controllerResponse($owner, 'PATCH', ['publication_status' => 'published'], fn (PlatformController $controller, Request $request) => $controller->updateKnowledge($request, 'wiki', $draft));

        $response->assertOk()->assertJsonPath('data.publication_status', 'published');
        $this->assertDatabaseHas('wiki_pages', ['id' => $draft, 'tenant_id' => $tenant, 'publication_status' => 'published']);
        $this->assertDatabaseHas('audit_events', ['entity_id' => $draft, 'tenant_id' => $tenant, 'actor_id' => $owner, 'action' => 'publish']);
    }

    public function test_even_an_admin_cannot_read_or_update_another_users_draft(): void
    {
        [$tenant, $owner, $workspace] = $this->principalFixture('private-owner');
        [, $otherAdmin] = $this->userFixture($tenant, 'other-admin');
        $draft = $this->wiki($tenant, $workspace, $owner, 'Private draft', 'draft');

        $response = $this->controllerResponse($otherAdmin, 'PATCH', ['content' => 'Guessed update'], fn (PlatformController $controller, Request $request) => $controller->updateKnowledge($request, 'wiki', $draft));

        $response->assertNotFound();
        $this->assertDatabaseMissing('wiki_pages', ['id' => $draft, 'content' => 'Guessed update']);
    }

    public function test_author_can_save_an_https_cover_and_unsafe_cover_schemes_are_rejected(): void
    {
        [$tenant, $owner, $workspace] = $this->principalFixture('cover-owner');
        $draft = $this->wiki($tenant, $workspace, $owner, 'Cover draft', 'draft');

        $valid = $this->controllerResponse($owner, 'PATCH', [
            'cover_source' => 'url', 'cover_url' => 'https://images.example.test/cover.webp',
        ], fn (PlatformController $controller, Request $request) => $controller->updateKnowledge($request, 'wiki', $draft));
        $valid->assertOk()->assertJsonPath('data.cover_source', 'url')->assertJsonPath('data.cover_url', 'https://images.example.test/cover.webp');
        $this->assertDatabaseHas('wiki_pages', ['id' => $draft, 'tenant_id' => $tenant, 'cover_source' => 'url', 'cover_url' => 'https://images.example.test/cover.webp']);

        $unsafe = $this->controllerResponse($owner, 'PATCH', [
            'cover_source' => 'url', 'cover_url' => 'javascript:alert(1)',
        ], fn (PlatformController $controller, Request $request) => $controller->updateKnowledge($request, 'wiki', $draft));
        $unsafe->assertStatus(422)->assertJsonPath('errors.0.field', 'cover_url');
    }

    private function controllerResponse(string $userID, string $method, array $body, callable $action)
    {
        $request = Request::create('/api/v1/knowledge', $method, $body);
        $request->attributes->set('principal', DB::table('users')->where('id', $userID)->first());
        $request->attributes->set('request_id', (string) Str::uuid());
        return $this->createTestResponse($action(app(PlatformController::class), $request));
    }

    private function principalFixture(string $suffix): array
    {
        $tenant = (string) Str::uuid();
        DB::table('tenants')->insert(['id' => $tenant, 'name' => 'Draft test '.$suffix, 'created_at' => now(), 'updated_at' => now()]);
        [, $user] = $this->userFixture($tenant, $suffix);
        $workspace = (string) Str::uuid();
        DB::table('knowledge_workspaces')->insert(['id' => $workspace, 'tenant_id' => $tenant, 'name' => 'Knowledge '.$suffix, 'created_at' => now(), 'updated_at' => now()]);
        return [$tenant, $user, $workspace];
    }

    private function userFixture(string $tenant, string $suffix): array
    {
        $user = (string) Str::uuid();
        DB::table('users')->insert([
            'id' => $user, 'tenant_id' => $tenant, 'name' => 'User '.$suffix,
            'email' => $suffix.'.'.Str::lower(Str::random(8)).'@example.test', 'role' => 'admin',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        return [$tenant, $user];
    }

    private function wiki(string $tenant, string $workspace, string $author, string $title, string $status): string
    {
        $id = (string) Str::uuid();
        DB::table('wiki_pages')->insert([
            'id' => $id, 'tenant_id' => $tenant, 'workspace_id' => $workspace,
            'title' => $title, 'content' => 'Complete draft content', 'author_id' => $author,
            'knowledge_types' => '{"wiki"}',
            'publication_status' => $status, 'published_at' => $status === 'published' ? now() : null,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        return $id;
    }
}
