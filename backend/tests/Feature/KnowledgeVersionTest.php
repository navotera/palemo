<?php

namespace Tests\Feature;

use App\Http\Controllers\PlatformController;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class KnowledgeVersionTest extends TestCase
{
    use DatabaseTransactions;

    public function test_repeated_saves_preserve_one_immutable_automatic_snapshot_for_the_same_day(): void
    {
        [$tenant, $owner, $workspace] = $this->principalFixture('daily');
        $knowledge = $this->wiki($tenant, $workspace, $owner, 'Daily snapshot');

        $this->update($owner, $knowledge, ['content' => 'First save'])->assertOk();
        $second = $this->update($owner, $knowledge, ['content' => 'Second save']);

        $second->assertOk()->assertJsonCount(1, 'data.version_history');
        $this->assertSame(1, DB::table('knowledge_versions')
            ->where('tenant_id', $tenant)->where('knowledge_id', $knowledge)
            ->where('source', 'automatic')->count());
        $this->assertDatabaseHas('knowledge_versions', [
            'tenant_id' => $tenant,
            'knowledge_id' => $knowledge,
            'source' => 'automatic',
            'content' => 'Initial content',
        ]);
        $this->assertSame(2, DB::table('audit_events')
            ->where('tenant_id', $tenant)->where('entity_id', $knowledge)
            ->where('entity_type', 'knowledge')->where('action', 'update')->count());
    }

    public function test_large_deletion_preserves_a_deduplicated_temporary_recovery_snapshot(): void
    {
        [$tenant, $owner, $workspace] = $this->principalFixture('recovery');
        $knowledge = $this->wiki($tenant, $workspace, $owner, 'Recovery snapshot');
        $largeContent = str_repeat('A', 500);

        $this->update($owner, $knowledge, ['content' => $largeContent])->assertOk();
        $this->update($owner, $knowledge, ['content' => str_repeat('B', 100)])->assertOk();
        $this->update($owner, $knowledge, ['content' => $largeContent])->assertOk();
        $response = $this->update($owner, $knowledge, ['content' => str_repeat('C', 100)]);

        $response->assertOk()->assertJsonCount(2, 'data.version_history');
        $this->assertSame(1, DB::table('knowledge_versions')
            ->where('tenant_id', $tenant)->where('knowledge_id', $knowledge)
            ->where('source', 'recovery')->count());
        $recovery = DB::table('knowledge_versions')
            ->where('tenant_id', $tenant)->where('knowledge_id', $knowledge)
            ->where('source', 'recovery')->first();
        $this->assertSame($largeContent, $recovery->content);
        $this->assertNotNull($recovery->expires_at);
        $this->assertSame(hash('sha256', $largeContent), trim((string) $recovery->content_hash));
    }

    public function test_first_large_deletion_of_the_day_uses_the_daily_baseline_without_duplicate_recovery(): void
    {
        [$tenant, $owner, $workspace] = $this->principalFixture('first-destructive');
        $largeContent = str_repeat('D', 500);
        $knowledge = $this->wiki($tenant, $workspace, $owner, 'First destructive snapshot', $largeContent);

        $this->update($owner, $knowledge, ['content' => str_repeat('E', 100)])->assertOk();

        $this->assertDatabaseHas('knowledge_versions', [
            'tenant_id' => $tenant,
            'knowledge_id' => $knowledge,
            'source' => 'automatic',
            'content' => $largeContent,
        ]);
        $this->assertSame(0, DB::table('knowledge_versions')
            ->where('tenant_id', $tenant)->where('knowledge_id', $knowledge)
            ->where('source', 'recovery')->count());
    }

    public function test_new_version_creates_manual_snapshots_outside_the_daily_limit(): void
    {
        [$tenant, $owner, $workspace] = $this->principalFixture('manual');
        $knowledge = $this->wiki($tenant, $workspace, $owner, 'Manual snapshot');

        $this->update($owner, $knowledge, ['content' => 'Autosaved content'])->assertOk();
        $this->update($owner, $knowledge, ['content' => 'Manual one', 'create_version' => true])->assertOk();
        $response = $this->update($owner, $knowledge, ['content' => 'Manual two', 'create_version' => true]);

        $response->assertOk()->assertJsonCount(3, 'data.version_history');
        $this->assertSame(1, DB::table('knowledge_versions')
            ->where('tenant_id', $tenant)->where('knowledge_id', $knowledge)
            ->where('source', 'automatic')->count());
        $this->assertSame(2, DB::table('knowledge_versions')
            ->where('tenant_id', $tenant)->where('knowledge_id', $knowledge)
            ->where('source', 'manual')->count());
        $this->assertSame(2, DB::table('audit_events')
            ->where('tenant_id', $tenant)->where('entity_type', 'knowledge_version')
            ->where('action', 'create')->count());
    }

    public function test_version_removal_is_soft_deleted_and_audited(): void
    {
        [$tenant, $owner, $workspace] = $this->principalFixture('remove');
        $knowledge = $this->wiki($tenant, $workspace, $owner, 'Removable snapshot');
        $created = $this->update($owner, $knowledge, ['content' => 'Manual snapshot', 'create_version' => true]);
        $versionID = (string) $created->json('data.version_history.0.id');

        $removed = $this->controllerResponse($owner, 'DELETE', [], fn (PlatformController $controller, Request $request) => $controller->removeKnowledgeVersion($request, $versionID));

        $removed->assertOk()->assertJsonPath('data.removed', true);
        $this->assertNotNull(DB::table('knowledge_versions')->where('tenant_id', $tenant)->where('id', $versionID)->value('deleted_at'));
        $this->assertDatabaseHas('audit_events', [
            'tenant_id' => $tenant,
            'entity_type' => 'knowledge_version',
            'entity_id' => $versionID,
            'action' => 'remove',
        ]);
    }

    public function test_another_tenant_cannot_remove_a_knowledge_version(): void
    {
        [, $tenantAUser] = $this->principalFixture('tenant-a');
        [$tenantB, $tenantBUser, $workspaceB] = $this->principalFixture('tenant-b');
        $knowledgeB = $this->wiki($tenantB, $workspaceB, $tenantBUser, 'Tenant B snapshot');
        $created = $this->update($tenantBUser, $knowledgeB, ['content' => 'Private version', 'create_version' => true]);
        $versionID = (string) $created->json('data.version_history.0.id');

        $response = $this->controllerResponse($tenantAUser, 'DELETE', [], fn (PlatformController $controller, Request $request) => $controller->removeKnowledgeVersion($request, $versionID));

        $response->assertNotFound();
        $this->assertNull(DB::table('knowledge_versions')->where('tenant_id', $tenantB)->where('id', $versionID)->value('deleted_at'));
    }

    private function update(string $userID, string $knowledgeID, array $body)
    {
        return $this->controllerResponse($userID, 'PATCH', $body, fn (PlatformController $controller, Request $request) => $controller->updateKnowledge($request, 'wiki', $knowledgeID));
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
        DB::table('tenants')->insert(['id' => $tenant, 'name' => 'Version test '.$suffix, 'created_at' => now(), 'updated_at' => now()]);
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

    private function wiki(string $tenant, string $workspace, string $author, string $title, string $content = 'Initial content'): string
    {
        $id = (string) Str::uuid();
        DB::table('wiki_pages')->insert([
            'id' => $id, 'tenant_id' => $tenant, 'workspace_id' => $workspace,
            'title' => $title, 'content' => $content, 'author_id' => $author,
            'knowledge_types' => '{"wiki"}', 'publication_status' => 'draft',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        return $id;
    }
}
