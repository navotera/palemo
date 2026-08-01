import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DivisionPerformanceData } from "./DivisionPerformance";
import "./settings.css";
import {ListPagination,usePagination} from "./Pagination";
import "./division-settings.css";
import "./lead-picker.css";
import "./github-integration.css";

type Envelope<T> = { data: T; errors: null | Array<{ message: string }> };
export type ProjectTypeSetting = {
  id?: string;
  name: string;
  value: string;
  color: string;
  built_in: boolean;
};
export type MetadataField = {
  id: string;
  name: string;
  key: string;
  type: "text" | "number" | "date" | "boolean" | "select";
  options: string[];
  is_required: boolean;
};
type AiIntegrationSetting={is_enabled:boolean;provider:"openai"|"anthropic"|"gemini"|"custom";model:string|null;base_url:string|null;api_key_configured:boolean;project_data_access:"summary"|"summary_and_activities"|"full_project";auto_report_enabled:boolean;report_frequency:"weekly"|"monthly"|"on_completion";delivery_mode:"review"|"send_to_client"};
type GithubIntegrationSetting={is_enabled:boolean;api_base_url:string;access_token_configured:boolean;webhook_url:string};
type NotificationDeliverySetting={provider:"ecopa"|"palemo_smtp";ecopa_base_url:string|null;ecopa_client_id:string|null;ecopa_secret_configured:boolean;smtp_host:string|null;smtp_port:number;smtp_encryption:"tls"|"ssl"|"none";smtp_username:string|null;smtp_password_configured:boolean;smtp_from_email:string|null;smtp_from_name:string|null;event_rules:{project_member:string[]}};
type WebhookSetting={id:string;event:string;target_url:string;is_active:boolean;consecutive_failures:number;deliveries:number;last_delivery_at:string|null};type GeneralSetting = { knowledge_visible_type_limit: number; workspace_tab_limit: number; country_code: string; date_format: string; theme_tone: string; custom_theme_mode: "solid"|"gradient"; custom_theme_primary: string; custom_theme_secondary: string; custom_theme_angle: number; simulation_loaded: boolean; simulation_records: number };
type KnowledgeTypeSetting = {
  id: string;
  slug: string;
  label: string;
  description: string;
  icon: string | null;
  color: string;
  is_active: boolean;
  is_system: boolean;
  sort_order: number;
};
export type DirectoryUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  team_id?: string;
};
type OrgTeam = { id: string; name: string; color: string; icon: string; division_id?: string; division_ids: string[]; member_ids: string[] };
export type OrgDivision = {
  id: string;
  name: string;
  color: string;
  icon: string;
  teams: OrgTeam[];
  team_ids: string[];
  member_ids: string[];
  lead_user_ids: string[];
};
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "include", ...init });
  const responseText=await response.text();
  let body:Envelope<T>;
  try{body=JSON.parse(responseText) as Envelope<T>}catch{throw new Error(response.ok?"Server returned an invalid response":"Server could not process the request")}
  if (!response.ok)
    throw new Error(body.errors?.[0]?.message ?? "Request failed");
  return body.data;
}
const createHeaders = () => ({
  "Content-Type": "application/json",
  "Idempotency-Key": crypto.randomUUID(),
});
const settingsMenuIcons:Record<string,string>={
  general:"M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.4-3.5a7.8 7.8 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.8-1L14.8 3h-4l-.4 3.1a8 8 0 0 0-1.8 1l-2.4-1-2 3.4 2 1.5a7.8 7.8 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 1.8 1l.4 3.1h4l.4-3.1a8 8 0 0 0 1.8-1l2.4 1 2-3.4-2-1.5a7.8 7.8 0 0 0 .1-1Z",
  ai:"M12 3 13.4 7.6 18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4L12 3Zm6 11 .8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14ZM5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14Z",
  github:"M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-2c-2.8.6-3.4-1.2-3.4-1.2-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 0 1.6 1.1 1.6 1.1.9 1.6 2.4 1.1 3 .8.1-.7.4-1.1.6-1.4-2.3-.3-4.7-1.1-4.7-5A3.9 3.9 0 0 1 7.7 9c-.1-.3-.5-1.3.1-2.7 0 0 .9-.3 2.8 1.1a9.7 9.7 0 0 1 5.1 0c2-1.4 2.8-1.1 2.8-1.1.6 1.4.2 2.4.1 2.7a3.9 3.9 0 0 1 1 2.7c0 3.9-2.4 4.7-4.7 5 .4.3.7 1 .7 2V21c0 .3.2.6.7.5A10 10 0 0 0 12 2Z",
  notifications:"M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Zm-8 12h4",
  webhooks:"M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1",
  types:"m12 2 9 5-9 5-9-5 9-5Zm-9 10 9 5 9-5M3 17l9 5 9-5",
  metadata:"M4 6h10M18 6h2M14 3v6M4 18h2M10 18h10M6 15v6M4 12h4M12 12h8M8 9v6",
  knowledge:"M4 4.5A2.5 2.5 0 0 1 6.5 2H11v18H6.5A2.5 2.5 0 0 0 4 22V4.5Zm16 0A2.5 2.5 0 0 0 17.5 2H13v18h4.5A2.5 2.5 0 0 1 20 22V4.5Z",
  users:"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
};
function SettingsMenuIcon({id}:{id:string}){return <svg className="settings-tab-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={settingsMenuIcons[id]}/></svg>}
const divisionIconOptions=["🏢","🏛️","🏭","🏗️","🏬","💼","👥","🤝","🛠️","⚙️","💻","🧑‍💻","🎨","✏️","📣","📈","📊","💰","🧾","🛡️","🔒","⚖️","📦","🚚","🌐","🧪","💡","🎯","⭐","🌱","🚀","🏆"];

export function SettingsPage({
  divisions,
  currentUserRole,
}: {
  divisions: DivisionPerformanceData[];
  currentUserRole: string;
}) {
  const cache = useQueryClient();
  const [tab, setTab] = useState<
    "general" | "ai" | "github" | "notifications" | "webhooks" | "types" | "metadata" | "knowledge" | "users"
  >("general");
  const general = useQuery({
    queryKey: ["settings", "general"],
    queryFn: () => api<GeneralSetting>("/api/v1/settings/general"),
  });
  const aiIntegration=useQuery({queryKey:["settings","ai-integration"],queryFn:()=>api<AiIntegrationSetting>("/api/v1/settings/ai-integration"),enabled:currentUserRole==="admin"});
  const githubIntegration=useQuery({queryKey:["settings","github-integration"],queryFn:()=>api<GithubIntegrationSetting>("/api/v1/settings/github-integration"),enabled:currentUserRole==="admin"});
  const notificationDelivery=useQuery({queryKey:["settings","notification-delivery"],queryFn:()=>api<NotificationDeliverySetting>("/api/v1/settings/notification-delivery")});
  const webhooks=useQuery({queryKey:["settings","webhooks"],queryFn:()=>api<WebhookSetting[]>("/api/v1/settings/webhooks")});  const types = useQuery({
    queryKey: ["settings", "project-types"],
    queryFn: () => api<ProjectTypeSetting[]>("/api/v1/settings/project-types"),
  });
  const fields = useQuery({
    queryKey: ["settings", "metadata-fields"],
    queryFn: () =>
      api<MetadataField[]>("/api/v1/settings/project-metadata-fields"),
  });
  const knowledgeTypes = useQuery({
    queryKey: ["settings", "knowledge-types"],
    queryFn: () => api<KnowledgeTypeSetting[]>("/api/v1/settings/knowledge-types"),
  });
  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api<DirectoryUser[]>("/api/v1/users"),
  });
  const orgDivisions = useQuery({
    queryKey: ["divisions"],
    queryFn: () => api<OrgDivision[]>("/api/v1/divisions"),
  });
  const teams = useMemo(
    () =>
      divisions.flatMap((d) =>
        d.teams.map((t) => ({ ...t, division: d.name })),
      ),
    [divisions],
  );
  const tabs = [
    ["general", "General"],
    ["ai", "AI Integration"],
    ...(currentUserRole==="admin"?[["github", "GitHub Integration"]] as const:[]),
    ["notifications", "Notifications"],
    ["webhooks", "Webhooks"],
    ["types", "Project Types"],
    ["metadata", "Project Metadata"],
    ["knowledge", "Knowledge Types"],
    ["users", "Users & Roles"],
  ] as const;
  return (
    <section className="settings-page">
      <header className="settings-intro">
        <span className="eyebrow">Workspace configuration</span>
        <h1>Settings</h1>
        <p>
          Manage reusable data used throughout project planning and
          collaboration.
        </p>
      </header>
      <div className="settings-workspace">
        <nav className="settings-tabs" aria-label="Settings sections">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
            >
              <SettingsMenuIcon id={id}/>
              <span className="settings-tab-copy"><span>{label}</span></span>
            </button>
          ))}
        </nav>
        <div className="settings-content">
          {tab === "general" && general.data && (
            <div className="general-settings-stack">
              <GeneralSettings value={general.data} onSaved={() => cache.invalidateQueries({ queryKey: ["settings", "general"] })} />
            </div>
          )}
          {tab==="ai"&&aiIntegration.data&&<AiIntegrationSettings value={aiIntegration.data} onSaved={()=>cache.invalidateQueries({queryKey:["settings","ai-integration"]})}/>}
          {tab==="github"&&githubIntegration.data&&<GithubIntegrationSettings value={githubIntegration.data} onSaved={()=>cache.invalidateQueries({queryKey:["settings","github-integration"]})}/>}
          {tab==="notifications"&&notificationDelivery.data&&<NotificationDeliverySettings value={notificationDelivery.data} onSaved={()=>cache.invalidateQueries({queryKey:["settings","notification-delivery"]})}/>} 
          {tab==="webhooks"&&<WebhookSettings items={webhooks.data??[]} onSaved={()=>cache.invalidateQueries({queryKey:["settings","webhooks"]})}/>}           {tab === "types" && (
            <ProjectTypes
              items={types.data ?? []}
              onSaved={() =>
                cache.invalidateQueries({
                  queryKey: ["settings", "project-types"],
                })
              }
            />
          )}{" "}
          {tab === "metadata" && (
            <MetadataFields
              items={fields.data ?? []}
              onSaved={() =>
                cache.invalidateQueries({
                  queryKey: ["settings", "metadata-fields"],
                })
              }
            />
          )}{" "}
          {tab === "knowledge" && (
            <KnowledgeTypes items={knowledgeTypes.data ?? []} currentUserRole={currentUserRole} visibleLimit={general.data?.knowledge_visible_type_limit ?? 3} onGeneralSaved={() => cache.invalidateQueries({ queryKey: ["settings", "general"] })} onSaved={() => {
              cache.invalidateQueries({ queryKey: ["settings", "knowledge-types"] });
            }} />
          )}
          {tab === "users" && (
            <UsersRoles
              users={users.data ?? []}
              teams={teams}
              onSaved={() => {
                cache.invalidateQueries({ queryKey: ["users"] });
                cache.invalidateQueries({ queryKey: ["dashboard-summary"] });
              }}
            />
          )}

        </div>
      </div>
    </section>
  );
}

