<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\ActivityRealizationController;
use App\Http\Controllers\ProjectRealizationsController;
use App\Http\Controllers\ExecutionController;
use App\Http\Controllers\ProjectWorkflowController;
use App\Http\Controllers\PlatformController;
use App\Http\Controllers\WorkspaceController;
use App\Http\Controllers\OrganizationController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    Route::post('/auth/development-session', [AuthController::class, 'developmentSession']);
    Route::post('/integrations/github/webhook', [ExecutionController::class, 'githubWebhook']);
    Route::middleware('npms')->group(function () {
        Route::get('/auth/me', [AuthController::class, 'me']);
        Route::put('/users/me/profile-image', [AuthController::class, 'updateProfileImage'])->middleware('throttle:10,1');
        Route::get('/users/{id}/profile-image', [AuthController::class, 'profileImage']);
        Route::post('/auth/logout', [AuthController::class, 'logout']);
        Route::get('/dashboard/summary', [WorkspaceController::class, 'summary']);
        Route::get('/divisions', [OrganizationController::class, 'divisions']);
        Route::get('/teams', [OrganizationController::class, 'teams']);
        Route::post('/divisions', [WorkspaceController::class, 'createDivision']);
        Route::patch('/divisions/{id}', [WorkspaceController::class, 'updateDivision']);
        Route::post('/teams', [OrganizationController::class, 'createTeam']);
        Route::patch('/teams/{id}', [WorkspaceController::class, 'updateTeam']);
        Route::put('/teams/{id}/members', [OrganizationController::class, 'setTeamMembers']);
        Route::put('/teams/{id}/divisions', [OrganizationController::class, 'setTeamDivisions']);
        Route::put('/divisions/{id}/members', [OrganizationController::class, 'setDivisionMembers']);
        Route::put('/divisions/{id}/leads', [WorkspaceController::class, 'setLeads']);
        Route::get('/users', [WorkspaceController::class, 'users']);
        Route::post('/settings/users', [WorkspaceController::class, 'createUser']);
        Route::get('/settings/ai-integration', [WorkspaceController::class, 'aiIntegration']);
        Route::put('/settings/ai-integration', [WorkspaceController::class, 'updateAiIntegration']);
        Route::get('/settings/github-integration', [WorkspaceController::class, 'githubIntegration']);
        Route::put('/settings/github-integration', [WorkspaceController::class, 'updateGithubIntegration']);        Route::get('/settings/notification-delivery', [WorkspaceController::class, 'notificationDelivery']);
        Route::put('/settings/notification-delivery', [WorkspaceController::class, 'updateNotificationDelivery']);
        Route::get('/settings/webhooks', [WorkspaceController::class, 'webhooks']);
        Route::post('/settings/webhooks', [WorkspaceController::class, 'createWebhooks']);
        Route::patch('/settings/webhooks/{id}', [WorkspaceController::class, 'updateWebhook']);
        Route::post('/settings/webhooks/{id}/tests', [WorkspaceController::class, 'testWebhook']);        Route::get('/settings/general', [WorkspaceController::class, 'generalSettings']);
        Route::patch('/settings/general', [WorkspaceController::class, 'updateGeneralSettings']);
        Route::get('/calendar/holidays', [WorkspaceController::class, 'holidays'])->middleware('throttle:30,1');
        Route::get('/settings/workspace-tabs', [WorkspaceController::class, 'workspaceTabs']);
        Route::put('/settings/workspace-tabs', [WorkspaceController::class, 'saveWorkspaceTabs']);
        Route::post('/settings/simulation', [WorkspaceController::class, 'loadSimulation']);
        Route::delete('/settings/simulation', [WorkspaceController::class, 'deleteSimulation']);
        Route::get('/settings/project-types', [WorkspaceController::class, 'projectTypes']);
        Route::post('/settings/project-types', [WorkspaceController::class, 'createProjectType']);
        Route::get('/settings/project-metadata-fields', [WorkspaceController::class, 'metadataFields']);
        Route::post('/settings/project-metadata-fields', [WorkspaceController::class, 'createMetadataField']);
        Route::get('/settings/knowledge-types', [WorkspaceController::class, 'knowledgeTypes']);
        Route::post('/settings/knowledge-types', [WorkspaceController::class, 'createKnowledgeType']);
        Route::patch('/settings/knowledge-types/{id}', [WorkspaceController::class, 'updateKnowledgeType']);
        Route::get('/settings/editor-preference', [WorkspaceController::class, 'editorPreference']);
        Route::patch('/settings/editor-preference', [WorkspaceController::class, 'updateEditorPreference']);
        Route::get('/project-scope-options', [ExecutionController::class, 'projectScopeOptions']);
        Route::get('/projects', [ExecutionController::class, 'projects']);
        Route::post('/projects', [ExecutionController::class, 'createProject']);
        Route::get('/projects/{id}', [ExecutionController::class, 'projectById']);
        Route::get('/projects/{project}/finish-attachments', [ExecutionController::class, 'finishAttachments']);
        Route::post('/projects/{project}/finish-attachments', [ExecutionController::class, 'uploadFinishAttachment']);
        Route::post('/projects/{project}/finish-links', [ExecutionController::class, 'createFinishLink']);
        Route::get('/projects/{project}/finish-attachments/{id}', [ExecutionController::class, 'downloadFinishAttachment']);
        Route::patch('/projects/{id}', [ExecutionController::class, 'updateProject']);
        Route::post('/projects/{id}/github-link', [ExecutionController::class, 'linkGithubRepository']);
        Route::post('/projects/{id}/submit-review', [ProjectWorkflowController::class, 'submitReview']);
        Route::post('/projects/{id}/reopen', [ProjectWorkflowController::class, 'reopen']);
        Route::get('/preliminary-note-templates', [ExecutionController::class, 'noteTemplates']);
        Route::get('/tasks', [ExecutionController::class, 'tasks']);
        Route::post('/tasks', [ExecutionController::class, 'createTask']);
        Route::patch('/tasks/{id}', [ExecutionController::class, 'updateTask']);
        Route::delete('/tasks/{id}', [ExecutionController::class, 'deleteTask']);
        Route::get('/tasks/{task}/checklist', [ExecutionController::class, 'checklist']);
        Route::post('/tasks/{task}/checklist', [ExecutionController::class, 'addChecklist']);
        Route::patch('/tasks/{task}/checklist/{id}', [ExecutionController::class, 'toggleChecklist']);
        Route::get('/tasks/{task}/notes', [ExecutionController::class, 'activityNotes']);
        Route::post('/tasks/{task}/notes', [ExecutionController::class, 'createActivityNote']);
        Route::get('/tasks/{task}/realization', [ActivityRealizationController::class, 'show']);
        Route::patch('/tasks/{task}/realization', [ActivityRealizationController::class, 'update']);
        Route::get('/projects/{project}/realizations', [ProjectRealizationsController::class, 'index']);
        Route::get('/reviews', [ExecutionController::class, 'reviews']);
        Route::post('/reviews', [ExecutionController::class, 'createReview']);
        Route::patch('/reviews/{id}', [ExecutionController::class, 'updateReview']);
        Route::get('/time-entries', [ExecutionController::class, 'timeEntries']);
        Route::post('/time-entries/start', [ExecutionController::class, 'startTime']);
        Route::post('/time-entries/stop', [ExecutionController::class, 'stopTime']);

        Route::get('/knowledge/workspaces', [PlatformController::class,'workspaces']);
        Route::post('/knowledge/workspaces', [PlatformController::class,'createWorkspace']);
        Route::post('/knowledge/media', [PlatformController::class,'uploadKnowledgeMedia'])->middleware('throttle:20,1');
        Route::get('/knowledge/media/{id}', [PlatformController::class,'knowledgeMedia'])->whereUuid('id');
        Route::get('/knowledge/drafts', [PlatformController::class,'knowledgeDrafts']);
        Route::get('/knowledge/{kind}', [PlatformController::class,'knowledge']);
        Route::post('/knowledge/{kind}', [PlatformController::class,'createKnowledge']);
        Route::patch('/knowledge/{kind}/{id}', [PlatformController::class,'updateKnowledge']);
        Route::get('/search', fn(Request $r) => envelope($r, []));
        Route::get('/notifications', fn(Request $r) => envelope($r, []));
        Route::get('/api-clients', [PlatformController::class,'apiClients']);
        Route::post('/api-clients', [PlatformController::class,'createApiClient']);
        Route::get('/api-clients/usage', [PlatformController::class,'usage']);
        Route::get('/api-clients/{id}/history', [PlatformController::class,'apiClientHistory']);
        Route::delete('/api-clients/{id}', [PlatformController::class,'removeApiClient']);
        Route::get('/webhooks/subscriptions', fn(Request $r) => envelope($r, []));
        Route::get('/webhooks/deliveries', [PlatformController::class,'deliveries']);
        Route::get('/integrations/github/links', fn(Request $r) => envelope($r, []));
        Route::get('/sops', [PlatformController::class,'sops']);
        Route::post('/sops', [PlatformController::class,'createSop']);
        Route::get('/automations/rules', [PlatformController::class,'rules']);
        Route::get('/assistant/history', fn(Request $r) => envelope($r, []));
        Route::get('/templates', [PlatformController::class,'templates']);
        Route::get('/templates/marketplace', fn(Request $r) => envelope($r, []));
        Route::get('/reports/productivity', [ExecutionController::class, 'productivity']);
        Route::get('/reports/productivity.pdf', [ExecutionController::class, 'productivityPdf']);
        Route::post('/assistant/query', [PlatformController::class,'ask']);
    });
});

if (!function_exists('envelope')) {
    function envelope(Request $request, mixed $data, int $status=200) {
        return response()->json(['data'=>$data,'meta'=>['request_id'=>$request->attributes->get('request_id')],'errors'=>null],$status);
    }
}

