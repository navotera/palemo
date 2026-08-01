<?php

namespace Tests\Feature;

use App\Http\Controllers\OrganizationController;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class OrganizationMembershipTest extends TestCase
{
    use DatabaseTransactions;

    public function test_division_members_are_independent_from_team_members_and_audited(): void
    {
        [$tenant, $admin, $divisionA, $divisionB, $team, $member] = $this->fixture('primary');
        $request = $this->request($admin, "/api/v1/divisions/{$divisionB}/members", 'PUT', ['member_ids' => [$member]]);

        $response = $this->createTestResponse(app(OrganizationController::class)->setDivisionMembers($request, $divisionB));

        $response->assertOk()->assertJsonPath('data.member_ids.0', $member);
        $this->assertDatabaseHas('division_members', ['tenant_id' => $tenant, 'division_id' => $divisionB, 'user_id' => $member]);
        $this->assertDatabaseHas('users', ['id' => $member, 'team_id' => $team]);
        $this->assertDatabaseHas('audit_events', ['tenant_id' => $tenant, 'entity_type' => 'division', 'entity_id' => $divisionB, 'action' => 'replace_member_ids']);

        $list = $this->createTestResponse(app(OrganizationController::class)->divisions($this->request($admin, '/api/v1/divisions', 'GET')));
        $division = collect($list->json('data'))->firstWhere('id', $divisionB);
        $this->assertSame([$member], $division['member_ids']);
        $this->assertNotContains($member, collect($list->json('data'))->firstWhere('id', $divisionA)['member_ids']);
    }

    public function test_team_can_link_multiple_divisions_without_duplicate_team_rows(): void
    {
        [$tenant, $admin, $divisionA, $divisionB, $team] = $this->fixture('multi');
        $request = $this->request($admin, "/api/v1/teams/{$team}/divisions", 'PUT', ['division_ids' => [$divisionA, $divisionB, $divisionA]]);

        $response = $this->createTestResponse(app(OrganizationController::class)->setTeamDivisions($request, $team));

        $response->assertOk();
        $this->assertCount(2, $response->json('data.division_ids'));
        $this->assertSame(2, DB::table('team_divisions')->where('tenant_id', $tenant)->where('team_id', $team)->count());
        $this->assertSame(1, DB::table('teams')->where('tenant_id', $tenant)->where('id', $team)->count());
    }

    public function test_cross_tenant_relationship_ids_return_not_found_and_do_not_mutate(): void
    {
        [, $admin, $divisionA, , $team] = $this->fixture('owner');
        [, , $foreignDivision] = $this->fixture('foreign');
        $before = DB::table('team_divisions')->where('team_id', $team)->pluck('division_id')->all();

        $request = $this->request($admin, "/api/v1/teams/{$team}/divisions", 'PUT', ['division_ids' => [$divisionA, $foreignDivision]]);
        $response = $this->createTestResponse(app(OrganizationController::class)->setTeamDivisions($request, $team));

        $response->assertNotFound();
        $this->assertSame($before, DB::table('team_divisions')->where('team_id', $team)->pluck('division_id')->all());
    }

    private function request(string $userId, string $uri, string $method, array $data = []): Request
    {
        $request = Request::create($uri, $method, $data);
        $request->attributes->set('principal', DB::table('users')->where('id', $userId)->first());
        $request->attributes->set('request_id', (string) Str::uuid());
        return $request;
    }

    private function fixture(string $suffix): array
    {
        $tenant = (string) Str::uuid();
        DB::table('tenants')->insert(['id' => $tenant, 'name' => 'Organization '.$suffix, 'created_at' => now(), 'updated_at' => now()]);
        $divisionA = (string) Str::uuid();
        $divisionB = (string) Str::uuid();
        foreach ([[$divisionA, 'Division A'], [$divisionB, 'Division B']] as [$id, $name]) DB::table('divisions')->insert(['id' => $id, 'tenant_id' => $tenant, 'name' => $name.' '.$suffix, 'created_at' => now(), 'updated_at' => now()]);
        $team = (string) Str::uuid();
        DB::table('teams')->insert(['id' => $team, 'tenant_id' => $tenant, 'division_id' => $divisionA, 'name' => 'Team '.$suffix, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('team_divisions')->insert(['id' => (string) Str::uuid(), 'tenant_id' => $tenant, 'team_id' => $team, 'division_id' => $divisionA, 'created_at' => now(), 'updated_at' => now()]);
        $admin = (string) Str::uuid();
        $member = (string) Str::uuid();
        DB::table('users')->insert([
            ['id' => $admin, 'tenant_id' => $tenant, 'team_id' => $team, 'name' => 'Admin '.$suffix, 'email' => 'admin.'.$suffix.'@example.test', 'role' => 'admin', 'created_at' => now(), 'updated_at' => now()],
            ['id' => $member, 'tenant_id' => $tenant, 'team_id' => $team, 'name' => 'Member '.$suffix, 'email' => 'member.'.$suffix.'@example.test', 'role' => 'staff', 'created_at' => now(), 'updated_at' => now()],
        ]);
        return [$tenant, $admin, $divisionA, $divisionB, $team, $member];
    }
}
