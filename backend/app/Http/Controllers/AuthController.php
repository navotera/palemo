<?php

namespace App\Http\Controllers;

use App\Support\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Auth;
use App\Models\User;

class AuthController extends Controller
{
    use ApiResponse;

    public function developmentSession(Request $request)
    {
        $request->attributes->set('request_id', (string) \Illuminate\Support\Str::uuid());
        if (!app()->environment(['local', 'development', 'testing'])) {
            return $this->fail($request, 'FORBIDDEN', 'development session is disabled', 403);
        }
        $user = DB::table('users')->where('external_id', 'development-admin')->first();
        if (!$user) return $this->fail($request, 'NOT_FOUND', 'development admin is not initialized', 404);
        $payload = $this->userPayload($user);
        return $this->ok($request, ['user'=>$payload])->cookie('npms_session', Crypt::encryptString($user->id), 480, '/', null, false, true, false, 'Lax');
    }

    public function me(Request $request) { return $this->ok($request, $this->userPayload($request->attributes->get('principal'))); }
    public function updateProfileImage(Request $request)
    {
        $request->validate(['image'=>'required|file|max:2048']);
        $file=$request->file('image');$path=$file->getRealPath();$content=file_get_contents($path);$head=substr($content,0,16);
        $mime=str_starts_with($head,"\xFF\xD8\xFF")?'image/jpeg':(str_starts_with($head,"\x89PNG\x0D\x0A\x1A\x0A")?'image/png':(strlen($head)>=12&&substr($head,0,4)==='RIFF'&&substr($head,8,4)==='WEBP'?'image/webp':null));
        if(!$mime)return $this->fail($request,'VALIDATION_ERROR','Profile image must be JPEG, PNG, or WebP',422,'image');
        $user=$request->attributes->get('principal');$size=strlen($content);$hadImage=!empty($user->profile_image_content_type);
        DB::transaction(function()use($request,$user,$content,$mime,$size,$hadImage){DB::statement("UPDATE users SET profile_image=decode(?, 'base64'), profile_image_content_type=?, profile_image_size_bytes=?, updated_at=now() WHERE tenant_id=? AND id=?",[base64_encode($content),$mime,$size,$user->tenant_id,$user->id]);DB::table('audit_events')->insert(['id'=>(string)Str::uuid(),'tenant_id'=>$user->tenant_id,'actor_id'=>$user->id,'actor_source'=>'user','action'=>'update_profile_image','entity_type'=>'user','entity_id'=>$user->id,'before_json'=>json_encode(['configured'=>$hadImage]),'after_json'=>json_encode(['configured'=>true,'content_type'=>$mime,'size_bytes'=>$size]),'request_id'=>$request->attributes->get('request_id'),'created_at'=>now()]);});
        $fresh=DB::table('users')->where('tenant_id',$user->tenant_id)->where('id',$user->id)->first();return $this->ok($request,$this->userPayload($fresh));
    }
    public function profileImage(Request $request,string $id)
    {
        $principal=$request->attributes->get('principal');$user=DB::table('users')->select('id','profile_image','profile_image_content_type')->where('tenant_id',$principal->tenant_id)->where('id',$id)->first();
        if(!$user||!$user->profile_image_content_type)return $this->fail($request,'NOT_FOUND','profile image not found',404);
        $content=is_resource($user->profile_image)?stream_get_contents($user->profile_image):$user->profile_image;return response($content,200,['Content-Type'=>$user->profile_image_content_type,'Cache-Control'=>'private, max-age=300','X-Content-Type-Options'=>'nosniff','Content-Disposition'=>'inline']);
    }
    public function logout(Request $request) {
        if (app('impersonate')->isImpersonating()) {
            app('impersonate')->leave();
        }
        Auth::guard('web')->logout();
        return $this->ok($request, ['signed_out'=>true])->withoutCookie('npms_session');
    }

    public function impersonationStatus(Request $request)
    {
        $principal = $request->attributes->get('principal');
        $manager = app('impersonate');
        return $this->ok($request, [
            'active' => $manager->isImpersonating(),
            'impersonator_id' => $manager->isImpersonating() ? (string) $manager->getImpersonatorId() : null,
            'user' => $this->userPayload($principal),
        ]);
    }

