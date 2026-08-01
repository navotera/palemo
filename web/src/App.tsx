import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExecutionWorkspace } from "./ExecutionWorkspace";
import { SupervisionPanel } from "./SupervisionPanel";
import { ApiDocumentationPage } from "./ApiDocumentationPage";
import { KnowledgePanel } from "./KnowledgePanel";
import {
  DivisionKPI,
  DivisionProjectLoad,
  type DivisionPerformanceData,
} from "./DivisionPerformance";
import { ExecutiveProjects } from "./ExecutiveProjects";
import { ProjectCreateForm } from "./ProjectCreateForm";
import { OrganizationPage } from "./OrganizationPage";
import { SettingsPage } from "./SettingsPage";
type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  tenant: string;
  team: string;
  team_id: string;
  division_id: string | null;
  division_ids: string[];
};
type Summary = {
  tenant_name: string;
  teams: number;
  users: number;
  projects: number;
  open_tasks: number;
  divisions: DivisionPerformanceData[];
};
type Envelope<T> = { data: T; meta: { request_id: string }; errors: null };
type View =
  | "overview"
  | "projects"
  | "organization"
  | "operations"
  | "knowledge"
  | "documentation"
  | "settings"
  | "project-create"
  | "project-edit"
  | "project-detail";
type WorkspaceTab = {
  id: string;
  view: View;
  label: string;
  projectID?: string;
  knowledgePage?: "list" | "new";
};
type GeneralWorkspaceSettings = {
  workspace_tab_limit: number;
  theme_tone: string;
  custom_theme_mode: "solid" | "gradient";
  custom_theme_primary: string;
  custom_theme_secondary: string;
  custom_theme_angle: number;
};
type WorkspaceTabState = { tabs: WorkspaceTab[]; active_tab_id: string | null };
const tabLabels: Record<View, string> = {
  overview: "Executive Overview",
  projects: "Project Portfolio",
  organization: "Organization",
  operations: "Operations",
  knowledge: "Knowledge Library",
  documentation: "API Documentation",
  settings: "Settings",
  "project-create": "New Project - draft",
  "project-edit": "Edit Project",
  "project-detail": "Project Detail",
};
type NavIconName =
  | "overview"
  | "projects"
  | "organization"
  | "operations"
  | "knowledge"
  | "documentation"
  | "settings";
