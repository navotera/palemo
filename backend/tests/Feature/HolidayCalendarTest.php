<?php

namespace Tests\Feature;

use App\Http\Controllers\ExecutionController;
use App\Http\Controllers\WorkspaceController;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

class HolidayCalendarTest extends TestCase
{
    use DatabaseTransactions;

    public function test_holidays_use_tenant_country_and_holiday_task_dates_are_rejected(): void
    {
        Cache::flush();
        Http::fake(['date.nager.at/*' => Http::response([[
            'date' => '2026-08-17',
            'localName' => 'Hari Kemerdekaan',
            'name' => 'Independence Day',
        ]])]);

        [$tenant, $user, $project] = $this->fixture();
        $request = $this->request($user, '/api/v1/calendar/holidays', 'GET', ['year' => 2026]);
        $response = $this->createTestResponse(app(WorkspaceController::class)->holidays($request, app(\App\Services\HolidayCalendar::class)));
        $response->assertOk()
            ->assertJsonPath('data.country_code', 'ID')
            ->assertJsonPath('data.items.0.date', '2026-08-17');

        $create = $this->request($user, '/api/v1/tasks', 'POST', [
            'project_id' => $project,
            'title' => 'Holiday activity',
            'due_date' => '2026-08-17T23:59:59Z',
        ]);
        $create->headers->set('Idempotency-Key', (string) Str::uuid());
        $blocked = $this->createTestResponse(app(ExecutionController::class)->createTask($create));
        $blocked->assertStatus(422)->assertJsonPath('errors.0.field', 'due_date');
        $this->assertDatabaseMissing('tasks', ['project_id' => $project, 'title' => 'Holiday activity']);
    }

    private function request(string $user, string $uri, string $method, array $data): Request
    {
        $request = Request::create($uri, $method, $data);
        $request->attributes->set('principal', DB::table('users')->where('id', $user)->first());
        $request->attributes->set('request_id', (string) Str::uuid());
        return $request;
    }

    private function fixture(): array
    {
        $tenant = (string) Str::uuid();
        DB::table('tenants')->insert(['id' => $tenant, 'name' => 'Holiday tenant', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('tenant_settings')->insert(['id' => (string) Str::uuid(), 'tenant_id' => $tenant, 'country_code' => 'ID', 'created_at' => now(), 'updated_at' => now()]);
        $division = (string) Str::uuid();
        DB::table('divisions')->insert(['id' => $division, 'tenant_id' => $tenant, 'name' => 'Delivery', 'created_at' => now(), 'updated_at' => now()]);
        $team = (string) Str::uuid();
        DB::table('teams')->insert(['id' => $team, 'tenant_id' => $tenant, 'division_id' => $division, 'name' => 'Team', 'created_at' => now(), 'updated_at' => now()]);
        $user = (string) Str::uuid();
        DB::table('users')->insert(['id' => $user, 'tenant_id' => $tenant, 'team_id' => $team, 'name' => 'Admin', 'email' => 'holiday.'.Str::lower(Str::random(8)).'@example.test', 'role' => 'admin', 'created_at' => now(), 'updated_at' => now()]);
        $project = (string) Str::uuid();
        DB::table('projects')->insert(['id' => $project, 'tenant_id' => $tenant, 'team_id' => $team, 'created_by' => $user, 'display_number' => 1, 'name' => 'Holiday project', 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);
        return [$tenant, $user, $project];
    }
}
