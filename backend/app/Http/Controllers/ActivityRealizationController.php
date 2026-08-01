<?php

namespace App\Http\Controllers;

use App\Support\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ActivityRealizationController extends Controller
{
    use ApiResponse;

    private function principal(Request $r): object { return $r->attributes->get('principal'); }
    private function tenant(Request $r): string { return $this->principal($r)->tenant_id; }
    private function task(Request $r, string $task): ?object
    {
        return DB::table('tasks as t')
            ->join('projects as p', function ($join) {
                $join->on('p.id', '=', 't.project_id')->on('p.tenant_id', '=', 't.tenant_id');
            })
            ->where('t.tenant_id', $this->tenant($r))
            ->where('t.id', $task)
            ->whereNull('t.deleted_at')
            ->select('t.id', 't.project_id', 'p.created_by', 'p.team_id')
            ->first();
    }
    private function canAccess(Request $r, object $task): bool
    {
        $actor=$this->principal($r);
        if(in_array($actor->role,['admin','manager'],true)||$task->created_by===$actor->id||$task->team_id===$actor->team_id)return true;
        return DB::table('project_people')->where('tenant_id',$this->tenant($r))->where('project_id',$task->project_id)->where('user_id',$actor->id)->exists();
    }
    private function audit(Request $r, string $action, string $id, mixed $after): void
    {
        DB::table('audit_events')->insert(['id'=>(string)Str::uuid(),'tenant_id'=>$this->tenant($r),'actor_id'=>$this->principal($r)->id,'actor_source'=>'user','action'=>$action,'entity_type'=>'activity_realization','entity_id'=>$id,'after_json'=>json_encode($after),'request_id'=>$r->attributes->get('request_id'),'created_at'=>now()]);
    }
    public function show(Request $r, string $task)
    {
        $taskRow=$this->task($r,$task);
        if (!$taskRow) return $this->fail($r,'NOT_FOUND','task not found',404);
        if (!$this->canAccess($r,$taskRow)) return $this->fail($r,'FORBIDDEN','project access required',403);
        $item=DB::table('activity_realizations')->where('tenant_id',$this->tenant($r))->where('task_id',$task)->first();
        return $this->ok($r,$item?(array)$item:['task_id'=>$task,'realized_date'=>null]);
    }
    public function update(Request $r, string $task)
    {
        $taskRow=$this->task($r,$task);
        if (!$taskRow) return $this->fail($r,'NOT_FOUND','task not found',404);
        if (!$this->canAccess($r,$taskRow)) return $this->fail($r,'FORBIDDEN','project access required',403);
        $data=$r->validate(['realized_date'=>'nullable|date']);
        $item=DB::transaction(function () use ($r,$task,$data) {
            $tenant=$this->tenant($r);
            $before=DB::table('activity_realizations')->where('tenant_id',$tenant)->where('task_id',$task)->lockForUpdate()->first();
            $id=(string)($before->id??Str::uuid());
            DB::table('activity_realizations')->updateOrInsert(['tenant_id'=>$tenant,'task_id'=>$task],['id'=>$id,'realized_date'=>$data['realized_date']??null,'updated_at'=>now(),'created_at'=>DB::raw('COALESCE(created_at, now())')]);
            $after=(array)DB::table('activity_realizations')->where('tenant_id',$tenant)->where('task_id',$task)->first();
            DB::table('audit_events')->insert(['id'=>(string)Str::uuid(),'tenant_id'=>$tenant,'actor_id'=>$this->principal($r)->id,'actor_source'=>'user','action'=>$before?'update':'create','entity_type'=>'activity_realization','entity_id'=>$id,'before_json'=>$before?json_encode((array)$before):null,'after_json'=>json_encode($after),'request_id'=>$r->attributes->get('request_id'),'created_at'=>now()]);
            return $after;
        });
        return $this->ok($r,$item);
    }
}
