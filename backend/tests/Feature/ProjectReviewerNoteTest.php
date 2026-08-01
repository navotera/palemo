<?php

namespace Tests\Feature;

use App\Http\Controllers\ExecutionController;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class ProjectReviewerNoteTest extends TestCase
{
    use DatabaseTransactions;

    public function test_only_an_existing_project_reviewer_can_update_reviewer_note(): void
    {
        $tenant = (string) Str::uuid();
        DB::table('tenants')->insert(['id'=>$tenant,'name'=>'Reviewer note test','created_at'=>now(),'updated_at'=>now()]);
        $division = (string) Str::uuid();
        DB::table('divisions')->insert(['id'=>$division,'tenant_id'=>$tenant,'name'=>'Delivery','created_at'=>now(),'updated_at'=>now()]);
        $team = (string) Str::uuid();
        DB::table('teams')->insert(['id'=>$team,'tenant_id'=>$tenant,'division_id'=>$division,'name'=>'Delivery Team','created_at'=>now(),'updated_at'=>now()]);
        $owner = $this->user($tenant,$team,'owner');
        $reviewer = $this->user($tenant,$team,'reviewer');
        $project = (string) Str::uuid();
        DB::table('projects')->insert(['id'=>$project,'tenant_id'=>$tenant,'team_id'=>$team,'created_by'=>$owner,'display_number'=>1,'name'=>'Reviewed project','status'=>'active','created_at'=>now(),'updated_at'=>now()]);
        DB::table('project_people')->insert(['id'=>(string)Str::uuid(),'tenant_id'=>$tenant,'project_id'=>$project,'user_id'=>$reviewer,'project_role'=>'reviewer','created_at'=>now()]);

        $forbidden = $this->update($owner,$project,'Owner cannot write this');
        $forbidden->assertForbidden()->assertJsonPath('errors.0.field','preliminary_reviewer_notes');
        $this->assertDatabaseHas('projects',['id'=>$project,'preliminary_reviewer_notes'=>'']);

        $allowed = $this->update($reviewer,$project,'Reviewer feedback');
        $allowed->assertOk()->assertJsonPath('data.preliminary_reviewer_notes','Reviewer feedback');
        $this->assertDatabaseHas('projects',['id'=>$project,'tenant_id'=>$tenant,'preliminary_reviewer_notes'=>'Reviewer feedback']);
        $this->assertDatabaseHas('audit_events',['tenant_id'=>$tenant,'actor_id'=>$reviewer,'entity_type'=>'project','entity_id'=>$project,'action'=>'update']);
    }

    private function update(string $actor,string $project,string $note)
    {
        $request=Request::create('/api/v1/projects/'.$project,'PATCH',['preliminary_reviewer_notes'=>$note]);
        $request->attributes->set('principal',DB::table('users')->where('id',$actor)->first());
        $request->attributes->set('request_id',(string)Str::uuid());
        return $this->createTestResponse(app(ExecutionController::class)->updateProject($request,$project));
    }

    private function user(string $tenant,string $team,string $suffix):string
    {
        $id=(string)Str::uuid();
        DB::table('users')->insert(['id'=>$id,'tenant_id'=>$tenant,'team_id'=>$team,'name'=>'User '.$suffix,'email'=>$suffix.'.'.Str::lower(Str::random(8)).'@example.test','role'=>'staff','created_at'=>now(),'updated_at'=>now()]);
        return $id;
    }
}