const viewIcons: Record<View, NavIconName> = {
  overview: "overview",
  projects: "projects",
  organization: "organization",
  operations: "operations",
  knowledge: "knowledge",
  documentation: "documentation",
  settings: "settings",
  "project-create": "projects",
  "project-edit": "projects",
  "project-detail": "projects",
};
function NavIcon({ name }: { name: NavIconName }) {
  const paths: Record<NavIconName, React.ReactNode> = {
    overview: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
    projects: (
      <>
        <path d="M3 7.5h18v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
        <path d="M3 8V6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2" />
      </>
    ),
    organization: (
      <>
        <circle cx="12" cy="5" r="2.5" />
        <circle cx="5" cy="18" r="2.5" />
        <circle cx="19" cy="18" r="2.5" />
        <path d="M12 7.5v4M5 15.5v-2h14v2" />
      </>
    ),
    operations: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" />
      </>
    ),
    knowledge: (
      <>
        <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H11v18H6.5A2.5 2.5 0 0 0 4 22Z" />
        <path d="M20 4.5A2.5 2.5 0 0 0 17.5 2H13v18h4.5A2.5 2.5 0 0 1 20 22Z" />
      </>
    ),
    documentation: (
      <>
        <path d="M8 8 4 12l4 4M16 8l4 4-4 4M14 4l-4 16" />
      </>
    ),
    settings: (
      <>
        <path d="M4 6h8M16 6h4M4 12h3M11 12h9M4 18h10M18 18h2" />
        <circle cx="14" cy="6" r="2" />
        <circle cx="9" cy="12" r="2" />
        <circle cx="16" cy="18" r="2" />
      </>
    ),
  };
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "include", ...init });
  const payload = (await response.json()) as Envelope<T>;
  if (!response.ok)
    throw new Error(
      response.status === 401 ? "UNAUTHORIZED" : "REQUEST_FAILED",
    );
  return payload.data;
}
export function App() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>("overview");
  const [selectedProject, setSelectedProject] = useState("");
  const [docsOpen, setDocsOpen] = useState(false);
  const [tabs, setTabs] = useState<WorkspaceTab[]>([
    { id: "overview", view: "overview", label: "Executive Overview" },
  ]);
  const [activeTabID, setActiveTabID] = useState("overview");
  const [tabsReady, setTabsReady] = useState(false);
  const [uiMode, setUiMode] = useState<"light" | "dark">("light");
  const [profileOpen, setProfileOpen] = useState(false);
  const [draggingTabID, setDraggingTabID] = useState<string | null>(null);
  const [knowledgeFocusMode, setKnowledgeFocusMode] = useState(false);
  const [focusSidebarOpen, setFocusSidebarOpen] = useState(false);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  useEffect(() => {
    if (!knowledgeFocusMode) setFocusSidebarOpen(false);
  }, [knowledgeFocusMode]);
  const user = useQuery({
    queryKey: ["current-user"],
    queryFn: () => api<User>("/api/v1/auth/me"),
    retry: false,
  });
  useEffect(() => {
    if (!user.data?.id) return;
    setSidebarHidden(
      window.sessionStorage.getItem(`npms.sidebar-hidden:${user.data.id}`) ===
        "1",
    );
  }, [user.data?.id]);
  useEffect(() => {
    if (!user.data?.id) return;
    window.sessionStorage.setItem(
      `npms.sidebar-hidden:${user.data.id}`,
      sidebarHidden ? "1" : "0",
    );
  }, [sidebarHidden, user.data?.id]);
  const generalSettings = useQuery({
    queryKey: ["settings", "general"],
    queryFn: () => api<GeneralWorkspaceSettings>("/api/v1/settings/general"),
    enabled: user.isSuccess,
  });
  const storedTabs = useQuery({
    queryKey: ["workspace-tabs", user.data?.id],
    queryFn: () => api<WorkspaceTabState>("/api/v1/settings/workspace-tabs"),
    enabled: user.isSuccess,
  });
  const summary = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => api<Summary>("/api/v1/dashboard/summary"),
    enabled: user.isSuccess,
  });
  const signIn = useMutation({
    mutationFn: () =>
      api<{ user: User }>("/api/v1/auth/development-session", {
        method: "POST",
      }),
    onSuccess: () => queryClient.invalidateQueries(),
  });
  const signOut = useMutation({
    mutationFn: () =>
      api<{ signed_out: boolean }>("/api/v1/auth/logout", { method: "POST" }),
    onSuccess: () => queryClient.clear(),
  });
  useEffect(() => {
    if (!user.data) return;
    const stored = window.localStorage.getItem(
      `palemo-ui-mode:${user.data.id}`,
    );
    if (stored === "dark" || stored === "light") setUiMode(stored);
    else if (window.matchMedia?.("(prefers-color-scheme: dark)").matches)
      setUiMode("dark");
  }, [user.data?.id]);
  function toggleUiMode() {
    setUiMode((current) => {
      const next = current === "dark" ? "light" : "dark";
      if (user.data)
        window.localStorage.setItem(`palemo-ui-mode:${user.data.id}`, next);
      return next;
    });
  }
  useEffect(() => {
    if (tabsReady || !storedTabs.data) return;
    const restored = (storedTabs.data.tabs ?? []).filter(
      (tab) => tab.view !== "operations",
    );
    if (restored.length) {
      setTabs(restored);
      const active =
        restored.find((tab) => tab.id === storedTabs.data?.active_tab_id) ??
        restored[restored.length - 1];
      setActiveTabID(active.id);
      setView(active.view);
      setSelectedProject(active.projectID ?? "");
    }
    setTabsReady(true);
  }, [storedTabs.data, tabsReady]);
  useEffect(() => {
    if (!tabsReady || !user.data) return;
    const timer = window.setTimeout(() => {
      api<WorkspaceTabState>("/api/v1/settings/workspace-tabs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tabs, active_tab_id: activeTabID }),
      }).catch(() => undefined);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [tabs, activeTabID, tabsReady, user.data?.id]);
  useEffect(() => {
    const restore = (event: PopStateEvent) => {
      const historicalTab = event.state?.palemo?.tab as
        WorkspaceTab | undefined;
      if (!historicalTab?.view) return;
      const existing = tabs.find((tab) => tab.id === historicalTab.id);
      if (existing) activateTab(existing, "none");
      else addTab(historicalTab, "none");
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [tabs, activeTabID]);
  useEffect(() => {
    if (!tabsReady || window.history.state?.palemo?.tab) return;
    const active = tabs.find((tab) => tab.id === activeTabID);
    if (!active) return;
    window.history.replaceState(
      { ...window.history.state, palemo: { tab: active } },
      "",
    );
  }, [tabsReady, tabs, activeTabID]);
  if (user.isPending) return <div className="loading">Opening NPMSâ€¦</div>;
  if (user.isError)
    return (
      <main className="signin-shell">
        <section className="signin-card">
          <div className="brand-mark">N</div>
          <span className="eyebrow">NPMS workspace</span>
          <h1>Run work with clarity.</h1>
          <p>
            Enter the local development workspace to manage projects, teams, and
            operational activity.
          </p>
          <button
            className="primary-button"
            onClick={() => signIn.mutate()}
            disabled={signIn.isPending}
          >
            {signIn.isPending
              ? "Preparing workspaceâ€¦"
              : "Enter development workspace"}
          </button>
        </section>
        <aside className="signin-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="art-copy">
            <strong>Direction</strong>
            <strong>Focus</strong>
            <strong>Delivery</strong>
          </div>
        </aside>
      </main>
    );
  const divisions = summary.data?.divisions ?? [];
  const activeProjects = divisions.reduce((n, d) => n + d.active + d.lagged, 0);
  const laggedProjects = divisions.reduce((n, d) => n + d.lagged, 0);
  const closedProjects = divisions.reduce((n, d) => n + d.closed, 0);
  function activateTab(
    tab: WorkspaceTab,
    historyMode: "push" | "replace" | "none" = "push",
  ) {
    setActiveTabID(tab.id);
    setView(tab.view);
    setSelectedProject(tab.projectID ?? "");
    if (historyMode === "none") return;
    const state = { ...window.history.state, palemo: { tab } };
    if (historyMode === "replace") window.history.replaceState(state, "");
    else if (window.history.state?.palemo?.tab?.id !== tab.id)
      window.history.pushState(state, "");
  }
  function addTab(
    tab: WorkspaceTab,
    historyMode: "push" | "replace" | "none" = "push",
  ) {
    setTabs((current) =>
      [tab, ...current.filter((item) => item.id !== tab.id)].slice(
        0,
        generalSettings.data?.workspace_tab_limit ?? 8,
      ),
    );
    activateTab(tab, historyMode);
  }
  function openTab(
    next: View,
    options?: { projectID?: string; knowledgePage?: "list" | "new" },
  ) {
    const unique = options?.knowledgePage === "new";
    const existing = !unique
      ? tabs.find(
          (tab) =>
            tab.view === next &&
            (!["project-detail", "project-edit"].includes(next) ||
              tab.projectID === options?.projectID) &&
            (next !== "knowledge" || tab.knowledgePage !== "new"),
        )
      : undefined;
    if (existing) {
      activateTab(existing);
      return;
    }
    addTab({
      id: crypto.randomUUID(),
      view: next,
      label:
        next === "knowledge" && options?.knowledgePage === "new"
          ? "New Knowledge - draft"
          : tabLabels[next],
      projectID: options?.projectID,
      knowledgePage: options?.knowledgePage,
    });
  }
  function reorderTab(targetID: string) {
    if (!draggingTabID || draggingTabID === targetID) return;
    setTabs((current) => {
      const next = [...current];
      const from = next.findIndex((tab) => tab.id === draggingTabID);
      const to = next.findIndex((tab) => tab.id === targetID);
      if (from < 0 || to < 0) return current;
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setDraggingTabID(null);
  }
  function closeTab(id: string) {
    setTabs((current) => {
      if (current.length === 1) return current;
      const index = current.findIndex((tab) => tab.id === id);
      const next = current.filter((tab) => tab.id !== id);
      if (id === activeTabID) {
        const fallback = next[Math.max(0, index - 1)] ?? next[0];
        activateTab(fallback, "replace");
      }
      return next;
    });
  }
  const openProject = (id: string) =>
    openTab("project-detail", { projectID: id });
  const editProject = (id: string) =>
    openTab("project-edit", { projectID: id });
  const navigate = (next: View) =>
    openTab(next, next === "knowledge" ? { knowledgePage: "list" } : undefined);
  const openKnowledgeDraft = () => {
    setFocusSidebarOpen(false);
    openTab("knowledge", { knowledgePage: "new" });
  };
  const openProjectKnowledgeDraft = (projectID: string) => {
    setFocusSidebarOpen(false);
    openTab("knowledge", { knowledgePage: "new", projectID });
  };
  const updateKnowledgeDraftTitle = (title: string) =>
    setTabs((current) =>
      current.map((tab) =>
        tab.id === activeTabID
          ? { ...tab, label: title.trim() || "New Knowledge - draft" }
          : tab,
      ),
    );

  const titles: Record<View, [string, string]> = {
    overview: [
      "Executive overview",
      "Organization performance and management priorities",
    ],
    projects: ["Project portfolio", "Project health across divisions"],
    organization: ["Organization", "Manage divisions and teams"],
    operations: ["Operational workspace", "SOP and automation tools"],
    knowledge: ["Knowledge Library", ""],
    documentation: ["Documentation", "API documentation"],
    settings: ["Settings", "Workspace master data and access"],
    "project-create": ["New project", "Create and assign a project workspace"],
    "project-edit": ["Edit project", "Update project workspace"],
    "project-detail": ["Project detail", "Task execution and workflow"],
  };
  const customTheme = generalSettings.data;
  const customBackground =
    customTheme?.custom_theme_mode === "gradient"
      ? `linear-gradient(${customTheme.custom_theme_angle}deg,${customTheme.custom_theme_primary},${customTheme.custom_theme_secondary})`
      : customTheme?.custom_theme_primary;
  const themeContrast = (colors: string[]) => {
    const luminance =
      colors.reduce((total, color) => {
        const rgb = [1, 3, 5]
          .map((index) => parseInt(color.slice(index, index + 2), 16) / 255)
          .map((value) =>
            value <= 0.03928
              ? value / 12.92
              : Math.pow((value + 0.055) / 1.055, 2.4),
          );
        return total + 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
      }, 0) / colors.length;
    return luminance > 0.43 ? "#172019" : "#ffffff";
  };
  const customContrast = customTheme
    ? themeContrast(
        customTheme.custom_theme_mode === "gradient"
          ? [
              customTheme.custom_theme_primary,
              customTheme.custom_theme_secondary,
            ]
          : [customTheme.custom_theme_primary],
      )
    : "#ffffff";
  const activeWorkspaceTab = tabs.find((tab) => tab.id === activeTabID);
  const knowledgeCreateMode =
    view === "knowledge" && activeWorkspaceTab?.knowledgePage === "new";
  const breadcrumbItems: { label: string; action?: () => void }[] =
    view === "project-edit"
      ? [
          { label: "Workspace", action: () => navigate("overview") },
          { label: "Project Portfolio", action: () => navigate("projects") },
          {
            label: "Project Detail",
            action: () => openProject(selectedProject),
          },
          { label: "Edit Project" },
        ]
      : view === "project-detail"
        ? [
            { label: "Workspace", action: () => navigate("overview") },
            { label: "Project Portfolio", action: () => navigate("projects") },
            { label: "Project Detail" },
          ]
        : view === "project-create"
          ? [
              { label: "Workspace", action: () => navigate("overview") },
              {
                label: "Project Portfolio",
                action: () => navigate("projects"),
              },
              { label: "New Project" },
            ]
          : view === "knowledge" && activeWorkspaceTab?.knowledgePage === "new"
            ? [
                { label: "Workspace", action: () => navigate("overview") },
                {
                  label: "Knowledge Library",
                  action: () => navigate("knowledge"),
                },
                { label: "New Knowledge" },
              ]
            : [
                {
                  label: "Workspace",
                  action:
                    view === "overview"
                      ? undefined
                      : () => navigate("overview"),
                },
                { label: titles[view][0] },
              ];
  const sidebarUsesFocusMode = knowledgeFocusMode || knowledgeCreateMode;
  const sidebarVisible = sidebarUsesFocusMode
    ? focusSidebarOpen
    : !sidebarHidden;
  return (
    <div
      className={`app-shell ${knowledgeFocusMode ? "knowledge-focus-mode" : ""} ${knowledgeCreateMode ? "knowledge-create-mode" : ""} ${focusSidebarOpen ? "focus-sidebar-open" : ""} ${!sidebarVisible ? "sidebar-hidden" : ""} ${sidebarVisible ? "sidebar-menu-open" : ""}`}
      data-theme-tone={generalSettings.data?.theme_tone ?? "forest"}
      data-ui-mode={uiMode}
      style={
        {
          "--custom-theme-background": customBackground ?? "#1b5338",
          "--custom-theme-primary":
            customTheme?.custom_theme_primary ?? "#1b5338",
          "--custom-theme-on-primary": customContrast,
        } as React.CSSProperties
      }
    >
      <button
        type="button"
        className="focus-sidebar-toggle"
        aria-label={sidebarVisible ? "Hide main menu" : "Show main menu"}
        aria-expanded={sidebarVisible}
        onClick={() =>
          sidebarUsesFocusMode
            ? setFocusSidebarOpen((current) => !current)
            : setSidebarHidden((current) => !current)
        }
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark small">N</div>
          <div>
            <strong>NPMS</strong>
            <span>Management system</span>
          </div>
        </div>
        <nav aria-label="Main navigation">
          <button
            className={view === "overview" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("overview")}
          >
            <NavIcon name="overview" />
            Executive overview
          </button>
          <button
            className={
              view === "projects" ||
              view === "project-create" ||
              view === "project-edit" ||
              view === "project-detail"
                ? "nav-item active"
                : "nav-item"
            }
            onClick={() => navigate("projects")}
          >
            <NavIcon name="projects" />
            Project portfolio
          </button>
          <button
            className={view === "knowledge" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("knowledge")}
          >
            <NavIcon name="knowledge" />
            Knowledge Library
          </button>
          <button
            className={view === "organization" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("organization")}
          >
            <NavIcon name="organization" />
            Organization
          </button>
          <div className="nav-group">
            <button
              className={
                view === "documentation" ? "nav-item active" : "nav-item"
              }
              aria-expanded={docsOpen}
              onClick={() => {
                setDocsOpen(!docsOpen);
                if (!docsOpen) navigate("documentation");
              }}
            >
              <NavIcon name="documentation" />
              Documentation <b>{docsOpen ? "-" : "+"}</b>
            </button>
            {docsOpen && (
              <div className="nav-submenu">
                <button
                  className={view === "documentation" ? "active" : ""}
                  onClick={() => navigate("documentation")}
                >
                  API
                </button>
              </div>
            )}
          </div>
          <button
            className={view === "settings" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("settings")}
          >
            <NavIcon name="settings" />
            Settings
          </button>
        </nav>
        <div className="sidebar-foot">
          <span className="status-dot" />
          Live organizational data
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <nav className="breadcrumb" aria-label="Breadcrumb">
            {breadcrumbItems.map((item, index) => (
              <span key={`${item.label}-${index}`}>
                {index > 0 && <i aria-hidden="true">/</i>}
                {item.action ? (
                  <button type="button" onClick={item.action}>
                    {item.label}
                  </button>
                ) : (
                  <b aria-current="page">{item.label}</b>
                )}
              </span>
            ))}
          </nav>
          <div className="topbar-actions">
            <button
              className="notification-button"
              type="button"
              aria-label="Notifications"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
              </svg>
              <span className="notification-indicator" />
            </button>
            <div className="user-menu" tabIndex={0}>
              <div className="avatar">{user.data.name.charAt(0)}</div>
              <div>
                <strong>{user.data.name}</strong>
                <span>
                  {user.data.role} · {user.data.team}
                </span>
              </div>
              <svg
                className="user-menu-chevron"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="m7 10 5 5 5-5" />
              </svg>
              <div className="user-dropdown">
                <button type="button" onClick={() => setProfileOpen(true)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="8" r="3.5" />
                    <path d="M5 21a7 7 0 0 1 14 0" />
                  </svg>
                  <div>
                    <span>User Profile</span>
                    <small>Account details</small>
                  </div>
                </button>
                <button type="button" onClick={toggleUiMode}>
                  {uiMode === "dark" ? (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="12" cy="12" r="4" />
                      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" />
                    </svg>
                  )}
                  <div>
                    <span>
                      {uiMode === "dark" ? "Light Mode" : "Dark Mode"}
                    </span>
                    <small>
                      {uiMode === "dark"
                        ? "Use light appearance"
                        : "Use dark appearance"}
                    </small>
                  </div>
                </button>
                <button
                  type="button"
                  className="signout"
                  onClick={() => signOut.mutate()}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5M14 8l4 4-4 4M8 12h10" />
                  </svg>
                  <div>
                    <span>Sign out</span>
                    <small>End this session</small>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </header>
        <div
          className="workspace-tabs"
          role="tablist"
          aria-label="Open workspace pages"
        >
          {tabs.map((tab) => (
            <button
              type="button"
              role="tab"
              draggable
              aria-selected={tab.id === activeTabID}
              className={`${tab.id === activeTabID ? "active" : ""} ${draggingTabID === tab.id ? "dragging" : ""}`}
              onDragStart={(event) => {
                setDraggingTabID(tab.id);
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                event.preventDefault();
                reorderTab(tab.id);
              }}
              onDragEnd={() => setDraggingTabID(null)}
              onClick={() => activateTab(tab)}
              key={tab.id}
            >
              <NavIcon name={viewIcons[tab.view]} />
              <span>{tab.label}</span>
              {tabs.length > 1 && (
                <i
                  role="button"
                  aria-label={`Close ${tab.label}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    closeTab(tab.id);
                  }}
                >
                  x
                </i>
              )}
            </button>
          ))}
        </div>
        {view === "overview" && (
          <>
            <section className="metric-grid" aria-label="Executive metrics">
              <article className="metric-card mint">
                <span>Active projects</span>
                <strong>{activeProjects}</strong>
                <small>Across all divisions</small>
              </article>
              <article className="metric-card blue">
                <span>Projects completed</span>
                <strong>{closedProjects}</strong>
                <small>This portfolio snapshot</small>
              </article>
              <article className="metric-card amber">
                <span>Projects at risk</span>
                <strong>{laggedProjects}</strong>
                <small>Overdue unfinished work</small>
              </article>
              <DivisionKPI divisions={divisions} />
            </section>
            <section className="content-grid executive-grid">
              <DivisionProjectLoad divisions={divisions} />
              <ExecutiveProjects divisions={divisions} onOpen={openProject} />
              <SupervisionPanel />
            </section>
          </>
        )}
        {view === "projects" && (
          <section className="content-grid">
            <ExecutiveProjects
              divisions={divisions}
              onOpen={openProject}
              onCreate={() => navigate("project-create")}
              full
            />
          </section>
        )}
        {view === "project-create" && (
          <section className="project-create-page">
            <ProjectCreateForm
              divisions={divisions}
              onCancel={() => navigate("projects")}
              onCreated={openProject}
            />
          </section>
        )}
        {view === "project-edit" && (
          <section className="project-create-page">
            <ProjectCreateForm
              divisions={divisions}
              projectID={selectedProject}
              onCancel={() => openProject(selectedProject)}
              onCreated={openProject}
            />
          </section>
        )}
        {view === "project-detail" && (
          <section className="content-grid">
            <ExecutionWorkspace
              teamID={user.data.team_id}
              projectID={selectedProject}
              onBack={() => navigate("projects")}
              onEdit={() => editProject(selectedProject)}
              onCreateKnowledge={openProjectKnowledgeDraft}
            />
          </section>
        )}
        {view === "organization" && <OrganizationPage currentUserRole={user.data.role} />}
        {view === "knowledge" && (
          <section className="content-grid knowledge-view">
            <KnowledgePanel
              key={activeTabID}
              initialPage={
                tabs.find((tab) => tab.id === activeTabID)?.knowledgePage ??
                "list"
              }
              onOpenNew={openKnowledgeDraft}
              onBackToList={() => navigate("knowledge")}
              onDraftTitleChange={updateKnowledgeDraftTitle}
              focusMode={knowledgeFocusMode}
              onFocusModeChange={setKnowledgeFocusMode}
              sourceProjectID={
                tabs.find((tab) => tab.id === activeTabID)?.projectID
              }
              currentUserRole={user.data.role}
              currentUserID={user.data.id}
              currentUserDivisionID={user.data.division_id}
              accessibleDivisionIDs={user.data.division_ids ?? []}
            />
          </section>
        )}
        {view === "documentation" && <ApiDocumentationPage />}
        {view === "settings" && (
          <SettingsPage
            divisions={divisions}
            currentUserRole={user.data.role}
          />
        )}
        {profileOpen && (
          <>
            <button
              type="button"
              className="profile-modal-backdrop"
              aria-label="Close profile"
              onClick={() => setProfileOpen(false)}
            />
            <section
              className="profile-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="profile-modal-title"
            >
              <button
                type="button"
                className="profile-modal-close"
                onClick={() => setProfileOpen(false)}
              >
                x
              </button>
              <div className="profile-modal-avatar">
                {user.data.name.charAt(0)}
              </div>
              <span className="eyebrow">User profile</span>
              <h2 id="profile-modal-title">{user.data.name}</h2>
              <dl>
                <div>
                  <dt>Email</dt>
                  <dd>{user.data.email}</dd>
                </div>
                <div>
                  <dt>Role</dt>
                  <dd>{user.data.role}</dd>
                </div>
                <div>
                  <dt>Team</dt>
                  <dd>{user.data.team}</dd>
                </div>
                <div>
                  <dt>Tenant</dt>
                  <dd>{user.data.tenant}</dd>
                </div>
              </dl>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