function ProjectTypes({
  items,
  onSaved,
}: {
  items: ProjectTypeSetting[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#60766a");
  const itemPager = usePagination(items, 10);
  const create = useMutation({
    mutationFn: () =>
      api<ProjectTypeSetting>("/api/v1/settings/project-types", {
        method: "POST",
        headers: createHeaders(),
        body: JSON.stringify({ name, color }),
      }),
    onSuccess: () => {
      setName("");
      setOpen(false);
      onSaved();
    },
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim()) create.mutate();
  }
  return (
    <SettingsSection
      title="Project Types"
      description="Reusable classifications shown in every New Project form."
      action="Add project type"
      onAction={() => setOpen(true)}
    >
      <div className="settings-list">
        {itemPager.pageItems.map((item) => (          <div key={item.value} className="settings-list-row">
            <i className="type-swatch" style={{ background: item.color }} />
            <div>
              <strong>{item.name}</strong>
              <small>
                {item.built_in
                  ? "Built-in project type"
                  : "Custom project type"}
              </small>
            </div>
            <code>{item.value}</code>
          </div>
        ))}
      </div>
      <ListPagination page={itemPager.page} pageSize={itemPager.pageSize} total={itemPager.total} onPageChange={itemPager.setPage} onPageSizeChange={itemPager.setPageSize}/>
      <SettingsDrawer
        open={open}
        title="Add project type"
        description="Create a reusable classification for all new projects."
        onClose={() => setOpen(false)}
      >
        <form className="settings-drawer-form" onSubmit={submit}>
          <label>
            <span>Type name</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder="Example: Client Delivery"
              required
            />
          </label>
          <label className="color-field">
            <span>Label color</span>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </label>
          {create.isError && (
            <p className="settings-error">{create.error.message}</p>
          )}
          <DrawerActions
            busy={create.isPending}
            disabled={!name.trim()}
            label="Save project type"
            onCancel={() => setOpen(false)}
          />
        </form>
      </SettingsDrawer>
    </SettingsSection>
  );
}

function MetadataFields({
  items,
  onSaved,
}: {
  items: MetadataField[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [type, setType] = useState<MetadataField["type"]>("text");
  const [options, setOptions] = useState("");
  const [required, setRequired] = useState(false);
  const itemPager = usePagination(items, 10);
  const create = useMutation({
    mutationFn: () =>
      api<MetadataField>("/api/v1/settings/project-metadata-fields", {
        method: "POST",
        headers: createHeaders(),
        body: JSON.stringify({
          name,
          key,
          type,
          options: options
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
          is_required: required,
        }),
      }),
    onSuccess: () => {
      setName("");
      setKey("");
      setOptions("");
      setRequired(false);
      setOpen(false);
      onSaved();
    },
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }
  return (
    <SettingsSection
      title="Project Metadata"
      description="Define additional structured fields for the New Project form."
      action="Add metadata field"
      onAction={() => setOpen(true)}
    >
      <div className="settings-table">
        {itemPager.pageItems.map((item) => (
          <div key={item.id}>
            <strong>{item.name}</strong>
            <code>{item.key}</code>
            <span>{item.type}</span>
            <small>{item.is_required ? "Required" : "Optional"}</small>
          </div>
        ))}
        {!items.length && <p>No custom metadata fields yet.</p>}
      </div>
      <ListPagination page={itemPager.page} pageSize={itemPager.pageSize} total={itemPager.total} onPageChange={itemPager.setPage} onPageSizeChange={itemPager.setPageSize}/>
      <SettingsDrawer
        open={open}
        title="Add metadata field"
        description="This field will appear in the Project Settings column."
        onClose={() => setOpen(false)}
      >
        <form className="settings-drawer-form" onSubmit={submit}>
          <label>
            <span>Field label</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!key)
                  setKey(
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "_")
                      .replace(/^_|_$/g, ""),
                  );
              }}
              required
            />
          </label>
          <label>
            <span>Field key</span>
            <input
              value={key}
              onChange={(e) =>
                setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
              }
              required
            />
          </label>
          <label>
            <span>Input type</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as MetadataField["type"])}
            >
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="date">Date</option>
              <option value="boolean">Yes / No</option>
              <option value="select">Select</option>
            </select>
          </label>
          {type === "select" && (
            <label>
              <span>Options</span>
              <input
                value={options}
                onChange={(e) => setOptions(e.target.value)}
                placeholder="High, Medium, Low"
                required
              />
            </label>
          )}
          <label className="settings-check">
            <input
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
            />
            <span>Required in New Project</span>
          </label>
          {create.isError && (
            <p className="settings-error">{create.error.message}</p>
          )}
          <DrawerActions
            busy={create.isPending}
            label="Save metadata field"
            onCancel={() => setOpen(false)}
          />
        </form>
      </SettingsDrawer>
    </SettingsSection>
  );
}

