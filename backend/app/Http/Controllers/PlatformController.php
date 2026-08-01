<?php

namespace App\Http\Controllers;

use App\Support\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class PlatformController extends Controller
{
    use ApiResponse;
    private function u(Request $r):object{return $r->attributes->get('principal');}private function t(Request $r):string{return $this->u($r)->tenant_id;}
    private function rows($q):array{return $q->get()->map(fn($x)=>(array)$x)->all();}private function pg(array $v):string{return '{'.implode(',',array_map(fn($x)=>'"'.str_replace('"','\"',$x).'"',$v)).'}';}
    private function table(string $kind):?string{return ['wiki'=>'wiki_pages','meetings'=>'meeting_notes','decisions'=>'decision_logs','lessons'=>'lessons_learned'][$kind]??null;}
    private function validKnowledgeCover(?string $source, ?string $url, string $tenant):bool
    {
        if ($source === null && $url === null) return true;
        if (!$source || !$url || strlen($url) > 2048) return false;
        if ($source === 'upload') {
            if (preg_match('#^/api/v1/knowledge/media/([0-9a-f-]{36})$#i', $url, $matches) !== 1) return false;
            foreach (['jpg', 'png', 'webp'] as $extension) if (Storage::disk('local')->exists('knowledge-media/'.$tenant.'/'.$matches[1].'.'.$extension)) return true;
            return false;
        }
        if ($source !== 'url' || !filter_var($url, FILTER_VALIDATE_URL)) return false;
        return in_array(strtolower((string) parse_url($url, PHP_URL_SCHEME)), ['http', 'https'], true);
    }
    public function uploadKnowledgeMedia(Request $r)
    {
        $key = trim((string) $r->header('Idempotency-Key'));
        if ($key === '' || strlen($key) > 128) return $this->fail($r, 'VALIDATION_ERROR', 'Idempotency-Key is required', 400, 'Idempotency-Key');
        $d = $r->validate(['image' => 'required|file|image|mimes:jpeg,jpg,png,webp|max:5120|dimensions:max_width=6000,max_height=6000']);
        $file = $d['image'];
        $hash = hash_file('sha256', $file->getRealPath());
        $cacheKey = 'knowledge-media:'.$this->t($r).':'.$this->u($r)->id.':'.hash('sha256', $key);
        $cached = Cache::get($cacheKey);
        if ($cached) {
            if (($cached['hash'] ?? null) !== $hash) return $this->fail($r, 'CONFLICT', 'Idempotency-Key was already used for different content', 409, 'Idempotency-Key');
            return $this->ok($r, $cached['data']);
        }
        $id = (string) Str::uuid();
        $extension = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'][$file->getMimeType()] ?? null;
        if (!$extension) return $this->fail($r, 'VALIDATION_ERROR', 'Only JPEG, PNG, and WebP images are allowed', 422, 'image');
        $path = 'knowledge-media/'.$this->t($r).'/'.$id.'.'.$extension;
        Storage::disk('local')->putFileAs(dirname($path), $file, basename($path));
        try {
            DB::table('audit_events')->insert([
                'id' => (string) Str::uuid(), 'tenant_id' => $this->t($r), 'actor_id' => $this->u($r)->id,
                'actor_source' => 'user', 'action' => 'upload', 'entity_type' => 'knowledge_media', 'entity_id' => $id,
                'after_json' => json_encode(['content_type' => $file->getMimeType(), 'size_bytes' => $file->getSize()]),
                'request_id' => $r->attributes->get('request_id'), 'created_at' => now(),
            ]);
        } catch (\Throwable $error) {
            Storage::disk('local')->delete($path);
            throw $error;
        }
        $data = ['id' => $id, 'url' => '/api/v1/knowledge/media/'.$id, 'content_type' => $file->getMimeType(), 'size_bytes' => $file->getSize()];
        Cache::put($cacheKey, ['hash' => $hash, 'data' => $data], now()->addDay());
        return $this->ok($r, $data, 201);
    }
    public function knowledgeMedia(Request $r, string $id)
    {
        if (!Str::isUuid($id)) return $this->fail($r, 'NOT_FOUND', 'knowledge media not found', 404);
        foreach (['jpg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'] as $extension => $contentType) {
            $path = 'knowledge-media/'.$this->t($r).'/'.$id.'.'.$extension;
            if (Storage::disk('local')->exists($path)) {
                return Storage::disk('local')->response($path, null, ['Content-Type' => $contentType, 'Cache-Control' => 'private, max-age=86400', 'X-Content-Type-Options' => 'nosniff']);
            }
        }
        return $this->fail($r, 'NOT_FOUND', 'knowledge media not found', 404);
    }
    public function workspaces(Request $r){return $this->ok($r,$this->rows(DB::table('knowledge_workspaces')->where('tenant_id',$this->t($r))->whereNull('deleted_at')->orderBy('name')));}
    public function createWorkspace(Request $r){$d=$r->validate(['name'=>'required','description'=>'nullable|string']);$id=(string)Str::uuid();DB::table('knowledge_workspaces')->insert(['id'=>$id,'tenant_id'=>$this->t($r),'name'=>$d['name'],'description'=>$d['description']??null,'created_at'=>now(),'updated_at'=>now()]);return $this->ok($r,(array)DB::table('knowledge_workspaces')->where('id',$id)->first(),201);}
    public function knowledgeDrafts(Request $r)
    {
        $tenant = $this->t($r);
        $author = $this->u($r)->id;
        $items = collect();
        foreach (['wiki' => 'wiki_pages', 'meetings' => 'meeting_notes', 'decisions' => 'decision_logs', 'lessons' => 'lessons_learned'] as $kind => $table) {
            $rows = DB::table($table.' as k')
                ->leftJoin('users as u', function ($join) {
                    $join->on('u.tenant_id', '=', 'k.tenant_id')->on('u.id', '=', 'k.author_id');
                })
                ->select('k.*', 'u.name as author_name')
                ->where('k.tenant_id', $tenant)
                ->where('k.author_id', $author)
                ->where('k.publication_status', 'draft')
                ->whereNull('k.deleted_at')
                ->orderByDesc('k.updated_at')
                ->limit(50)
                ->get()
                ->map(function ($item) use ($kind, $table) {
                    $row = (array) $item;
                    if ($table === 'wiki_pages' && !empty($row['knowledge_types'])) {
                        $types = str_getcsv(trim((string) $row['knowledge_types'], '{}'));
                        $row['kind'] = trim((string) ($types[0] ?? $kind), '"') ?: $kind;
                    } else $row['kind'] = $kind;
                    if ($table === 'lessons_learned') $row['related_project_id'] = $row['project_id'] ?? null;
                    return $row;
                });
            $items = $items->concat($rows);
        }
        return $this->ok($r, $items->sortByDesc('updated_at')->take(50)->values()->all());
    }
    public function knowledge(Request $r, string $kind)
    {
        $type = DB::table('knowledge_types')->where('tenant_id', $this->t($r))->where('slug', $kind)->first();
        $table = $this->table($kind);
        if (!$table && $type) $table = 'wiki_pages';
        if (!$table) return $this->fail($r, 'NOT_FOUND', 'knowledge kind not found', 404);
        $projectColumn = $table === 'lessons_learned' ? 'project_id' : 'related_project_id';
        $q = DB::table($table.' as k')
            ->leftJoin('projects as p', function ($join) use ($projectColumn) {
                $join->on('p.tenant_id', '=', 'k.tenant_id')->on('p.id', '=', 'k.'.$projectColumn);
            })
            ->leftJoin('users as u', function ($join) {
                $join->on('u.tenant_id', '=', 'k.tenant_id')->on('u.id', '=', 'k.author_id');
            })
            ->select('k.*', 'p.name as related_project_name', 'u.name as author_name')
            ->where('k.tenant_id', $this->t($r))
            ->where('k.publication_status', 'published')
            ->whereNull('k.deleted_at');
        if ($table === 'wiki_pages' && $type) $q->where('k.knowledge_type_id', $type->id);
        if ($this->u($r)->role !== 'admin') {
            $divisionID = DB::table('users as u')
                ->join('teams as t', function ($join) {
                    $join->on('t.tenant_id', '=', 'u.tenant_id')->on('t.id', '=', 'u.team_id');
                })
                ->where('u.tenant_id', $this->t($r))
                ->where('u.id', $this->u($r)->id)
                ->value('t.division_id');
            $divisionIDs = DB::table('division_leads')->where('tenant_id', $this->t($r))->where('user_id', $this->u($r)->id)->pluck('division_id')->all();
            if ($divisionID) $divisionIDs[] = $divisionID;
            $divisionIDs = array_values(array_unique($divisionIDs));
            $q->where(function ($access) use ($divisionIDs) {
                $access->whereRaw('cardinality(k.accessible_division_ids) = 0');
                if ($divisionIDs) $access->orWhereRaw('k.accessible_division_ids && ?::uuid[]', [$this->pg($divisionIDs)]);
            });
        }
        if ($r->q) $q->where(fn($x) => $x->where('k.title', 'ilike', '%'.$r->q.'%')->orWhere('k.content', 'ilike', '%'.$r->q.'%'));
        $items = $this->rows($q->orderByDesc('k.updated_at'));
        if ($table === 'lessons_learned') {
            $items = array_map(function (array $item) {
                $item['related_project_id'] = $item['project_id'] ?? null;
                return $item;
            }, $items);
        }
        return $this->ok($r, $items);
    }
    public function createKnowledge(Request $r, string $kind)
    {
        $type = DB::table('knowledge_types')->where('tenant_id', $this->t($r))->where('slug', $kind)->first();
        $table = $this->table($kind);
        if (!$table && $type) $table = 'wiki_pages';
        if (!$table) return $this->fail($r, 'NOT_FOUND', 'knowledge kind not found', 404);

        $d = $r->validate([
            'workspace_id' => 'required|uuid',
            'title' => 'required|string|max:160',
            'content' => 'nullable|string|max:1000000',
            'parent_page_id' => 'nullable|uuid',
            'tags' => 'array|max:20',
            'tags.*' => 'string|max:50',
            'knowledge_types' => 'sometimes|array|min:1|max:20',
            'knowledge_types.*' => 'string|max:80',
            'external_resources' => 'sometimes|array|max:20',
            'external_resources.*.url' => 'required|url|max:2048',
            'external_resources.*.type' => 'required|in:url,google_docs',
            'external_resources.*.label' => 'nullable|string|max:160',
            'knowledge_source_mode' => 'sometimes|in:internal,external',
            'related_project_id' => 'nullable|uuid',
            'accessible_division_ids' => 'sometimes|array|max:50',
            'accessible_division_ids.*' => 'uuid',
            'publication_status' => 'sometimes|in:draft,published',
            'cover_source' => 'sometimes|nullable|in:upload,url',
            'cover_url' => 'sometimes|nullable|string|max:2048',
        ]);
        $tenant = $this->t($r);
        if (!DB::table('knowledge_workspaces')->where('tenant_id', $tenant)->where('id', $d['workspace_id'])->whereNull('deleted_at')->exists()) {
            return $this->fail($r, 'VALIDATION_ERROR', 'workspace does not belong to this workspace', 422, 'workspace_id');
        }
        if (!empty($d['related_project_id']) && !DB::table('projects')->where('tenant_id', $tenant)->where('id', $d['related_project_id'])->whereNull('deleted_at')->exists()) {
            return $this->fail($r, 'VALIDATION_ERROR', 'project does not belong to this workspace', 422, 'related_project_id');
        }
        $divisionIDs = array_values(array_unique($d['accessible_division_ids'] ?? []));
        if (count($divisionIDs) !== DB::table('divisions')->where('tenant_id', $tenant)->whereIn('id', $divisionIDs)->count()) {
            return $this->fail($r, 'VALIDATION_ERROR', 'one or more divisions do not belong to this workspace', 422, 'accessible_division_ids');
        }
        $publicationStatus = $d['publication_status'] ?? 'published';
        $coverSource = $d['cover_source'] ?? null;
        $coverURL = isset($d['cover_url']) ? trim($d['cover_url']) : null;
        if (!$this->validKnowledgeCover($coverSource, $coverURL, $tenant)) return $this->fail($r, 'VALIDATION_ERROR', 'cover must be a valid uploaded media path or HTTP(S) URL', 422, 'cover_url');
        if ($publicationStatus === 'published' && trim((string) ($d['content'] ?? '')) === '' && empty($d['external_resources'])) {
            return $this->fail($r, 'VALIDATION_ERROR', 'published knowledge requires content or an external resource', 422, 'content');
        }

        $id = (string) Str::uuid();
        $row = [
            'id' => $id,
            'tenant_id' => $tenant,
            'workspace_id' => $d['workspace_id'],
            'title' => trim($d['title']),
            'content' => $d['content'] ?? '',
            'author_id' => $this->u($r)->id,
            'tags' => $this->pg($d['tags'] ?? []),
            'knowledge_types' => $this->pg($d['knowledge_types'] ?? [$kind]),
            'external_resources' => json_encode($d['external_resources'] ?? []),
            'knowledge_source_mode' => $d['knowledge_source_mode'] ?? 'internal',
            'accessible_division_ids' => $this->pg($divisionIDs),
            'publication_status' => $publicationStatus,
            'published_at' => $publicationStatus === 'published' ? now() : null,
            'cover_source' => $coverSource,
            'cover_url' => $coverURL,
            'created_at' => now(),
            'updated_at' => now(),
        ];
        if ($table === 'wiki_pages') {
            $row['parent_page_id'] = $d['parent_page_id'] ?? null;
            $row['knowledge_type_id'] = $type?->id;
            $row['related_project_id'] = $d['related_project_id'] ?? null;
        } elseif ($table === 'lessons_learned') {
            $row['project_id'] = $d['related_project_id'] ?? null;
        } else {
            $row['related_project_id'] = $d['related_project_id'] ?? null;
        }

        $item = DB::transaction(function () use ($r, $table, $row, $id, $tenant) {
            DB::table($table)->insert($row);
            $created = (array) DB::table($table)->where('tenant_id', $tenant)->where('id', $id)->first();
            DB::table('audit_events')->insert([
                'id' => (string) Str::uuid(),
                'tenant_id' => $tenant,
                'actor_id' => $this->u($r)->id,
                'actor_source' => 'user',
                'action' => 'create',
                'entity_type' => 'knowledge',
                'entity_id' => $id,
                'after_json' => json_encode($created),
                'request_id' => $r->attributes->get('request_id'),
                'created_at' => now(),
            ]);
            if ($table === 'lessons_learned') $created['related_project_id'] = $created['project_id'] ?? null;
            return $created;
        });
        return $this->ok($r, $item, 201);
    }
    public function updateKnowledge(Request $r, string $kind, string $id)
    {
        $type = DB::table('knowledge_types')->where('tenant_id', $this->t($r))->where('slug', $kind)->first();
        $table = $this->table($kind);
        if (!$table && $type) $table = 'wiki_pages';
        if (!$table) return $this->fail($r, 'NOT_FOUND', 'knowledge kind not found', 404);
        $tenant = $this->t($r);
        $before = DB::table($table)->where('tenant_id', $tenant)->where('id', $id)->whereNull('deleted_at')->first();
        if (!$before) return $this->fail($r, 'NOT_FOUND', 'knowledge not found', 404);
        $actor = $this->u($r);
        if (($before->publication_status ?? 'published') === 'draft' && ($before->author_id ?? null) !== $actor->id) {
            return $this->fail($r, 'NOT_FOUND', 'knowledge not found', 404);
        }
        if (($before->author_id ?? null) !== $actor->id && !in_array($actor->role, ['admin', 'manager'], true)) {
            return $this->fail($r, 'FORBIDDEN', 'knowledge can only be edited by its author or a manager', 403);
        }
        $d = $r->validate([
            'title' => 'sometimes|required|string|max:160',
            'content' => 'sometimes|nullable|string|max:1000000',
            'parent_page_id' => 'sometimes|nullable|uuid',
            'tags' => 'sometimes|array|max:20',
            'tags.*' => 'string|max:50',
            'knowledge_types' => 'sometimes|array|min:1|max:20',
            'knowledge_types.*' => 'string|max:80',
            'external_resources' => 'sometimes|array|max:20',
            'external_resources.*.url' => 'required|url|max:2048',
            'external_resources.*.type' => 'required|in:url,google_docs',
            'external_resources.*.label' => 'nullable|string|max:160',
            'knowledge_source_mode' => 'sometimes|in:internal,external',
            'related_project_id' => 'sometimes|nullable|uuid',
            'accessible_division_ids' => 'sometimes|array|max:50',
            'accessible_division_ids.*' => 'uuid',
            'publication_status' => 'sometimes|in:draft,published',
            'cover_source' => 'sometimes|nullable|in:upload,url',
            'cover_url' => 'sometimes|nullable|string|max:2048',
        ]);
        if (!$d) return $this->fail($r, 'VALIDATION_ERROR', 'at least one field is required', 400);
        $finalCoverSource = array_key_exists('cover_source', $d) ? $d['cover_source'] : ($before->cover_source ?? null);
        $finalCoverURL = array_key_exists('cover_url', $d) ? ($d['cover_url'] === null ? null : trim($d['cover_url'])) : ($before->cover_url ?? null);
        if (!$this->validKnowledgeCover($finalCoverSource, $finalCoverURL, $tenant)) return $this->fail($r, 'VALIDATION_ERROR', 'cover must be a valid uploaded media path or HTTP(S) URL', 422, 'cover_url');
        if (array_key_exists('cover_url', $d)) $d['cover_url'] = $finalCoverURL;
        if (array_key_exists('related_project_id', $d) && $d['related_project_id'] && !DB::table('projects')->where('tenant_id', $tenant)->where('id', $d['related_project_id'])->whereNull('deleted_at')->exists()) {
            return $this->fail($r, 'VALIDATION_ERROR', 'project does not belong to this workspace', 422, 'related_project_id');
        }
        if (array_key_exists('accessible_division_ids', $d)) {
            $divisionIDs = array_values(array_unique($d['accessible_division_ids']));
            if (count($divisionIDs) !== DB::table('divisions')->where('tenant_id', $tenant)->whereIn('id', $divisionIDs)->count()) {
                return $this->fail($r, 'VALIDATION_ERROR', 'one or more divisions do not belong to this workspace', 422, 'accessible_division_ids');
            }
            $d['accessible_division_ids'] = $this->pg($divisionIDs);
        }
        if (isset($d['title'])) $d['title'] = trim($d['title']);
        if (array_key_exists('tags', $d)) $d['tags'] = $this->pg($d['tags']);
        if (array_key_exists('knowledge_types', $d)) $d['knowledge_types'] = $this->pg(array_values(array_unique($d['knowledge_types'])));
        if (array_key_exists('external_resources', $d)) $d['external_resources'] = json_encode($d['external_resources']);
        if (array_key_exists('related_project_id', $d)) {
            $d[$table === 'lessons_learned' ? 'project_id' : 'related_project_id'] = $d['related_project_id'];
            unset($d['related_project_id']);
        }
        if (($d['publication_status'] ?? null) === 'published') {
            $finalTitle = $d['title'] ?? $before->title;
            $finalContent = $d['content'] ?? $before->content;
            $finalTypes = $d['knowledge_types'] ?? ($before->knowledge_types ?? '');
            $resources = json_decode($d['external_resources'] ?? ($before->external_resources ?? '[]'), true) ?: [];
            if (trim((string) $finalTitle) === '') return $this->fail($r, 'VALIDATION_ERROR', 'published knowledge requires a title', 422, 'title');
            if (trim((string) $finalTypes, '{}" ') === '') return $this->fail($r, 'VALIDATION_ERROR', 'published knowledge requires at least one type', 422, 'knowledge_types');
            if (trim((string) $finalContent) === '' && !$resources) return $this->fail($r, 'VALIDATION_ERROR', 'published knowledge requires content or an external resource', 422, 'content');
            $d['published_at'] = now();
        }
        $d['updated_at'] = now();
        $item = DB::transaction(function () use ($r, $table, $tenant, $id, $before, $d) {
            DB::table($table)->where('tenant_id', $tenant)->where('id', $id)->update($d);
            $after = (array) DB::table($table)->where('tenant_id', $tenant)->where('id', $id)->first();
            DB::table('audit_events')->insert([
                'id' => (string) Str::uuid(), 'tenant_id' => $tenant, 'actor_id' => $this->u($r)->id,
                'actor_source' => 'user', 'action' => ($d['publication_status'] ?? null) === 'published' && ($before->publication_status ?? null) !== 'published' ? 'publish' : 'update', 'entity_type' => 'knowledge', 'entity_id' => $id,
                'before_json' => json_encode((array) $before), 'after_json' => json_encode($after),
                'request_id' => $r->attributes->get('request_id'), 'created_at' => now(),
            ]);
            return $after;
        });
        return $this->ok($r, $item);
    }
    public function sops(Request $r){return $this->ok($r,DB::table('sop_repository')->where('tenant_id',$this->t($r))->orderByDesc('updated_at')->get()->map(fn($x)=>['id'=>$x->id,'name'=>$x->title,'version'=>$x->version,'description'=>$x->description])->all());}
    public function createSop(Request $r){$d=$r->validate(['name'=>'required','description'=>'nullable','items'=>'array']);$workspace=DB::table('knowledge_workspaces')->where('tenant_id',$this->t($r))->value('id');if(!$workspace){$workspace=(string)Str::uuid();DB::table('knowledge_workspaces')->insert(['id'=>$workspace,'tenant_id'=>$this->t($r),'name'=>'Operations','created_at'=>now(),'updated_at'=>now()]);}$id=(string)Str::uuid();$steps=array_map(fn($x)=>['label'=>$x],$d['items']??[]);DB::table('sop_repository')->insert(['id'=>$id,'tenant_id'=>$this->t($r),'workspace_id'=>$workspace,'title'=>$d['name'],'description'=>$d['description']??null,'steps'=>json_encode($steps),'version'=>1,'author_id'=>$this->u($r)->id,'is_active'=>true,'created_at'=>now(),'updated_at'=>now()]);return $this->ok($r,['id'=>$id,'name'=>$d['name'],'version'=>1],201);}
    public function rules(Request $r){return $this->ok($r,DB::table('automation_rules')->where('tenant_id',$this->t($r))->get()->map(fn($x)=>['id'=>$x->id,'name'=>$x->name,'event_type'=>$x->trigger_event,'is_active'=>$x->is_active])->all());}
    public function templates(Request $r){return $this->ok($r,$this->rows(DB::table('project_templates')->select('id','name')->where('tenant_id',$this->t($r))->whereNull('deleted_at')->orderBy('name')));}
    public function ask(Request $r){$question=trim((string)$r->question);$projects=DB::table('projects')->where('tenant_id',$this->t($r))->whereNull('deleted_at')->count();$tasks=DB::table('tasks')->where('tenant_id',$this->t($r))->whereNull('deleted_at')->where('board_column','!=','done')->count();$answer="Current workspace has {$projects} projects and {$tasks} open tasks.";$id=(string)Str::uuid();DB::table('ai_query_history')->insert(['id'=>$id,'tenant_id'=>$this->t($r),'user_id'=>$this->u($r)->id,'question'=>$question,'answer'=>$answer,'evidence_json'=>json_encode([]),'created_at'=>now()]);return $this->ok($r,['answer'=>$answer,'evidence'=>[['label'=>'Projects','value'=>$projects,'source'=>'projects'],['label'=>'Open tasks','value'=>$tasks,'source'=>'tasks']]]);}
    public function apiClients(Request $r){return $this->ok($r,DB::table('api_clients')->select('id','name','client_id','scopes','is_active','created_at')->where('tenant_id',$this->t($r))->where('is_active',true)->get()->map(function($x){$x->scopes=is_string($x->scopes)?str_getcsv(trim($x->scopes,'{}')):$x->scopes;return $x;})->all());}
    public function createApiClient(Request $r){$d=$r->validate(['name'=>'required','scopes'=>'array']);$id=(string)Str::uuid();$client='npms_'.Str::lower(Str::random(16));$secret=Str::random(48);DB::table('api_clients')->insert(['id'=>$id,'tenant_id'=>$this->t($r),'name'=>$d['name'],'client_id'=>$client,'client_secret_hash'=>password_hash($secret,PASSWORD_BCRYPT),'scopes'=>$this->pg($d['scopes']??[]),'is_active'=>true,'created_at'=>now(),'updated_at'=>now()]);return $this->ok($r,['id'=>$id,'name'=>$d['name'],'client_id'=>$client,'client_secret'=>$secret,'scopes'=>$d['scopes']??[]],201);}
    public function usage(Request $r){return $this->ok($r,DB::table('api_clients as c')->leftJoin('api_usage_events as u','u.api_client_id','=','c.id')->where('c.tenant_id',$this->t($r))->groupBy('c.id','c.name')->selectRaw('c.name,count(u.id) as requests,count(u.id) filter (where u.status_code>=400) as errors')->get());}
    public function deliveries(Request $r){return $this->ok($r,$this->rows(DB::table('webhook_deliveries')->where('tenant_id',$this->t($r))->orderByDesc('created_at')));}
    public function apiClientHistory(Request $r,string $id){$client=DB::table('api_clients')->where('tenant_id',$this->t($r))->where('id',$id)->first();if(!$client)return $this->fail($r,'NOT_FOUND','API client not found',404);$items=DB::table('api_usage_events')->select('id','request_id','method','path','status_code','duration_ms','occurred_at')->where('tenant_id',$this->t($r))->where('api_client_id',$id)->orderByDesc('occurred_at')->limit(100)->get();return $this->ok($r,['client'=>['id'=>$client->id,'name'=>$client->name,'client_id'=>$client->client_id,'is_active'=>$client->is_active],'requests'=>$items]);}
    public function removeApiClient(Request $r,string $id){if($this->u($r)->role!=='admin')return $this->fail($r,'FORBIDDEN','admin role required',403);$client=DB::table('api_clients')->where('tenant_id',$this->t($r))->where('id',$id)->first();if(!$client)return $this->fail($r,'NOT_FOUND','API client not found',404);DB::transaction(function()use($r,$id,$client){DB::table('api_clients')->where('tenant_id',$this->t($r))->where('id',$id)->update(['is_active'=>false,'updated_at'=>now()]);DB::table('audit_events')->insert(['id'=>(string)Str::uuid(),'tenant_id'=>$this->t($r),'actor_id'=>$this->u($r)->id,'actor_source'=>'user','action'=>'revoke','entity_type'=>'api_client','entity_id'=>$id,'before_json'=>json_encode((array)$client),'after_json'=>json_encode(['is_active'=>false]),'request_id'=>$r->attributes->get('request_id'),'created_at'=>now()]);});return $this->ok($r,['id'=>$id,'removed'=>true,'is_active'=>false]);}}