    public function startImpersonation(Request $request, string $id)
    {
        $key = trim((string) $request->header('Idempotency-Key'));
        $commandPath = 'auth/impersonation/'.$id;
        $actor = $request->attributes->get('principal');
        if ($key === '' || strlen($key) > 200) return $this->fail($request, 'VALIDATION_ERROR', 'A valid Idempotency-Key is required', 400, 'Idempotency-Key');
        if ($actor->role !== 'admin' || app('impersonate')->isImpersonating()) return $this->fail($request, 'FORBIDDEN', 'Only a tenant administrator can start impersonation', 403);
        $existing = DB::table('user_idempotency_keys')->where('tenant_id', $actor->tenant_id)->where('user_id', $actor->id)->where('key', $key)->where('expires_at', '>', now())->first();
        if ($existing) {
            if ($existing->command_path !== $commandPath) return $this->fail($request, 'CONFLICT', 'Idempotency-Key was already used for another command', 409, 'Idempotency-Key');
            return $this->ok($request, json_decode($existing->response_snapshot_json, true));
        }
        $target = DB::table('users')->where('tenant_id', $actor->tenant_id)->where('id', $id)->first();
        if (!$target) return $this->fail($request, 'NOT_FOUND', 'user not found', 404);
        if ($target->id === $actor->id || $target->role === 'admin') return $this->fail($request, 'FORBIDDEN', 'This user cannot be impersonated', 403);
        $from = User::query()->where('id', $actor->id)->firstOrFail();
        $to = User::query()->where('id', $target->id)->firstOrFail();
        Auth::guard('web')->login($from);
        if (!$from->impersonate($to)) return $this->fail($request, 'INTERNAL_ERROR', 'Unable to start impersonation', 500);
        $data = ['active'=>true, 'impersonator_id'=>(string) $actor->id, 'user'=>$this->userPayload($target)];
        DB::transaction(function () use ($request, $actor, $target, $key, $commandPath, $data) {
            DB::table('audit_events')->insert(['id'=>(string) Str::uuid(), 'tenant_id'=>$actor->tenant_id, 'actor_id'=>$actor->id, 'actor_source'=>'user', 'action'=>'impersonation_started', 'entity_type'=>'user', 'entity_id'=>$target->id, 'after_json'=>json_encode(['impersonator_id'=>$actor->id, 'target_id'=>$target->id]), 'request_id'=>$request->attributes->get('request_id'), 'created_at'=>now()]);
            DB::table('user_idempotency_keys')->insert(['id'=>(string) Str::uuid(), 'tenant_id'=>$actor->tenant_id, 'user_id'=>$actor->id, 'key'=>$key, 'command_path'=>$commandPath, 'request_hash'=>hash('sha256', $commandPath), 'response_status'=>200, 'response_snapshot_json'=>json_encode($data), 'created_at'=>now(), 'expires_at'=>now()->addDay()]);
        });
        return $this->ok($request, $data);
    }

    public function stopImpersonation(Request $request)
    {
        $manager = app('impersonate');
        if (!$manager->isImpersonating()) return $this->fail($request, 'CONFLICT', 'No active impersonation session', 409);
        $target = $request->attributes->get('principal');
        $actorId = (string) $manager->getImpersonatorId();
        $actor = DB::table('users')->where('tenant_id', $target->tenant_id)->where('id', $actorId)->first();
        if (!$actor || !$manager->leave()) return $this->fail($request, 'INTERNAL_ERROR', 'Unable to stop impersonation', 500);
        DB::table('audit_events')->insert(['id'=>(string) Str::uuid(), 'tenant_id'=>$actor->tenant_id, 'actor_id'=>$actor->id, 'actor_source'=>'user', 'action'=>'impersonation_stopped', 'entity_type'=>'user', 'entity_id'=>$target->id, 'before_json'=>json_encode(['impersonator_id'=>$actor->id, 'target_id'=>$target->id]), 'request_id'=>$request->attributes->get('request_id'), 'created_at'=>now()]);
        return $this->ok($request, ['active'=>false, 'user'=>$this->userPayload($actor)]);
    }

    private function userPayload(object $user): array
    {
        $tenant = DB::table('tenants')->where('id',$user->tenant_id)->value('name');
        $team = DB::table('teams')->select('name','division_id')->where('tenant_id',$user->tenant_id)->where('id',$user->team_id)->first();
        $divisionIDs = $user->role === 'admin' ? DB::table('divisions')->where('tenant_id',$user->tenant_id)->pluck('id')->all() : DB::table('division_leads')->where('tenant_id',$user->tenant_id)->where('user_id',$user->id)->pluck('division_id')->all();
        if ($team?->division_id) $divisionIDs[] = $team->division_id;
        $divisionIDs = array_values(array_unique($divisionIDs));
        return ['id'=>$user->id,'tenant_id'=>$user->tenant_id,'team_id'=>$user->team_id,'division_id'=>$team?->division_id,'division_ids'=>$divisionIDs,'name'=>$user->name,'email'=>$user->email,'role'=>$user->role,'tenant'=>$tenant,'team'=>$team?->name,'profile_image_url'=>!empty($user->profile_image_content_type)?'/api/v1/users/'.$user->id.'/profile-image?v='.strtotime((string)$user->updated_at):null];
    }
}
