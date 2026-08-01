<?php
namespace App\Http\Controllers;
use App\Support\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
class ProjectRealizationsController extends Controller
{
 use ApiResponse;
 public function index(Request $r,string $project){$principal=$r->attributes->get('principal');$tenant=$principal->tenant_id;$projectRow=DB::table('projects')->where('tenant_id',$tenant)->where('id',$project)->whereNull('deleted_at')->first();if(!$projectRow)return $this->fail($r,'NOT_FOUND','project not found',404);$canAccess=in_array($principal->role,['admin','manager'],true)||$projectRow->created_by===$principal->id||$projectRow->team_id===$principal->team_id||DB::table('project_people')->where('tenant_id',$tenant)->where('project_id',$project)->where('user_id',$principal->id)->exists();if(!$canAccess)return $this->fail($r,'FORBIDDEN','project access required',403);$items=DB::table('activity_realizations as ar')->join('tasks as t','t.id','=','ar.task_id')->select('ar.task_id','ar.realized_date')->where('ar.tenant_id',$tenant)->where('ar.task_id','!=',null)->where('t.tenant_id',$tenant)->where('t.project_id',$project)->whereNull('t.deleted_at')->get();return $this->ok($r,$items->map(fn($item)=>(array)$item)->all());}
}
