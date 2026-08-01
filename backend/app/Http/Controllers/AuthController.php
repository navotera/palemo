<?php

namespace App\Http\Controllers;

use App\Support\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

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
    public function logout(Request $request) { return $this->ok($request, ['signed_out'=>true])->withoutCookie('npms_session'); }

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