function UsersRoles({
  users,
  teams,
  onSaved,
}: {
  users: DirectoryUser[];
  teams: Array<{ id: string; name: string; division: string }>;
  onSaved: () => void;
}) {
  const [userSearch,setUserSearch]=useState("");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [teamID, setTeamID] = useState("");
  const [role, setRole] = useState("staff");
  const [roleFilter,setRoleFilter]=useState("all");
  const create = useMutation({
    mutationFn: () =>
      api<DirectoryUser>("/api/v1/settings/users", {
        method: "POST",
        headers: createHeaders(),
        body: JSON.stringify({ name, email, team_id: teamID, role }),
      }),
    onSuccess: () => {
      setName("");
      setEmail("");
      setTeamID("");
      setRole("staff");
      setOpen(false);
      onSaved();
    },
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }
  const filteredUsers=useMemo(()=>{const query=userSearch.trim().toLocaleLowerCase();return users.filter(user=>(roleFilter==="all"||user.role===roleFilter)&&(!query||user.name.toLocaleLowerCase().includes(query)||user.email.toLocaleLowerCase().includes(query)))},[users,roleFilter,userSearch]);
  const userPager=usePagination(filteredUsers,10);
  useEffect(()=>userPager.setPage(1),[roleFilter,userSearch]);
  return (
    <SettingsSection
      title="Users & Roles"
      description="Add workspace users and assign their organization team and access role."
      action="Add user"
      onAction={() => setOpen(true)}
    >
      <div className="user-list-filters"><div><label className="user-search"><span>Search users</span><input type="search" value={userSearch} onChange={event=>setUserSearch(event.target.value)} placeholder="Search by name or email" aria-label="Search users by name or email"/></label><label><span>Filter role</span><select value={roleFilter} onChange={event=>setRoleFilter(event.target.value)}><option value="all">All roles</option><option value="admin">Admin</option><option value="manager">Manager</option><option value="supervisor">Supervisor</option><option value="staff">Staff</option></select></label></div><small>{filteredUsers.length} user{filteredUsers.length===1?"":"s"}</small></div>
      <div className="settings-table user-table">
        {userPager.pageItems.map((user) => (
          <div key={user.id}>
            <span className="settings-avatar">
              {user.name.charAt(0).toUpperCase()}
            </span>
            <strong>{user.name}</strong>
            <span>{user.email}</span>
            <small className={`role-label role-label--${["admin","manager","supervisor","staff"].includes(user.role)?user.role:"other"}`}>{user.role}</small>
          </div>
        ))}
        {!userPager.pageItems.length&&<p>No users match your search and role filter.</p>}
      </div>
      <ListPagination page={userPager.page} pageSize={userPager.pageSize} total={userPager.total} onPageChange={userPager.setPage} onPageSizeChange={userPager.setPageSize}/>
      <SettingsDrawer
        open={open}
        title="Add user"
        description="Assign the user to a team and platform role."
        onClose={() => setOpen(false)}
      >
        <form className="settings-drawer-form" onSubmit={submit}>
          <label>
            <span>Full name</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label>
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            <span>Team</span>
            <select
              value={teamID}
              onChange={(e) => setTeamID(e.target.value)}
              required
            >
              <option value="">Select team</option>
              {teams.map((t) => (
                <option value={t.id} key={t.id}>
                  {t.name} — {t.division}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="supervisor">Supervisor</option>
              <option value="staff">Staff</option>
            </select>
          </label>
          {create.isError && (
            <p className="settings-error">{create.error.message}</p>
          )}
          <DrawerActions
            busy={create.isPending}
            disabled={!teamID}
            label="Save user"
            onCancel={() => setOpen(false)}
          />
        </form>
      </SettingsDrawer>
    </SettingsSection>
  );
}

export function TeamManagement({divisions,users,currentUserRole,onSaved}:{divisions:OrgDivision[];users:DirectoryUser[];currentUserRole:string;onSaved:()=>void}) {
  const [open,setOpen]=useState(false); const [name,setName]=useState(""); const [divisionIDs,setDivisionIDs]=useState<string[]>([]);const [color,setColor]=useState("#4774b8");const [icon,setIcon]=useState("👥"); const [memberIDs,setMemberIDs]=useState<string[]>([]); const [memberSearch,setMemberSearch]=useState(""); const [memberTeam,setMemberTeam]=useState<{id:string;name:string}|null>(null);const [editTeam,setEditTeam]=useState<(OrgTeam&{division:string})|null>(null);const [editName,setEditName]=useState("");const [editColor,setEditColor]=useState("#4774b8");const [editIcon,setEditIcon]=useState("👥");const [editDivisionIDs,setEditDivisionIDs]=useState<string[]>([]);
  const create=useMutation({mutationFn:()=>api<OrgTeam>("/api/v1/teams",{method:"POST",headers:createHeaders(),body:JSON.stringify({name:name.trim(),division_ids:divisionIDs,color,icon,member_ids:memberIDs})}),onSuccess:()=>{setName("");setDivisionIDs([]);setColor("#4774b8");setIcon("👥");setMemberIDs([]);setMemberSearch("");setOpen(false);onSaved()}});
  const edit=useMutation({mutationFn:async()=>{const team=await api<OrgTeam>(`/api/v1/teams/${editTeam?.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:editName.trim(),color:editColor,icon:editIcon})});await api(`/api/v1/teams/${editTeam?.id}/divisions`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({division_ids:editDivisionIDs})});return team},onSuccess:()=>{setEditTeam(null);onSaved()}});
  const saveMembers=useMutation({mutationFn:()=>api<{id:string;member_ids:string[]}>(`/api/v1/teams/${memberTeam?.id}/members`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({member_ids:memberIDs})}),onSuccess:()=>{setMemberTeam(null);setMemberIDs([]);setMemberSearch("");onSaved()}});
  const allTeams=[...new Map(divisions.flatMap(division=>division.teams).map(team=>[team.id,{...team,division:divisions.filter(division=>team.division_ids.includes(division.id)).map(division=>division.name).join(", "),members:users.filter(user=>team.member_ids.includes(user.id))}])).values()];
  const teamPager=usePagination(allTeams,10);
  const candidates=users.filter(user=>`${user.name} ${user.email}`.toLocaleLowerCase().includes(memberSearch.toLocaleLowerCase()));
  function toggleMember(id:string,checked:boolean){setMemberIDs(current=>checked?[...new Set([...current,id])]:current.filter(item=>item!==id))}
  function openEdit(team:OrgTeam&{division:string}){if(currentUserRole!=="admin")return;setEditTeam(team);setEditName(team.name);setEditColor(team.color);setEditIcon(team.icon);setEditDivisionIDs(team.division_ids)}
  function memberPicker(){return <fieldset className="team-member-picker"><legend>Members <small>{memberIDs.length} selected</small></legend><input value={memberSearch} onChange={event=>setMemberSearch(event.target.value)} placeholder="Search users..."/><div>{candidates.map(user=><label key={user.id}><input type="checkbox" checked={memberIDs.includes(user.id)} onChange={event=>toggleMember(user.id,event.target.checked)}/><span><i>{user.name.charAt(0).toUpperCase()}</i><span><strong>{user.name}</strong><small>{user.email} · {user.role}</small></span></span></label>)}{!candidates.length&&<p>No users match this search.</p>}</div></fieldset>}
  return <SettingsSection title="Teams" description="Manage independent teams, their participating divisions, and team members." action="Add team" onAction={()=>{setDivisionIDs([]);setMemberIDs([]);setMemberSearch("");setOpen(true)}}>
    <div className="team-settings-list">{teamPager.pageItems.map(team=><div className="team-settings-row" key={team.id}><span className="team-settings-mark" style={{background:`${team.color}18`,color:team.color}}>{team.icon}</span><div className="team-settings-info"><strong className={currentUserRole==="admin"?"is-editable":""} onDoubleClick={()=>openEdit(team)} onKeyDown={event=>{if(currentUserRole==="admin"&&event.key==="Enter")openEdit(team)}} tabIndex={currentUserRole==="admin"?0:undefined} role={currentUserRole==="admin"?"button":undefined} title={currentUserRole==="admin"?"Double-click to edit team":undefined}>{team.name}</strong><small>{team.division} · {team.members.length} member{team.members.length===1?"":"s"}</small><div className="team-member-list">{team.members.map(member=><span key={member.id} title={`${member.email} · ${member.role}`}><i>{member.name.charAt(0).toUpperCase()}</i>{member.name}</span>)}{!team.members.length&&<em>No members assigned</em>}</div></div><button type="button" className="manage-team-members" onClick={()=>{setMemberTeam({id:team.id,name:team.name});setMemberIDs(team.members.map(member=>member.id));setMemberSearch("")}}>Manage members</button></div>)}{!allTeams.length&&<p className="settings-empty">No teams have been created.</p>}</div><ListPagination page={teamPager.page} pageSize={teamPager.pageSize} total={teamPager.total} onPageChange={teamPager.setPage} onPageSizeChange={teamPager.setPageSize}/>
    <SettingsDrawer open={open} title="Add team" description="Create a team, link one or more divisions, and select its initial members." onClose={()=>setOpen(false)}><form className="settings-drawer-form" onSubmit={event=>{event.preventDefault();if(name.trim()&&divisionIDs.length&&icon.trim())create.mutate()}}><label><span>Team name</span><input autoFocus value={name} onChange={event=>setName(event.target.value)} placeholder="e.g. Cybersecurity" maxLength={100} required/></label><fieldset className="team-member-picker"><legend>Participating divisions <small>{divisionIDs.length} selected</small></legend><div>{divisions.map(division=><label key={division.id}><input type="checkbox" checked={divisionIDs.includes(division.id)} onChange={event=>setDivisionIDs(current=>event.target.checked?[...new Set([...current,division.id])]:current.filter(id=>id!==division.id))}/><span><i>{division.icon}</i><span><strong>{division.name}</strong><small>Division</small></span></span></label>)}</div></fieldset><div className="division-visual-fields"><label><span>Color</span><div className="division-color-input"><input type="color" value={color} onChange={event=>setColor(event.target.value)}/><code>{color}</code></div></label><fieldset><legend>Emoji icon</legend><div>{divisionIconOptions.map(option=><button type="button" className={icon===option?"selected":""} aria-label={`Use ${option} icon`} aria-pressed={icon===option} onClick={()=>setIcon(option)} key={option}>{option}</button>)}</div><label className="division-custom-icon"><span>Custom emoji</span><input value={icon} onChange={event=>setIcon(event.target.value)} placeholder="Type or paste an emoji" maxLength={16} required/></label></fieldset></div>{memberPicker()}{create.isError&&<p className="settings-error">{create.error.message}</p>}<DrawerActions busy={create.isPending} disabled={!name.trim()||!divisionIDs.length||!icon.trim()} label="Create team" onCancel={()=>setOpen(false)}/></form></SettingsDrawer>
    <SettingsDrawer open={!!editTeam} title={`Edit ${editTeam?.name??"team"}`} description="Update the team and its participating divisions." onClose={()=>setEditTeam(null)}><form className="settings-drawer-form" onSubmit={event=>{event.preventDefault();if(editName.trim()&&editIcon.trim()&&editDivisionIDs.length)edit.mutate()}}><label><span>Team name</span><input autoFocus value={editName} onChange={event=>setEditName(event.target.value)} maxLength={100} required/></label><fieldset className="team-member-picker"><legend>Participating divisions <small>{editDivisionIDs.length} selected</small></legend><div>{divisions.map(division=><label key={division.id}><input type="checkbox" checked={editDivisionIDs.includes(division.id)} onChange={event=>setEditDivisionIDs(current=>event.target.checked?[...new Set([...current,division.id])]:current.filter(id=>id!==division.id))}/><span><i>{division.icon}</i><span><strong>{division.name}</strong><small>Division</small></span></span></label>)}</div></fieldset><div className="division-visual-fields"><label><span>Color</span><div className="division-color-input"><input type="color" value={editColor} onChange={event=>setEditColor(event.target.value)}/><code>{editColor}</code></div></label><fieldset><legend>Emoji icon</legend><div>{divisionIconOptions.map(option=><button type="button" className={editIcon===option?"selected":""} aria-label={`Use ${option} icon`} aria-pressed={editIcon===option} onClick={()=>setEditIcon(option)} key={option}>{option}</button>)}</div><label className="division-custom-icon"><span>Custom emoji</span><input value={editIcon} onChange={event=>setEditIcon(event.target.value)} placeholder="Type or paste an emoji" maxLength={16} required/></label></fieldset></div>{edit.isError&&<p className="settings-error">{edit.error.message}</p>}<DrawerActions busy={edit.isPending} disabled={!editName.trim()||!editIcon.trim()||!editDivisionIDs.length} label="Save team" onCancel={()=>setEditTeam(null)}/></form></SettingsDrawer>
    <SettingsDrawer open={!!memberTeam} title={`Members · ${memberTeam?.name??"Team"}`} description="Select the users who belong to this team." onClose={()=>setMemberTeam(null)}><form className="settings-drawer-form" onSubmit={event=>{event.preventDefault();saveMembers.mutate()}}>{memberPicker()}{saveMembers.isError&&<p className="settings-error">{saveMembers.error.message}</p>}<DrawerActions busy={saveMembers.isPending} label="Save members" onCancel={()=>setMemberTeam(null)}/></form></SettingsDrawer>
  </SettingsSection>;
}export function DivisionManagement({
  divisions,
  users,
  currentUserRole,
  onSaved,
}: {
  divisions: OrgDivision[];
  users: DirectoryUser[];
  currentUserRole: string;
  onSaved: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [leadDivision, setLeadDivision] = useState<OrgDivision | null>(null);
  const [editDivision,setEditDivision]=useState<OrgDivision|null>(null);
  const [editName,setEditName]=useState("");const [editColor,setEditColor]=useState("#3b9a68");const [editIcon,setEditIcon]=useState("🏢");
  const [name, setName] = useState("");
  const [color,setColor]=useState("#3b9a68");
  const [icon,setIcon]=useState("🏢");
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [leadSearch, setLeadSearch] = useState("");
  const [memberDivision,setMemberDivision]=useState<OrgDivision|null>(null);const [divisionMemberIDs,setDivisionMemberIDs]=useState<string[]>([]);const [divisionMemberSearch,setDivisionMemberSearch]=useState("");
  const admins = users.filter((user) => user.role === "admin");
  const leadCandidates = users.filter(
    (user) =>
      user.role !== "admin" &&
      (user.name.toLocaleLowerCase().includes(leadSearch.toLocaleLowerCase()) ||
        user.email.toLocaleLowerCase().includes(leadSearch.toLocaleLowerCase())),
  );
  const create = useMutation({
    mutationFn: () =>
      api<OrgDivision>("/api/v1/divisions", {
        method: "POST",
        headers: createHeaders(),
        body: JSON.stringify({
          name: name.trim(),
          parent_division_id: null,
          color,
          icon,
        }),
      }),
    onSuccess: () => {
      setName("");
      setColor("#3b9a68");
      setIcon("🏢");
      setAddOpen(false);
      onSaved();
    },
  });
  const saveLeads = useMutation({
    mutationFn: () =>
      api<OrgDivision>(`/api/v1/divisions/${leadDivision?.id}/leads`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_ids: selectedLeads }),
      }),
    onSuccess: () => {
      setLeadDivision(null);
      onSaved();
    },
  });
  const edit=useMutation({mutationFn:()=>api<OrgDivision>(`/api/v1/divisions/${editDivision?.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:editName.trim(),color:editColor,icon:editIcon})}),onSuccess:()=>{setEditDivision(null);onSaved()}});
  const addMembers=useMutation({mutationFn:()=>api<{id:string;member_ids:string[]}>(`/api/v1/divisions/${memberDivision?.id}/members`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({member_ids:divisionMemberIDs})}),onSuccess:()=>{setMemberDivision(null);setDivisionMemberIDs([]);onSaved()}});
  function openMembers(division:OrgDivision){setMemberDivision(division);setDivisionMemberIDs(division.member_ids??[]);setDivisionMemberSearch("")}  function openLeads(division: OrgDivision) {
    setLeadSearch("");
    setSelectedLeads(division.lead_user_ids ?? []);
    setLeadDivision(division);
  }
  function openEdit(division:OrgDivision){if(currentUserRole!=="admin")return;setEditDivision(division);setEditName(division.name);setEditColor(division.color);setEditIcon(division.icon)}
  const divisionPager = usePagination(divisions, 10);
  return (
    <SettingsSection
      title="Divisions"
      description="Manage Division identity, direct members, and delegated leads independently from Teams."
      action="Add division"
      onAction={() => setAddOpen(true)}
    >
      <div className="division-settings-list">
        {divisionPager.pageItems.map((division) => {
          const explicit = users.filter((user) =>
            division.lead_user_ids?.includes(user.id),
          );
          return (
            <div className="division-settings-row" key={division.id}>
              <div className={`division-settings-title ${currentUserRole==="admin"?"is-editable":""}`} onDoubleClick={()=>openEdit(division)} onKeyDown={event=>{if(currentUserRole==="admin"&&event.key==="Enter")openEdit(division)}} tabIndex={currentUserRole==="admin"?0:undefined} role={currentUserRole==="admin"?"button":undefined} title={currentUserRole==="admin"?"Double-click to edit division":undefined}>
                <span style={{background:`${division.color}18`,color:division.color}}>{division.icon}</span>
                <div>
                  <strong>{division.name}</strong>
                  <small>{division.member_ids.length} direct member{division.member_ids.length === 1 ? "" : "s"}</small>
                </div>
              </div>
              <div className="division-team-chips">
                {users.filter(user=>division.member_ids.includes(user.id)).map(user=><span key={user.id}>{user.name}</span>)}
                {!division.member_ids.length&&<small>No direct members</small>}
              </div>
              <div className="division-responsible">
                <small>Responsible</small>
                <div>
                  {admins.map((user) => (
                    <span key={`admin-${user.id}`}>
                      {user.name} <em>Admin</em>
                    </span>
                  ))}
                  {explicit.map((user) => (
                    <span key={user.id}>
                      {user.name} <em>Lead</em>
                    </span>
                  ))}
                </div>
              </div>
<div className="division-row-actions"><button type="button" className="manage-leads-button" onClick={()=>openMembers(division)}>Manage members</button><button type="button" className="manage-leads-button" onClick={() => openLeads(division)}>Manage leads</button></div>
            </div>
          );
        })}
      </div>
      <SettingsDrawer
        open={addOpen}
        title="Add division"
        description="Create an independent Division. Team links are managed separately from the Teams tab."
        onClose={() => setAddOpen(false)}
      >
        <form
          className="settings-drawer-form"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <label>
            <span>Division name</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <div className="division-visual-fields">
            <label><span>Color</span><div className="division-color-input"><input type="color" value={color} onChange={event=>setColor(event.target.value)}/><code>{color}</code></div></label>
            <fieldset><legend>Emoji icon</legend><div>{divisionIconOptions.map(option=><button type="button" className={icon===option?"selected":""} aria-label={`Use ${option} icon`} aria-pressed={icon===option} onClick={()=>setIcon(option)} key={option}>{option}</button>)}</div><label className="division-custom-icon"><span>Custom emoji</span><input value={icon} onChange={event=>setIcon(event.target.value)} placeholder="Type or paste an emoji" maxLength={16} required/></label></fieldset>
          </div>
          {create.isError && (
            <p className="settings-error">{create.error.message}</p>
          )}
          <DrawerActions
            busy={create.isPending}
            disabled={!name.trim()}
            label="Save division"
            onCancel={() => setAddOpen(false)}
          />
        </form>
      </SettingsDrawer>
      <SettingsDrawer open={!!editDivision} title={`Edit ${editDivision?.name??"division"}`} description="Update the division name and visual identity." onClose={()=>setEditDivision(null)}><form className="settings-drawer-form" onSubmit={event=>{event.preventDefault();if(editName.trim())edit.mutate()}}><label><span>Division name</span><input autoFocus value={editName} onChange={event=>setEditName(event.target.value)} maxLength={100} required/></label><div className="division-visual-fields"><label><span>Color</span><div className="division-color-input"><input type="color" value={editColor} onChange={event=>setEditColor(event.target.value)}/><code>{editColor}</code></div></label><fieldset><legend>Emoji icon</legend><div>{divisionIconOptions.map(option=><button type="button" className={editIcon===option?"selected":""} aria-label={`Use ${option} icon`} aria-pressed={editIcon===option} onClick={()=>setEditIcon(option)} key={option}>{option}</button>)}</div><label className="division-custom-icon"><span>Custom emoji</span><input value={editIcon} onChange={event=>setEditIcon(event.target.value)} placeholder="Type or paste an emoji" maxLength={16} required/></label></fieldset></div>{edit.isError&&<p className="settings-error">{edit.error.message}</p>}<DrawerActions busy={edit.isPending} disabled={!editName.trim()||!editIcon.trim()} label="Save division" onCancel={()=>setEditDivision(null)}/></form></SettingsDrawer>
      <SettingsDrawer open={!!memberDivision} title={`Members · ${memberDivision?.name??"Division"}`} description="Select users who belong directly to this Division. Team membership is unaffected." onClose={()=>setMemberDivision(null)}><form className="settings-drawer-form" onSubmit={event=>{event.preventDefault();addMembers.mutate()}}><fieldset className="team-member-picker"><legend>Direct Division members <small>{divisionMemberIDs.length} selected</small></legend><input value={divisionMemberSearch} onChange={event=>setDivisionMemberSearch(event.target.value)} placeholder="Search users..."/><div>{users.filter(user=>`${user.name} ${user.email}`.toLowerCase().includes(divisionMemberSearch.toLowerCase())).map(user=><label key={user.id}><input type="checkbox" checked={divisionMemberIDs.includes(user.id)} onChange={event=>setDivisionMemberIDs(current=>event.target.checked?[...new Set([...current,user.id])]:current.filter(id=>id!==user.id))}/><span><i>{user.name.charAt(0).toUpperCase()}</i><span><strong>{user.name}</strong><small>{user.email} · {user.role}</small></span></span></label>)}</div></fieldset>{addMembers.isError&&<p className="settings-error">{addMembers.error.message}</p>}<DrawerActions busy={addMembers.isPending} label="Save Division members" onCancel={()=>setMemberDivision(null)}/></form></SettingsDrawer>      <SettingsDrawer
        open={!!leadDivision}
        title={`Manage ${leadDivision?.name ?? "division"} leads`}
        description="Admins are responsible by default. Select additional users who may add users to this division."
        onClose={() => setLeadDivision(null)}
      >
        <form
          className="settings-drawer-form"
          onSubmit={(e) => {
            e.preventDefault();
            saveLeads.mutate();
          }}
        >
          <div className="default-admin-note">
            <strong>Default administrators</strong>
            {admins.map((user) => (
              <span key={user.id}>{user.name}</span>
            ))}
          </div>
          <label>
            <span>Find a user</span>
            <input
              value={leadSearch}
              onChange={(event) => setLeadSearch(event.target.value)}
              placeholder="Search by name or email"
            />
          </label>
          <fieldset className="lead-user-list">
            <legend>Additional division leads</legend>
            {leadCandidates.map((user) => (
                <label key={user.id}>
                  <input
                    type="checkbox"
                    checked={selectedLeads.includes(user.id)}
                    onChange={(e) =>
                      setSelectedLeads((current) =>
                        e.target.checked
                          ? [...current, user.id]
                          : current.filter((id) => id !== user.id),
                      )
                    }
                  />
                  <span>
                    <strong>{user.name}</strong>
                    <small>
                      {user.role} · {user.email}
                    </small>
                  </span>
                </label>
              ))}
            {!leadCandidates.length && (
              <p className="lead-empty-state">
                {users.some((user) => user.role !== "admin")
                  ? "No users match this search."
                  : "No eligible users yet. Add a non-admin user from Users & Roles first."}
              </p>
            )}
          </fieldset>
          {saveLeads.isError && (
            <p className="settings-error">{saveLeads.error.message}</p>
          )}
          <DrawerActions
            busy={saveLeads.isPending}
            label="Save division leads"
            onCancel={() => setLeadDivision(null)}
          />
        </form>
      </SettingsDrawer>
    </SettingsSection>
  );
}

function GithubIntegrationSettings({value,onSaved}:{value:GithubIntegrationSetting;onSaved:()=>void}){
 const[form,setForm]=useState(value);const[accessToken,setAccessToken]=useState("");const[copied,setCopied]=useState(false);useEffect(()=>setForm(value),[value]);
 const save=useMutation({mutationFn:()=>api<GithubIntegrationSetting>("/api/v1/settings/github-integration",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({is_enabled:form.is_enabled,api_base_url:form.api_base_url.trim(),access_token:accessToken.trim()||undefined})}),onSuccess:next=>{setForm(next);setAccessToken("");onSaved()}});
 const tokenReady=value.access_token_configured||!!accessToken.trim();
 const copyWebhook=async()=>{await navigator.clipboard.writeText(`${window.location.origin}${form.webhook_url}`);setCopied(true);window.setTimeout(()=>setCopied(false),1600)};
 return <article className="settings-section ai-integration-settings github-integration-settings"><header><div><h3>GitHub Integration</h3><p>Connect GitHub repositories to projects and receive signed commit and pull-request webhooks.</p></div><button className="settings-add-button" disabled={save.isPending||!form.api_base_url.trim()||form.is_enabled&&!tokenReady} onClick={()=>save.mutate()}>{save.isPending?"Saving...":"Save settings"}</button></header><label className="integration-enable"><input type="checkbox" checked={form.is_enabled} onChange={event=>setForm(current=>({...current,is_enabled:event.target.checked}))}/><span><strong>Enable GitHub integration</strong><small>Repository linking remains unavailable until the integration is enabled and an access token is configured.</small></span></label><div className="integration-form-grid"><label className="wide"><span>GitHub API URL</span><input type="url" value={form.api_base_url} onChange={event=>setForm(current=>({...current,api_base_url:event.target.value}))} placeholder="https://api.github.com" required/></label><label className="wide"><span>Personal access token</span><input type="password" autoComplete="new-password" value={accessToken} onChange={event=>setAccessToken(event.target.value)} placeholder={form.access_token_configured?"Configured · leave blank to keep":"Enter GitHub access token"}/><small>Use the minimum repository permissions required. The token is encrypted and never returned by the API.</small></label><label className="wide github-webhook-field"><span>Webhook URL</span><div><input readOnly value={`${window.location.origin}${form.webhook_url}`}/><button type="button" onClick={copyWebhook}>{copied?"Copied":"Copy"}</button></div><small>Add this URL to the repository webhook settings and use the secret generated when linking a project.</small></label></div>{save.isError&&<p className="settings-error">{save.error.message}</p>}<p className="secret-note">GitHub webhook payloads are limited, signature-verified, deduplicated by delivery ID, and processed within the linked tenant project.</p></article>
}
function AiIntegrationSettings({value,onSaved}:{value:AiIntegrationSetting;onSaved:()=>void}){
 const[form,setForm]=useState(value);const[apiKey,setApiKey]=useState("");
 useEffect(()=>setForm(value),[value]);
 const save=useMutation({mutationFn:()=>api<AiIntegrationSetting>("/api/v1/settings/ai-integration",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,api_key:apiKey.trim()||undefined})}),onSuccess:next=>{setForm(next);setApiKey("");onSaved()}});
 const set=<K extends keyof AiIntegrationSetting>(key:K,next:AiIntegrationSetting[K])=>setForm(current=>({...current,[key]:next}));
 return <article className="settings-section ai-integration-settings"><header><div><h3>AI Integration</h3><p>Connect an AI provider to analyze project tracking data and prepare client reports.</p></div><button className="settings-add-button" disabled={save.isPending||form.is_enabled&&!apiKey.trim()&&!form.api_key_configured} onClick={()=>save.mutate()}>{save.isPending?"Saving...":"Save settings"}</button></header><label className="integration-enable"><input type="checkbox" checked={form.is_enabled} onChange={event=>set("is_enabled",event.target.checked)}/><span><strong>Enable AI integration</strong><small>AI processing remains disabled until this setting is enabled.</small></span></label><div className="integration-form-grid"><label><span>Provider</span><select value={form.provider} onChange={event=>set("provider",event.target.value as AiIntegrationSetting["provider"])}><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="gemini">Google Gemini</option><option value="custom">Custom compatible API</option></select></label><label><span>Model</span><input value={form.model??""} onChange={event=>set("model",event.target.value)} placeholder="e.g. project-report-model"/></label><label className="wide"><span>API key</span><input type="password" autoComplete="new-password" value={apiKey} onChange={event=>setApiKey(event.target.value)} placeholder={form.api_key_configured?"Configured · leave blank to keep":"Enter provider API key"}/></label>{form.provider==="custom"&&<label className="wide"><span>Base URL</span><input type="url" value={form.base_url??""} onChange={event=>set("base_url",event.target.value)} placeholder="https://ai.example.com/v1"/></label>}<label><span>Project data access</span><select value={form.project_data_access} onChange={event=>set("project_data_access",event.target.value as AiIntegrationSetting["project_data_access"])}><option value="summary">Project summary only</option><option value="summary_and_activities">Summary and activities</option><option value="full_project">Full project data</option></select></label><label><span>Report frequency</span><select value={form.report_frequency} onChange={event=>set("report_frequency",event.target.value as AiIntegrationSetting["report_frequency"])}><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="on_completion">On project completion</option></select></label></div><label className="integration-enable"><input type="checkbox" checked={form.auto_report_enabled} onChange={event=>set("auto_report_enabled",event.target.checked)}/><span><strong>Generate reports automatically</strong><small>Create draft reports according to the selected frequency.</small></span></label><label className="ai-delivery-mode"><span>Generated report handling</span><select value={form.delivery_mode} onChange={event=>set("delivery_mode",event.target.value as AiIntegrationSetting["delivery_mode"])}><option value="review">Require human review</option><option value="send_to_client">Send directly to client</option></select><small>Human review is recommended before any client delivery.</small></label><p className="secret-note">API keys are encrypted at rest, never returned after saving, and excluded from activity logs.</p>{save.isError&&<p className="settings-error">{save.error.message}</p>}</article>
}
function NotificationDeliverySettings({value,onSaved}:{value:NotificationDeliverySetting;onSaved:()=>void}){
 const[tab,setTab]=useState<"events"|"engine">("events");const[form,setForm]=useState(value);const[ecopaSecret,setEcopaSecret]=useState("");const[smtpPassword,setSmtpPassword]=useState("");useEffect(()=>setForm(value),[value]);
 const set=<K extends keyof NotificationDeliverySetting>(key:K,next:NotificationDeliverySetting[K])=>setForm(current=>({...current,[key]:next}));
 const toggleEvent=(eventName:string,checked:boolean)=>set("event_rules",{...form.event_rules,project_member:checked?[...new Set([...form.event_rules.project_member,eventName])]:form.event_rules.project_member.filter(item=>item!==eventName)});
 const save=useMutation({mutationFn:()=>api<NotificationDeliverySetting>("/api/v1/settings/notification-delivery",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,ecopa_secret:ecopaSecret||null,smtp_password:smtpPassword||null})}),onSuccess:()=>{setEcopaSecret("");setSmtpPassword("");onSaved()}});
 const eventOptions=[{id:"project.created",label:"Project Created"},{id:"project.updated",label:"Project Updated"},{id:"project.member_assigned",label:"Project Member Assigned"},{id:"project.review",label:"Project on Review"},{id:"project.review_approved",label:"Review Approved"},{id:"project.revision_requested",label:"Revision Requested"},{id:"project.finished",label:"Project Finish"},{id:"project.overdue",label:"Project Overdue"},{id:"task.assigned",label:"Activity Assigned"},{id:"task.due_soon",label:"Activity Due Soon"},{id:"task.overdue",label:"Activity Overdue"},{id:"task.completed",label:"Activity Completed"},{id:"evidence.added",label:"Completion Evidence Added"},{id:"report.ready",label:"Report Ready"}];
 return <article className="settings-section notification-settings"><header><div><h3>Notification Delivery</h3><p>Choose notification events and the delivery engine used by Palemo.</p></div><button className="settings-add-button" disabled={save.isPending} onClick={()=>save.mutate()}>{save.isPending?"Saving...":"Save settings"}</button></header><div className="notification-inner-tabs"><button type="button" className={tab==="events"?"active":""} onClick={()=>setTab("events")}>Event</button><button type="button" className={tab==="engine"?"active":""} onClick={()=>setTab("engine")}>Engine</button></div>{tab==="events"?<section className="notification-event-rules"><div><strong>Send Project Member when</strong><small>Every selected event sends a notification to the users assigned as project members.</small></div><div>{eventOptions.map(item=><label key={item.id}><input type="checkbox" checked={form.event_rules.project_member.includes(item.id)} onChange={event=>toggleEvent(item.id,event.target.checked)}/><span>{item.label}</span></label>)}</div></section>:<><div className="delivery-provider-options"><button type="button" className={form.provider==="ecopa"?"selected":""} onClick={()=>set("provider","ecopa")}><strong>Ecopa Notification</strong><small>SMTP authentication and delivery are managed by the Ecopa ecosystem.</small></button><button type="button" className={form.provider==="palemo_smtp"?"selected":""} onClick={()=>set("provider","palemo_smtp")}><strong>Palemo SMTP</strong><small>Palemo connects directly to a dedicated SMTP server.</small></button></div>{form.provider==="ecopa"?<div className="integration-form-grid"><label><span>Ecopa API URL *</span><input value={form.ecopa_base_url??""} onChange={event=>set("ecopa_base_url",event.target.value)} placeholder="https://ecopa.example.com/api/notifications"/></label><label><span>Client ID *</span><input value={form.ecopa_client_id??""} onChange={event=>set("ecopa_client_id",event.target.value)}/></label><label className="wide"><span>Authentication secret</span><input type="password" value={ecopaSecret} onChange={event=>setEcopaSecret(event.target.value)} placeholder={form.ecopa_secret_configured?"Configured · leave blank to keep":"Enter Ecopa secret"}/></label></div>:<div className="integration-form-grid"><label><span>SMTP host *</span><input value={form.smtp_host??""} onChange={event=>set("smtp_host",event.target.value)} placeholder="smtp.example.com"/></label><label><span>Port</span><input type="number" min={1} max={65535} value={form.smtp_port} onChange={event=>set("smtp_port",Number(event.target.value))}/></label><label><span>Encryption</span><select value={form.smtp_encryption} onChange={event=>set("smtp_encryption",event.target.value as NotificationDeliverySetting["smtp_encryption"])}><option value="tls">TLS</option><option value="ssl">SSL</option><option value="none">None</option></select></label><label><span>Username</span><input value={form.smtp_username??""} onChange={event=>set("smtp_username",event.target.value)}/></label><label><span>Password</span><input type="password" value={smtpPassword} onChange={event=>setSmtpPassword(event.target.value)} placeholder={form.smtp_password_configured?"Configured · leave blank to keep":"SMTP password"}/></label><label><span>From email *</span><input type="email" value={form.smtp_from_email??""} onChange={event=>set("smtp_from_email",event.target.value)}/></label><label className="wide"><span>From name</span><input value={form.smtp_from_name??""} onChange={event=>set("smtp_from_name",event.target.value)}/></label></div>}<p className="secret-note">Secrets are encrypted at rest and are never returned by the API after saving.</p></>}{save.isError&&<p className="settings-error">{save.error.message}</p>}</article>
}
const webhookEvents=["project.created","project.status_changed","task.completed","milestone.completed","report.ready"] as const;
function WebhookSettings({items,onSaved}:{items:WebhookSetting[];onSaved:()=>void}){
 const[url,setUrl]=useState("");const[events,setEvents]=useState<string[]>(["project.created"]);const[createdSecrets,setCreatedSecrets]=useState<Array<{event:string;signing_secret:string}>>([]);
 const webhookPager=usePagination(items,10);
 const create=useMutation({mutationFn:()=>api<Array<WebhookSetting&{signing_secret:string}>>("/api/v1/settings/webhooks",{method:"POST",headers:createHeaders(),body:JSON.stringify({target_url:url.trim(),events})}),onSuccess:data=>{setCreatedSecrets(data.map(item=>({event:item.event,signing_secret:item.signing_secret})));setUrl("");onSaved()}});
 const update=useMutation({mutationFn:({id,is_active}:{id:string;is_active:boolean})=>api<WebhookSetting>(`/api/v1/settings/webhooks/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({is_active})}),onSuccess:onSaved});
 const test=useMutation({mutationFn:(id:string)=>api<{delivery_id:string;status:string}>(`/api/v1/settings/webhooks/${id}/tests`,{method:"POST",headers:createHeaders()}),onSuccess:onSaved});
 return <article className="settings-section webhook-settings"><header><div><h3>Webhooks</h3><p>Send signed Palemo events to external systems through the existing delivery outbox.</p></div></header><form className="webhook-create" onSubmit={event=>{event.preventDefault();if(url.trim()&&events.length)create.mutate()}}><label><span>Target URL</span><input type="url" value={url} onChange={event=>setUrl(event.target.value)} placeholder="https://hooks.example.com/palemo" required/></label><fieldset><legend>Events</legend><div>{webhookEvents.map(item=><label key={item}><input type="checkbox" checked={events.includes(item)} onChange={event=>setEvents(current=>event.target.checked?[...current,item]:current.filter(value=>value!==item))}/><span>{item}</span></label>)}</div></fieldset><button type="submit" disabled={create.isPending||!url.trim()||!events.length}>{create.isPending?"Creating...":"+ Add webhook"}</button></form>{createdSecrets.length>0&&<div className="webhook-secret"><strong>Copy signing secrets now</strong><small>They will not be shown again.</small>{createdSecrets.map(item=><code key={item.event}>{item.event}: {item.signing_secret}</code>)}</div>}<div className="webhook-list">{webhookPager.pageItems.map(item=><div key={item.id}><div><strong>{item.event}</strong><code>{item.target_url}</code><small>{item.deliveries} deliveries · {item.consecutive_failures} consecutive failures</small></div><span className={item.is_active?"active":"disabled"}>{item.is_active?"Active":"Disabled"}</span><button type="button" onClick={()=>test.mutate(item.id)} disabled={test.isPending}>Test</button><button type="button" onClick={()=>update.mutate({id:item.id,is_active:!item.is_active})}>{item.is_active?"Disable":"Enable"}</button></div>)}{!items.length&&<p>No webhooks configured.</p>}</div><ListPagination page={webhookPager.page} pageSize={webhookPager.pageSize} total={webhookPager.total} onPageChange={webhookPager.setPage} onPageSizeChange={webhookPager.setPageSize}/>{(create.isError||update.isError||test.isError)&&<p className="settings-error">{create.error?.message??update.error?.message??test.error?.message}</p>}<p className="secret-note">Deliveries use HMAC-SHA256 signing and retry asynchronously through the Palemo webhook outbox.</p></article>
}
function GeneralSettings({value,onSaved}:{value:GeneralSetting;onSaved:()=>void}) {
  const cache=useQueryClient();const [limit,setLimit]=useState(value.knowledge_visible_type_limit);const [tabLimit,setTabLimit]=useState(value.workspace_tab_limit);const [themeTone,setThemeTone]=useState(value.theme_tone);const [customMode,setCustomMode]=useState<"solid"|"gradient">(value.custom_theme_mode);const [customPrimary,setCustomPrimary]=useState(value.custom_theme_primary);const [customSecondary,setCustomSecondary]=useState(value.custom_theme_secondary);const [customAngle,setCustomAngle]=useState(value.custom_theme_angle);const[country,setCountry]=useState(value.country_code||"ID");const[format,setFormat]=useState(value.date_format||"d F Y");const toneOptions=[["forest","Forest"],["ocean","Ocean"],["indigo","Indigo"],["terracotta","Terracotta"],["slate","Slate"],["gradient_aurora","Aurora"],["gradient_ocean","Ocean Glow"],["gradient_sunset","Sunset"],["custom","Custom"]] as const;const countries=[["ID","Indonesia"],["MY","Malaysia"],["SG","Singapore"],["PH","Philippines"],["TH","Thailand"],["VN","Vietnam"],["AU","Australia"],["JP","Japan"],["GB","United Kingdom"],["US","United States"]] as const;
  const refresh=()=>{onSaved();cache.invalidateQueries({queryKey:["dashboard-summary"]});cache.invalidateQueries({queryKey:["projects"]});cache.invalidateQueries({queryKey:["tasks"]});cache.invalidateQueries({queryKey:["knowledge"]});cache.invalidateQueries({queryKey:["users"]});cache.invalidateQueries({queryKey:["divisions"]})};
  const save=useMutation({mutationFn:()=>api<GeneralSetting>("/api/v1/settings/general",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({knowledge_visible_type_limit:limit,workspace_tab_limit:tabLimit,theme_tone:themeTone,custom_theme_mode:customMode,custom_theme_primary:customPrimary,custom_theme_secondary:customSecondary,custom_theme_angle:customAngle,country_code:country,date_format:format})}),onSuccess:()=>{cache.invalidateQueries({queryKey:["calendar-holidays"]});onSaved()}});
  const load=useMutation({mutationFn:()=>api<{records:number}>("/api/v1/settings/simulation",{method:"POST",headers:createHeaders()}),onSuccess:refresh});
  const remove=useMutation({mutationFn:()=>api<{records:number}>("/api/v1/settings/simulation",{method:"DELETE"}),onSuccess:refresh});
  const busy=load.isPending||remove.isPending;
  return <article className="settings-section general-settings"><header><div><h3>General</h3><p>Configure shared workspace display preferences.</p></div><button className="settings-add-button" disabled={save.isPending||limit===value.knowledge_visible_type_limit&&tabLimit===value.workspace_tab_limit&&themeTone===value.theme_tone&&customMode===value.custom_theme_mode&&customPrimary===value.custom_theme_primary&&customSecondary===value.custom_theme_secondary&&customAngle===value.custom_theme_angle&&country===value.country_code&&format===value.date_format} onClick={()=>save.mutate()}>{save.isPending?"Saving...":"Save changes"}</button></header><div className="general-setting-row"><div><strong>Maximum open workspace tabs</strong><p>Maximum tabs retained per user. Opening another tab automatically closes the oldest one.</p></div><label><span>Open tabs</span><input type="number" min={1} max={12} value={tabLimit} onChange={event=>setTabLimit(Math.max(1,Math.min(12,Number(event.target.value))))}/></label></div><div className="general-setting-row theme-setting-row"><div><strong>Application color tone</strong><p>Choose a solid or gradient tone for navigation and primary application accents.</p></div><div className="theme-tone-options">{toneOptions.map(([id,label])=><button type="button" className={themeTone===id?"selected":""} onClick={()=>setThemeTone(id)} key={id}><i className={`theme-preview ${id}`}/><span>{label}</span></button>)}</div></div>{themeTone==="custom"&&<div className="custom-theme-editor"><div className="custom-theme-preview" style={{background:customMode==="gradient"?`linear-gradient(${customAngle}deg,${customPrimary},${customSecondary})`:customPrimary}}><span>Live tone preview</span></div><div className="custom-theme-controls"><div className="custom-theme-mode"><button type="button" className={customMode==="solid"?"active":""} onClick={()=>setCustomMode("solid")}>Solid</button><button type="button" className={customMode==="gradient"?"active":""} onClick={()=>setCustomMode("gradient")}>Gradient</button></div><label><span>Primary color</span><input type="color" value={customPrimary} onChange={event=>setCustomPrimary(event.target.value)}/><code>{customPrimary}</code></label>{customMode==="gradient"&&<><label><span>Secondary color</span><input type="color" value={customSecondary} onChange={event=>setCustomSecondary(event.target.value)}/><code>{customSecondary}</code></label><label className="custom-angle"><span>Gradient angle</span><input type="range" min={0} max={360} value={customAngle} onChange={event=>setCustomAngle(Number(event.target.value))}/><code>{customAngle}°</code></label></>}</div></div>}<div className="general-setting-row calendar-settings-continuation"><div><strong>Country</strong><p>Public holidays from this location are unavailable for activity scheduling. Indonesia is the default.</p></div><label><span>Location</span><select value={country} onChange={event=>setCountry(event.target.value)}>{countries.map(([code,name])=><option value={code} key={code}>{name}</option>)}</select></label></div><div className="general-setting-row calendar-settings-continuation"><div><strong>Default date format</strong><p>Controls how dates are presented throughout the workspace.</p></div><label><span>Format</span><select value={format} onChange={event=>setFormat(event.target.value)}><option value="d F Y">d F Y — 30 July 2026</option><option value="d M Y">d M Y — 30 Jul 2026</option><option value="Y-m-d">Y-m-d — 2026-07-30</option><option value="d/m/Y">d/m/Y — 30/07/2026</option><option value="m/d/Y">m/d/Y — 07/30/2026</option></select></label></div><div className="general-setting-row simulation-setting"><div><strong>Fake data simulation</strong><p>Load sample projects, activities, checklists, and knowledge entries to preview the application. Generated records are tracked separately from real data.</p>{value.simulation_loaded&&<span className="simulation-status"><i/> Active · {value.simulation_records} fake records</span>}</div><div className="simulation-actions"><button disabled={busy||value.simulation_loaded} onClick={()=>load.mutate()}>{load.isPending?"Loading...":"Load fake data simulation"}</button><button className="danger" disabled={busy||!value.simulation_loaded} onClick={()=>{if(window.confirm("Delete all fake simulation data? Real workspace data will not be affected."))remove.mutate()}}>{remove.isPending?"Deleting...":"Delete fake data simulation"}</button></div></div>{(save.isError||load.isError||remove.isError)&&<p className="settings-error">{save.error?.message??load.error?.message??remove.error?.message}</p>}</article>;
}
function KnowledgeTypes({items,currentUserRole,visibleLimit,onGeneralSaved,onSaved}:{items:KnowledgeTypeSetting[];currentUserRole:string;visibleLimit:number;onGeneralSaved:()=>void;onSaved:()=>void}) {
  const [open,setOpen]=useState(false); const [label,setLabel]=useState(""); const [description,setDescription]=useState(""); const [icon,setIcon]=useState("📚"); const [color,setColor]=useState("#3b9a68");
  const [ordered,setOrdered]=useState(items); const [draggingID,setDraggingID]=useState<string|null>(null); const [overID,setOverID]=useState<string|null>(null);
  const [editing,setEditing]=useState<KnowledgeTypeSetting|null>(null); const [editLabel,setEditLabel]=useState(""); const [editDescription,setEditDescription]=useState(""); const [editIcon,setEditIcon]=useState("📚"); const [editColor,setEditColor]=useState("#3b9a68"); const [limit,setLimit]=useState(visibleLimit);
  useEffect(()=>setOrdered(items),[items]); useEffect(()=>setLimit(visibleLimit),[visibleLimit]);
  const typePager=usePagination(ordered,10);
  const update=useMutation({mutationFn:({id,payload}:{id:string;payload:Partial<KnowledgeTypeSetting>})=>api<KnowledgeTypeSetting>(`/api/v1/settings/knowledge-types/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}),onSuccess:onSaved});
  const reorder=useMutation({mutationFn:(next:KnowledgeTypeSetting[])=>Promise.all(next.map((item,index)=>api<KnowledgeTypeSetting>(`/api/v1/settings/knowledge-types/${item.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({sort_order:(index+1)*10})}))),onSuccess:onSaved});
  const create=useMutation({mutationFn:()=>api<KnowledgeTypeSetting>("/api/v1/settings/knowledge-types",{method:"POST",headers:createHeaders(),body:JSON.stringify({label:label.trim(),description:description.trim()||null,icon:icon.trim()||null,color})}),onSuccess:()=>{setLabel("");setDescription("");setIcon("📚");setColor("#3b9a68");setOpen(false);onSaved()}});
  const edit=useMutation({mutationFn:()=>api<KnowledgeTypeSetting>(`/api/v1/settings/knowledge-types/${editing?.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({label:editLabel.trim(),description:editDescription.trim()||null,icon:editIcon.trim()||null,color:editColor})}),onSuccess:()=>{setEditing(null);onSaved()}});
  const saveLimit=useMutation({mutationFn:(nextLimit:number)=>api<GeneralSetting>("/api/v1/settings/general",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({knowledge_visible_type_limit:nextLimit})}),onSuccess:onGeneralSaved});
  const autoSaveLimit=()=>{if(!saveLimit.isPending&&limit!==visibleLimit)saveLimit.mutate(limit)};
  function beginEdit(item:KnowledgeTypeSetting){setEditing(item);setEditLabel(item.label);setEditDescription(item.description??"");setEditIcon(item.icon??"📚");setEditColor(item.color)}
  function drop(targetID:string){if(!draggingID||draggingID===targetID){setDraggingID(null);setOverID(null);return}const next=[...ordered];const from=next.findIndex(item=>item.id===draggingID);const to=next.findIndex(item=>item.id===targetID);if(from<0||to<0)return;const[moved]=next.splice(from,1);next.splice(to,0,moved);setOrdered(next);setDraggingID(null);setOverID(null);reorder.mutate(next)}
  return <article className="settings-section kb-type-settings">
    <header><div><h3>Knowledge Types</h3><p>Manage categories and their visibility in Knowledge Management.</p></div><button className="settings-add-button create-action" onClick={()=>setOpen(true)}>+ Add Knowledge Type</button></header>
    <div className="general-setting-row kb-visible-limit"><div><strong>Visible Knowledge Base types</strong><p>Number of types shown directly in Knowledge Management. Remaining types appear under More.</p></div><label><input type="number" aria-label="Visible Knowledge Base types" min={1} max={10} value={limit} disabled={saveLimit.isPending} onChange={event=>setLimit(Math.max(1,Math.min(10,Number(event.target.value))))} onBlur={autoSaveLimit} onKeyDown={event=>{if(event.key==="Enter")event.currentTarget.blur()}}/>{(saveLimit.isPending||saveLimit.isError)&&<small aria-live="polite">{saveLimit.isPending?"Saving...":"Could not save"}</small>}</label></div>
    <div className={`kb-type-list ${reorder.isPending?"is-saving-order":""}`}>{typePager.pageItems.map((item,index)=>{const canEdit=currentUserRole==="admin"||(!item.is_system&&currentUserRole==="manager");return <div draggable={currentUserRole==="admin"&&!reorder.isPending} className={`${draggingID===item.id?"dragging":""} ${overID===item.id?"drag-over":""}`} onDragStart={event=>{setDraggingID(item.id);event.dataTransfer.effectAllowed="move"}} onDragEnter={()=>setOverID(item.id)} onDragOver={event=>{if(currentUserRole==="admin"){event.preventDefault();event.dataTransfer.dropEffect="move"}}} onDrop={event=>{event.preventDefault();if(currentUserRole==="admin")drop(item.id)}} onDragEnd={()=>{setDraggingID(null);setOverID(null)}} key={item.id}>
      <span className="kb-drag-handle" aria-hidden="true"><i/><i/><i/></span><span className="kb-icon" style={{background:`${item.color}18`,color:item.color}}>{item.icon??"📚"}</span><div><span className="kb-type-name-row"><strong>{item.label}{item.is_system&&<em>Default</em>}</strong>{canEdit&&<button type="button" className="kb-edit-button" aria-label={`Edit ${item.label}`} title="Edit type" draggable={false} onMouseDown={event=>event.stopPropagation()} onClick={()=>beginEdit(item)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.2-1 10.7-10.7a2.1 2.1 0 0 0-3-3L5.2 16Z"/><path d="m14.8 6.5 3 3"/></svg></button>}</span><small>{item.description}</small><code>{item.slug}</code>
      {editing?.id===item.id&&<form className={`kb-edit-popover ${index>=ordered.length-2?"open-up":""}`} onSubmit={event=>{event.preventDefault();if(editLabel.trim())edit.mutate()}} onClick={event=>event.stopPropagation()}><header><strong>Edit Knowledge Type</strong><button type="button" onClick={()=>setEditing(null)} aria-label="Close edit popup">×</button></header><label><span>Type name</span><input autoFocus value={editLabel} onChange={event=>setEditLabel(event.target.value)} maxLength={50} required/></label><label><span>Description</span><input value={editDescription} onChange={event=>setEditDescription(event.target.value)} maxLength={160}/></label><label><span>Emoji or icon</span><input value={editIcon} onChange={event=>setEditIcon(event.target.value)} placeholder="📚" maxLength={16}/></label><label className="kb-edit-color"><span>Color</span><input type="color" value={editColor} onChange={event=>setEditColor(event.target.value)}/></label>{edit.isError&&<p className="settings-error">{edit.error.message}</p>}<footer><button type="submit" className="primary" disabled={edit.isPending||!editLabel.trim()}>{edit.isPending?"Saving...":"Save"}</button></footer></form>}</div>
      <label className="kb-type-toggle"><input type="checkbox" aria-label={`${item.is_active?"Hide":"Activate"} ${item.label}`} checked={item.is_active} disabled={!canEdit||update.isPending||reorder.isPending} onChange={event=>update.mutate({id:item.id,payload:{is_active:event.target.checked}})}/><span className="kb-toggle-switch" aria-hidden="true"/><span>{item.is_active?"Active":"Hidden"}</span></label></div>})}</div>
    <ListPagination page={typePager.page} pageSize={typePager.pageSize} total={typePager.total} onPageChange={typePager.setPage} onPageSizeChange={typePager.setPageSize}/>
    {reorder.isPending&&<p className="kb-order-status">Saving order...</p>}{(update.isError||create.isError||reorder.isError||saveLimit.isError)&&<p className="settings-error">{update.error?.message??create.error?.message??reorder.error?.message??saveLimit.error?.message}</p>}
    <SettingsDrawer open={open} title="Add Knowledge Type" description="Create a reusable category for organizing knowledge entries." onClose={()=>setOpen(false)}><form className="settings-drawer-form" onSubmit={event=>{event.preventDefault();if(label.trim())create.mutate()}}><label><span>Type name</span><input autoFocus value={label} onChange={event=>setLabel(event.target.value)} placeholder="e.g. Playbooks" required maxLength={50}/></label><label><span>Description</span><input value={description} onChange={event=>setDescription(event.target.value)} placeholder="What belongs in this category?" maxLength={160}/></label><label><span>Emoji or icon</span><input value={icon} onChange={event=>setIcon(event.target.value)} placeholder="📚" maxLength={16}/></label><label><span>Color</span><input type="color" value={color} onChange={event=>setColor(event.target.value)}/></label><DrawerActions busy={create.isPending} disabled={!label.trim()} label="Create Knowledge Type" onCancel={()=>setOpen(false)}/></form></SettingsDrawer>
  </article>;
}function SettingsSection({
  title,
  description,
  action,
  onAction,
  children,
}: {
  title: string;
  description: string;
  action: string;
  onAction: () => void;
  children: React.ReactNode;
}) {
  return (
    <article className="settings-section">
      <header>
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <button className="settings-add-button create-action" onClick={onAction}>
          + {action}
        </button>
      </header>
      {children}
    </article>
  );
}
function SettingsDrawer({
  open,
  title,
  description,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <button
        type="button"
        aria-label="Close add form"
        className={`settings-drawer-backdrop ${open ? "open" : ""}`}
        onClick={onClose}
      />
      <aside
        className={`settings-drawer ${open ? "open" : ""}`}
        aria-hidden={!open}
      >
        <header>
          <div>
            <span className="eyebrow">New item</span>
            <h3>{title}</h3>
            <p>{description}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close form">
            ×
          </button>
        </header>
        {children}
      </aside>
    </>
  );
}
function DrawerActions({
  busy,
  disabled,
  label,
  onCancel,
}: {
  busy: boolean;
  disabled?: boolean;
  label: string;
  onCancel: () => void;
}) {
  return (
    <div className="drawer-actions">
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
      <button className="drawer-save" disabled={busy || disabled}>
        {busy ? "Saving…" : label}
      </button>
    </div>
  );
}
