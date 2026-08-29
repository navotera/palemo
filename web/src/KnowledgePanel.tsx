import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import "./knowledge.css";
import "./knowledge-notion-view.css";
import "./knowledge-tree-preview.css";
import { ListPagination, usePagination } from "./Pagination";
import type { KnowledgeRichEditorHandle } from "./KnowledgeRichEditor";
import { countMarkdownWords } from "./markdownMetrics";
const KnowledgeRichEditor = lazy(() =>
  import("./KnowledgeRichEditor").then((module) => ({
    default: module.KnowledgeRichEditor,
  })),
);
type Workspace = { id: string; name: string; description: string | null };
type Division = { id: string; name: string; color?: string; icon?: string; member_ids?: string[] };
type Team = { id: string; name: string; division_id?: string | null; color?: string; member_ids?: string[] };
type DirectoryUser = { id: string; name: string };
type ExternalResource = {
  id: string;
  url: string;
  type: "url" | "google_docs";
  label: string;
};
type Doc = {
  id: string;
  workspace_id: string;
  parent_page_id?: string;
  title: string;
  content: string;
  tags: string[] | string;
  created_at?: string;
  updated_at: string;
  related_project_id?: string | null;
  related_project_name?: string | null;
  accessible_division_ids?: string[] | string;
  author_id?: string;
  author_name?: string | null;
  last_updated_by_name?: string | null;
  version_history?: VersionHistoryEntry[];
  kind?: string;
  publication_status?: "draft" | "published";
  knowledge_types?: string[] | string;
  external_resources?: ExternalResource[] | string;
  cover_source?: "upload" | "url" | null;
  cover_url?: string | null;
  accessible_team_ids?: string[] | string;
  accessible_user_ids?: string[] | string;
  accessible_editor_user_ids?: string[] | string;
};
type VersionHistoryEntry = {
  id: string;
  action: string;
  created_at: string;
  actor_name?: string | null;
  title?: string | null;
  content?: string | null;
};
type Envelope<T> = {
  data: T;
  meta?: { request_id?: string };
  errors: null | Array<{ message: string }>;
};
type GeneralSettings = { knowledge_visible_type_limit: number; date_format?: string };
type KnowledgeView = "list" | "notion" | "tree";
type KnowledgeCollection = "drafts" | "personal" | "category" | "recents" | "most-viewed";
type KnowledgeTreeOrder = "most-read" | "recent-edit" | "title";
type KnowledgeReadCounts = Record<string, number>;
type DocumentTab = {
  id: string;
  label: string;
  content: string;
};
const MAX_DOCUMENT_TABS = 20;
type KnowledgeType = {
  id: string;
  slug: string;
  label: string;
  description: string;
  icon: string | null;
  color: string;
  is_active: boolean;
  sort_order: number;
};
type SourceProject = {
  id: string;
  name: string;
  status: string;
  project_type?: string;
  tags?: string[];
  created_by_name?: string | null;
  metadata?: Record<string, unknown>;
};
const fallbackKinds = [
  { id: "wiki", label: "Wiki", color: "#3b9a68", icon: "📖" },
  { id: "meetings", label: "Meetings", color: "#4774b8", icon: "🗓️" },
  { id: "decisions", label: "Decisions", color: "#b47a32", icon: "⚖️" },
  { id: "lessons", label: "Lessons learned", color: "#7c5dba", icon: "💡" },
];
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "include", ...init });
  let body: Envelope<T>;
  try {
    body = (await response.json()) as Envelope<T>;
  } catch {
    throw new KnowledgeApiError("Server returned an invalid response.", response.status);
  }
  if (!response.ok) {
    throw new KnowledgeApiError(
      body.errors?.[0]?.message ?? "Request failed",
      response.status,
      body.meta?.request_id,
    );
  }
  return body.data;
}

class KnowledgeApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly requestID?: string,
  ) {
    super(message);
    this.name = "KnowledgeApiError";
  }
}

type AutosaveErrorDetails = {
  message: string;
  status?: number;
  requestID?: string;
  operation: string;
  endpoint: string;
  occurredAt: Date;
};
export function KnowledgePanel({
  initialPage = "list",
  onOpenNew,
  onBackToList,
  onDraftTitleChange,
  onKnowledgeTitleChange,
  focusMode,
  onFocusModeChange,
  sourceProjectID,
  currentUserRole,
  currentUserID,
  currentUserDivisionID,
  accessibleDivisionIDs,
  initialCollection = "category",
}: {
  initialPage?: "list" | "new";
  onOpenNew?: () => void;
  onBackToList?: () => void;
  onDraftTitleChange?: (title: string) => void;
  onKnowledgeTitleChange?: (title: string) => void;
  focusMode: boolean;
  onFocusModeChange: (focused: boolean) => void;
  sourceProjectID?: string;
  currentUserRole: string;
  currentUserID: string;
  currentUserDivisionID?: string | null;
  accessibleDivisionIDs: string[];
  initialCollection?: "category" | "personal";
}) {
  const cache = useQueryClient();
  const knowledgeEditorRef = useRef<KnowledgeRichEditorHandle | null>(null);
  const autosaveDraftRef = useRef<{ id: string; kind: string } | null>(null);
  const autosaveKeyRef = useRef(crypto.randomUUID());
  const autosaveRunningRef = useRef(false);
  const autosaveWordCountRef = useRef(0);
  const autosaveMetadataSignatureRef = useRef("");
  const autosaveLatestRef = useRef<() => Promise<void>>(async () => {});
  const [autosaveStatus, setAutosaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [autosavedAt, setAutosavedAt] = useState<Date | null>(null);
  const [autosaveError, setAutosaveError] = useState<AutosaveErrorDetails | null>(null);
  const [showAutosaveError, setShowAutosaveError] = useState(false);
  const [kind, setKind] = useState("wiki");
  const [divisionFilter, setDivisionFilter] = useState("all");
  const [showPrivateContent, setShowPrivateContent] = useState(false);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<KnowledgeView>(() => {
    if (typeof window === "undefined") return "list";
    const stored = localStorage.getItem("npms:knowledge-view");
    return stored === "notion" || stored === "tree" ? stored : "list";
  });
  const [knowledgeCollection, setKnowledgeCollection] =
    useState<KnowledgeCollection>(initialCollection);
  const [addOpen, setAddOpen] = useState(initialPage === "new");
  const [newTypes, setNewTypes] = useState<string[]>(["wiki"]);
  const [newWorkspace, setNewWorkspace] = useState("");
  const [newRelatedProjectID, setNewRelatedProjectID] = useState(sourceProjectID ?? "");
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [activeTocIndex, setActiveTocIndex] = useState(0);
  const [inlineTocOpen, setInlineTocOpen] = useState(true);
  const [documentTabs, setDocumentTabs] = useState<DocumentTab[]>(() => [
    { id: crypto.randomUUID(), label: "Tab 1", content: "" },
  ]);
  const [documentTabsCollapsed, setDocumentTabsCollapsed] = useState(false);
  const [leftSidebarView, setLeftSidebarView] = useState<"toc" | "history">("toc");
  const [versionMenuOpenID, setVersionMenuOpenID] = useState<string | null>(null);
  const [versionActionMessage, setVersionActionMessage] = useState("");
  const [versionHistoryItems, setVersionHistoryItems] = useState<VersionHistoryEntry[]>([]);
  const [activeVersionID, setActiveVersionID] = useState("current");
  const [currentVersionDisplayAt, setCurrentVersionDisplayAt] = useState<string | null>(null);
  const [activeDocumentTabID, setActiveDocumentTabID] = useState<string | null>(null);
  const [editingDocumentTabID, setEditingDocumentTabID] = useState<string | null>(null);
  const [newTags, setNewTags] = useState<string[]>([]);
  const defaultDivisionIDs =
    currentUserRole === "admin" || !currentUserDivisionID
      ? []
      : [currentUserDivisionID];
  const [newDivisionIDs, setNewDivisionIDs] =
    useState<string[]>(defaultDivisionIDs);
  const [tagDraft, setTagDraft] = useState("");
  const [addingType, setAddingType] = useState(false);
  const [typeLabel, setTypeLabel] = useState("");
  const [typeIcon, setTypeIcon] = useState("📚");
  const [typeColor, setTypeColor] = useState("#3b9a68");
  const [resourceUrl, setResourceUrl] = useState("");
  const [resourceError, setResourceError] = useState("");
  const [externalResources, setExternalResources] = useState<
    ExternalResource[]
  >([]);
  const [coverSource, setCoverSource] = useState<"upload" | "url">("upload");
  const [coverUrl, setCoverUrl] = useState("");
  const [coverUploadStatus, setCoverUploadStatus] = useState<"idle" | "uploading">("idle");
  const [coverError, setCoverError] = useState("");
  const [newTeamIDs, setNewTeamIDs] = useState<string[]>([]);
  const [newUserIDs, setNewUserIDs] = useState<string[]>([]);
  const [newEditorUserIDs, setNewEditorUserIDs] = useState<string[]>([]);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareTab, setShareTab] = useState<"users" | "divisions" | "teams">("users");
  const [shareUserInitial, setShareUserInitial] = useState<string | null>(null);
  const [shareShowSelected, setShareShowSelected] = useState(false);
  const [selected, setSelected] = useState<Doc | null>(null);
  const [editingKnowledge, setEditingKnowledge] = useState<Doc | null>(null);
  const [lastUpdatedByName, setLastUpdatedByName] = useState("You");
  const knowledgeDetailHistoryRef = useRef(false);
  const canEditKnowledge =
    !editingKnowledge ||
    currentUserRole === "admin" ||
    currentUserRole === "manager" ||
    editingKnowledge.author_id === currentUserID ||
    tags(editingKnowledge.accessible_editor_user_ids ?? []).includes(currentUserID);
  const canShareKnowledge =
    !editingKnowledge ||
    currentUserRole === "admin" ||
    editingKnowledge.author_id === currentUserID;
  const sharePayload = canShareKnowledge
    ? { accessible_division_ids: newDivisionIDs, accessible_team_ids: newTeamIDs, accessible_user_ids: newUserIDs, accessible_editor_user_ids: newEditorUserIDs }
    : {};
  const clearShareSelection = () => {
    if (shareTab === "users") setNewUserIDs([]);
    if (shareTab === "users") setNewEditorUserIDs([]);
    if (shareTab === "divisions") setNewDivisionIDs([]);
    if (shareTab === "teams") setNewTeamIDs([]);
  };
  const toggleShareUser = (id: string, checked: boolean) => {
    if (checked) {
      setNewUserIDs((current) => current.filter((currentID) => currentID !== id));
      setNewEditorUserIDs((current) => current.filter((currentID) => currentID !== id));
      return;
    }
    setNewUserIDs((current) => current.includes(id) ? current : [...current, id]);
  };
  const toggleShareUserEdit = (id: string) => {
    if (!newUserIDs.includes(id)) return;
    setNewEditorUserIDs((current) => current.includes(id) ? current.filter((currentID) => currentID !== id) : [...current, id]);
  };
  const setShareUserRole = (id: string, role: "viewer" | "editor" | "owner") => {
    if (role === "owner") {
      if (!canShareKnowledge || !window.confirm("Transfer ownership of this knowledge to this user?")) return;
      transferOwnership.mutate(id);
      return;
    }
    setNewUserIDs((current) => current.includes(id) ? current : [...current, id]);
    setNewEditorUserIDs((current) => role === "editor" ? (current.includes(id) ? current : [...current, id]) : current.filter((currentID) => currentID !== id));
  };
  const selectedShareCount = shareTab === "users" ? newUserIDs.length : shareTab === "divisions" ? newDivisionIDs.length : newTeamIDs.length;
  const [treePreview, setTreePreview] = useState<{
    item: Doc;
    kind: string;
  } | null>(null);
  const [openTreeCategories, setOpenTreeCategories] = useState<string[]>(() => {
    if (typeof window === "undefined") return ["most-read", "recent-edit"];
    try {
      const preference = localStorage.getItem(
        "npms:knowledge-open-tree-categories",
      );
      if (preference === null) return ["most-read", "recent-edit"];
      const stored = JSON.parse(preference);
      if (Array.isArray(stored)) {
        return stored
          .filter((item): item is string => typeof item === "string")
          .slice(-2);
      }
    } catch {
      // Use the default user view when the stored preference is invalid.
    }
    return ["most-read", "recent-edit"];
  });
  const [knowledgeReadCounts, setKnowledgeReadCounts] =
    useState<KnowledgeReadCounts>(() => {
      if (typeof window === "undefined") return {};
      try {
        const stored = JSON.parse(
          localStorage.getItem("npms:knowledge-read-counts") ?? "{}",
        );
        return stored && typeof stored === "object" ? stored : {};
      } catch {
        return {};
      }
    });
  const [treeOrder, setTreeOrder] = useState<KnowledgeTreeOrder>(() => {
    if (typeof window === "undefined") return "most-read";
    const stored = localStorage.getItem("npms:knowledge-tree-order");
    return stored === "recent-edit" || stored === "title"
      ? stored
      : "most-read";
  });
  const [listOrder, setListOrder] = useState<KnowledgeTreeOrder>(() => {
    if (typeof window === "undefined") return "recent-edit";
    const stored = localStorage.getItem("npms:knowledge-list-order");
    return stored === "most-read" || stored === "title"
      ? stored
      : "recent-edit";
  });
  const [advancedFilterOpen, setAdvancedFilterOpen] = useState(false);
  const advancedFilterRef = useRef<HTMLDivElement | null>(null);
  const [orderMenuOpen, setOrderMenuOpen] = useState(false);
  const orderMenuRef = useRef<HTMLDivElement | null>(null);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [createdByFilter, setCreatedByFilter] = useState("all");
  const [expandedTreeCategories, setExpandedTreeCategories] = useState<
    string[]
  >([]);
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => {
    setKnowledgeCollection(initialCollection);
    setMoreOpen(false);
  }, [initialCollection]);
  useEffect(() => {
    if (!advancedFilterOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (
        advancedFilterRef.current &&
        !advancedFilterRef.current.contains(event.target as Node)
      ) {
        setAdvancedFilterOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [advancedFilterOpen]);
  useEffect(() => {
    if (!orderMenuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (
        orderMenuRef.current &&
        !orderMenuRef.current.contains(event.target as Node)
      ) {
        setOrderMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [orderMenuOpen]);
  useEffect(() => {
    if (!versionMenuOpenID) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".knowledge-version-history-menu, .knowledge-version-history-menu-trigger")) return;
      setVersionMenuOpenID(null);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [versionMenuOpenID]);
  useEffect(() => {
    const closeDetailOnBack = () => {
      if (!knowledgeDetailHistoryRef.current) return;
      knowledgeDetailHistoryRef.current = false;
      setAddOpen(false);
      setEditingKnowledge(null);
      autosaveDraftRef.current = null;
    };
    window.addEventListener("popstate", closeDetailOnBack);
    return () => window.removeEventListener("popstate", closeDetailOnBack);
  }, []);
  function changeViewMode(next: KnowledgeView) {
    setViewMode(next);
    localStorage.setItem("npms:knowledge-view", next);
  }
  const prefilledProject = useRef<string | null>(null);
  const sourceProject = useQuery({
    queryKey: ["project", sourceProjectID],
    queryFn: () => api<SourceProject>(`/api/v1/projects/${sourceProjectID}`),
    enabled: initialPage === "new" && !!sourceProjectID,
  });
  const general = useQuery({
    queryKey: ["settings", "general"],
    queryFn: () => api<GeneralSettings>("/api/v1/settings/general"),
  });
  const knowledgeTypes = useQuery({
    queryKey: ["settings", "knowledge-types"],
    queryFn: () => api<KnowledgeType[]>("/api/v1/settings/knowledge-types"),
  });
  const createType = useMutation({
    mutationFn: () =>
      api<KnowledgeType>("/api/v1/settings/knowledge-types", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          label: typeLabel.trim(),
          description: "Created from New Knowledge",
          icon: typeIcon.trim() || null,
          color: typeColor,
        }),
      }),
    onSuccess: (item) => {
      setNewTypes((current) =>
        current.includes(item.slug) ? current : [...current, item.slug],
      );
      setTypeLabel("");
      setTypeIcon("📚");
      setAddingType(false);
      cache.invalidateQueries({ queryKey: ["settings", "knowledge-types"] });
    },
  });
  const kinds =
    knowledgeTypes.data
      ?.filter((item) => item.is_active)
      .map((item) => ({
        id: item.slug,
        label: item.label,
        color: item.color,
        icon: item.icon,
      })) ?? fallbackKinds;
  const kindIcon = (itemKind: string) =>
    icon(itemKind, kinds.find((item) => item.id === itemKind)?.icon);
  const visibleLimit = general.data?.knowledge_visible_type_limit ?? 3;
  const visibleKinds = kinds.slice(0, visibleLimit);
  const moreKinds = kinds.slice(visibleLimit);
  const knowledgeIDFromURL =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("knowledge");
  const treeDocumentQueries = useQueries({
    queries: kinds.slice(0, 20).map((item) => ({
      queryKey: ["knowledge", item.id],
      queryFn: () => api<Doc[]>(`/api/v1/knowledge/${item.id}`),
      enabled:
        viewMode === "tree" ||
        knowledgeCollection === "recents" ||
        knowledgeCollection === "most-viewed" ||
        !!knowledgeIDFromURL,
      staleTime: 30_000,
    })),
  });
  const personalDocumentQueries = useQueries({
    queries: kinds.slice(0, 20).map((item) => ({
      queryKey: ["knowledge", "personal", item.id],
      queryFn: () => api<Doc[]>(`/api/v1/knowledge/${item.id}?scope=personal`),
      enabled: knowledgeCollection === "personal",
      staleTime: 30_000,
    })),
  });
  const workspaces = useQuery({
    queryKey: ["knowledge-workspaces"],
    queryFn: () => api<Workspace[]>("/api/v1/knowledge/workspaces"),
  });
  const divisions = useQuery({
    queryKey: ["divisions"],
    queryFn: () => api<Division[]>("/api/v1/divisions"),
    enabled: addOpen,
  });
  const teams = useQuery({
    queryKey: ["teams"],
    queryFn: () => api<Team[]>("/api/v1/teams"),
    enabled: addOpen,
  });
  const directoryUsers = useQuery({
    queryKey: ["users"],
    queryFn: () => api<DirectoryUser[]>("/api/v1/users"),
    enabled: (addOpen && !shareModalOpen) || advancedFilterOpen || createdByFilter !== "all",
  });
  const shareUsers = useQuery({
    queryKey: ["knowledge-share-users", shareUserInitial, shareShowSelected, shareShowSelected ? newUserIDs : []],
    queryFn: async () => {
      if (shareShowSelected && !newUserIDs.length) return [];
      const params = new URLSearchParams();
      if (shareUserInitial && !shareShowSelected) params.set("initial", shareUserInitial);
      if (shareShowSelected) newUserIDs.forEach((id) => params.append("selected_ids[]", id));
      const query = params.toString();
      return api<DirectoryUser[]>(query ? `/api/v1/users?${query}` : "/api/v1/users");
    },
    enabled: addOpen && shareModalOpen && shareTab === "users",
  });
  useEffect(() => {
    if (directoryUsers.data) {
      const validIDs = new Set(directoryUsers.data.map((user) => user.id));
      setNewUserIDs((current) => {
        const next = current.filter((id) => validIDs.has(id));
        return next.length === current.length ? current : next;
      });
      setNewEditorUserIDs((current) => {
        const next = current.filter((id) => validIDs.has(id));
        return next.length === current.length ? current : next;
      });
    }
    if (teams.data) {
      const validIDs = new Set(teams.data.map((team) => team.id));
      setNewTeamIDs((current) => {
        const next = current.filter((id) => validIDs.has(id));
        return next.length === current.length ? current : next;
      });
    }
  }, [directoryUsers.data, teams.data]);
  const validShareUserIDs = directoryUsers.data
    ? new Set(directoryUsers.data.map((user) => user.id))
    : null;
  const validShareTeamIDs = teams.data
    ? new Set(teams.data.map((team) => team.id))
    : null;
  const autosaveTeamIDs = validShareTeamIDs
    ? newTeamIDs.filter((id) => validShareTeamIDs.has(id))
    : newTeamIDs;
  const autosaveUserIDs = validShareUserIDs
    ? newUserIDs.filter((id) => validShareUserIDs.has(id))
    : newUserIDs;
  const autosaveEditorUserIDs = autosaveUserIDs.length
    ? newEditorUserIDs.filter((id) => autosaveUserIDs.includes(id))
    : [];
  const documents = useQuery({
    queryKey: ["knowledge", kind],
    queryFn: () => api<Doc[]>(`/api/v1/knowledge/${kind}`),
  });
  const drafts = useQuery({
    queryKey: ["knowledge", "drafts"],
    queryFn: () => api<Doc[]>("/api/v1/knowledge/drafts"),
  });
  useEffect(() => {
    if (!knowledgeIDFromURL || addOpen) return;
    // A list refresh after saving must not reopen the current document and
    // reset detail-only state such as version history.
    if (editingKnowledge?.id === knowledgeIDFromURL) return;
    const item = [
      ...(documents.data ?? []),
      ...(drafts.data ?? []),
      ...treeDocumentQueries.flatMap((query) => query.data ?? []),
      ...personalDocumentQueries.flatMap((query) => query.data ?? []),
    ].find((candidate) => candidate.id === knowledgeIDFromURL);
    if (!item) return;
    if (item.publication_status === "draft") {
      resumeDraft(item, { restore: true });
    } else {
      openKnowledgeDetail(item, { restore: true });
    }
  }, [
    knowledgeIDFromURL,
    addOpen,
    documents.data,
    drafts.data,
    treeDocumentQueries,
    personalDocumentQueries,
    editingKnowledge?.id,
  ]);
  const createKnowledge = useMutation({
    mutationFn: async (publicationStatus: "draft" | "published") => {
      const existingDraft = autosaveDraftRef.current;
      if (existingDraft) {
        return api<Doc>(
          `/api/v1/knowledge/${existingDraft.kind}/${existingDraft.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: newTitle.trim(),
              content: serializeDocumentTabs(),
              tags: newTags,
              knowledge_types: newTypes,
              knowledge_source_mode: "internal",
              related_project_id: newRelatedProjectID || null,
              ...sharePayload,
              external_resources: externalResources.map(({ url, type, label }) => ({ url, type, label })),
              publication_status: publicationStatus,
              cover_source: coverUrl ? coverSource : null,
              cover_url: coverUrl || null,
              accessible_team_ids: newTeamIDs,
              accessible_user_ids: newUserIDs,
              accessible_editor_user_ids: newEditorUserIDs,
            }),
          },
        );
      }
      let workspaceID = newWorkspace || workspaces.data?.[0]?.id;
      if (!workspaceID) {
        const workspace = await api<Workspace>("/api/v1/knowledge/workspaces", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            name: "Company Knowledge",
            description: "Shared organizational knowledge",
          }),
        });
        workspaceID = workspace.id;
      }
      return api<Doc>(`/api/v1/knowledge/${newTypes[0] ?? "wiki"}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          workspace_id: workspaceID,
          title: newTitle.trim(),
          content: serializeDocumentTabs(),
          tags: newTags,
          knowledge_types: newTypes,
          knowledge_source_mode: "internal",
          related_project_id: newRelatedProjectID || null,
          ...sharePayload,
          external_resources: externalResources.map(({ url, type, label }) => ({
            url,
            type,
            label,
          })),
          publication_status: publicationStatus,
          cover_source: coverUrl ? coverSource : null,
          cover_url: coverUrl || null,
          accessible_team_ids: newTeamIDs,
          accessible_user_ids: newUserIDs,
          accessible_editor_user_ids: newEditorUserIDs,
        }),
      });
    },
    onSuccess: (item) => {
      if (editingKnowledge) {
        const savedAt = new Date().toISOString();
        setCurrentVersionDisplayAt(savedAt);
        setEditingKnowledge((current) => current ? { ...current, ...item, updated_at: savedAt } : { ...item, updated_at: savedAt });
        setLastUpdatedByName(item.last_updated_by_name ?? item.author_name ?? "You");
        setActiveVersionID("current");
        setVersionActionMessage("Changes saved");
        cache.invalidateQueries({ queryKey: ["knowledge"] });
        return;
      }
      setLastUpdatedByName(item.last_updated_by_name ?? item.author_name ?? "You");
      setKind(newTypes[0] ?? "wiki");
      setAddOpen(false);
      onBackToList?.();
      setNewTitle("");
      setNewContent("");
      setNewRelatedProjectID("");
      setDocumentTabs([{ id: crypto.randomUUID(), label: "Tab 1", content: "" }]);
      setActiveDocumentTabID(null);
      setEditingDocumentTabID(null);
      setNewTags([]);
      setNewDivisionIDs(defaultDivisionIDs);
      setTagDraft("");
      onFocusModeChange(false);
      autosaveDraftRef.current = null;
      autosaveKeyRef.current = crypto.randomUUID();
      autosaveWordCountRef.current = 0;
      autosaveMetadataSignatureRef.current = "";
      setAutosaveStatus("idle");
      setAutosavedAt(null);
      setAutosaveError(null);
      setShowAutosaveError(false);
      setExternalResources([]);
      setResourceUrl("");
      setCoverSource("upload");
      setCoverUrl("");
      setCoverUploadStatus("idle");
      setCoverError("");
      setNewTeamIDs([]);
      setNewUserIDs([]);
      setNewEditorUserIDs([]);
      setShareModalOpen(false);
      setEditingKnowledge(null);
      cache.invalidateQueries({ queryKey: ["knowledge"] });
      cache.invalidateQueries({ queryKey: ["knowledge-workspaces"] });
    },
  });
  const updateKnowledgeSharing = useMutation({
    mutationFn: async () => {
      if (!editingKnowledge) throw new Error("Knowledge content is not open");
      return api<Doc>(`/api/v1/knowledge/${editingKnowledge.kind ?? kind}/${editingKnowledge.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessible_division_ids: newDivisionIDs,
          accessible_team_ids: newTeamIDs,
          accessible_user_ids: newUserIDs,
          accessible_editor_user_ids: newEditorUserIDs,
        }),
      });
    },
    onSuccess: (item) => {
      setEditingKnowledge((current) => current ? { ...current, ...item } : item);
      setLastUpdatedByName(item.last_updated_by_name ?? item.author_name ?? "Unknown user");
      setShareModalOpen(false);
      cache.invalidateQueries({ queryKey: ["knowledge"] });
    },
  });
  const createVersion = useMutation({
    mutationFn: async () => {
      if (!editingKnowledge) throw new Error("Knowledge content is not open");
      return api<Doc>(`/api/v1/knowledge/${editingKnowledge.kind ?? kind}/${editingKnowledge.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          content: serializeDocumentTabs(),
          publication_status: editingKnowledge.publication_status ?? "draft",
          create_version: true,
        }),
      });
    },
    onSuccess: (item) => {
      setCurrentVersionDisplayAt(item.updated_at);
      setEditingKnowledge((current) => current ? { ...current, ...item } : item);
      setLastUpdatedByName(item.last_updated_by_name ?? item.author_name ?? "Unknown user");
      setVersionHistoryItems(item.version_history ?? []);
      setActiveVersionID("current");
      setVersionActionMessage("New version created");
      setVersionMenuOpenID(null);
    },
    onError: (error) => setVersionActionMessage(error.message),
  });
  const removeVersion = useMutation({
    mutationFn: async (versionID: string) => api<{ id: string; removed: boolean }>(`/api/v1/knowledge-versions/${versionID}`, { method: "DELETE" }),
    onSuccess: (_, versionID) => {
      setVersionHistoryItems((current) => current.filter((version) => version.id !== versionID));
      setVersionMenuOpenID(null);
      setVersionActionMessage("Version removed");
    },
    onError: (error) => setVersionActionMessage(error.message),
  });
  const transferOwnership = useMutation({
    mutationFn: (userID: string) => {
      if (!editingKnowledge) throw new Error("Knowledge content is not open");
      return api<Doc>(`/api/v1/knowledge/${editingKnowledge.kind ?? kind}/${editingKnowledge.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author_id: userID }),
      });
    },
    onSuccess: (item) => {
      setEditingKnowledge(item);
      setLastUpdatedByName(item.last_updated_by_name ?? item.author_name ?? "Unknown user");
      setShareModalOpen(false);
      cache.invalidateQueries({ queryKey: ["knowledge"] });
    },
  });
  autosaveLatestRef.current = async () => {
    if (autosaveRunningRef.current || !newTitle.trim() || !newTypes.length)
      return;
    const workspaceID = newWorkspace || workspaces.data?.[0]?.id;
    if (!workspaceID) return;
    const content = serializeDocumentTabs();
    const wordCount = countMarkdownWords(content);
    const metadataSignature = JSON.stringify({
      title: newTitle.trim(), types: newTypes, tags: newTags,
      divisions: newDivisionIDs, resources: externalResources,
      relatedProject: newRelatedProjectID || null,
      coverSource: coverUrl ? coverSource : null, coverUrl: coverUrl || null,
      teams: autosaveTeamIDs, users: autosaveUserIDs,
    });
    if (wordCount === autosaveWordCountRef.current && metadataSignature === autosaveMetadataSignatureRef.current) return;
    autosaveRunningRef.current = true;
    setAutosaveStatus("saving");
    setAutosaveError(null);
    const existing = autosaveDraftRef.current;
    const endpoint = existing
      ? `PATCH /api/v1/knowledge/${existing.kind}/${existing.id}`
      : `POST /api/v1/knowledge/${newTypes[0] ?? "wiki"}`;
    try {
      if (existing) {
        const saved = await api<Doc>(`/api/v1/knowledge/${existing.kind}/${existing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: newTitle.trim(),
            content,
            tags: newTags,
            knowledge_types: newTypes,
            knowledge_source_mode: "internal",
            related_project_id: newRelatedProjectID || null,
            ...sharePayload,
            external_resources: externalResources.map(({ url, type, label }) => ({ url, type, label })),
            publication_status: editingKnowledge?.publication_status === "published" ? "published" : "draft",
            cover_source: coverUrl ? coverSource : null,
            cover_url: coverUrl || null,
            accessible_team_ids: autosaveTeamIDs,
            accessible_user_ids: autosaveUserIDs,
            accessible_editor_user_ids: autosaveEditorUserIDs,
          }),
        });
        setEditingKnowledge((current) => current ? { ...current, ...saved } : saved);
        setCurrentVersionDisplayAt(saved.updated_at);
        setVersionHistoryItems(saved.version_history ?? []);
        setLastUpdatedByName(saved.last_updated_by_name ?? saved.author_name ?? "Unknown user");
      } else {
        const created = await api<Doc>(
          `/api/v1/knowledge/${newTypes[0] ?? "wiki"}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": autosaveKeyRef.current,
            },
            body: JSON.stringify({
              workspace_id: workspaceID,
              title: newTitle.trim(),
              content,
              tags: newTags,
              knowledge_types: newTypes,
              knowledge_source_mode: "internal",
              related_project_id: newRelatedProjectID || null,
              ...sharePayload,
              external_resources: externalResources.map(
                ({ url, type, label }) => ({ url, type, label }),
              ),
              publication_status: "draft",
              cover_source: coverUrl ? coverSource : null,
              cover_url: coverUrl || null,
              accessible_team_ids: autosaveTeamIDs,
              accessible_user_ids: autosaveUserIDs,
              accessible_editor_user_ids: autosaveEditorUserIDs,
            }),
          },
        );
        autosaveDraftRef.current = {
          id: created.id,
          kind: newTypes[0] ?? "wiki",
        };
        setEditingKnowledge(created);
        setCurrentVersionDisplayAt(created.updated_at);
        setVersionHistoryItems(created.version_history ?? []);
        setLastUpdatedByName(created.last_updated_by_name ?? created.author_name ?? "You");
      }
      autosaveWordCountRef.current = wordCount;
      autosaveMetadataSignatureRef.current = metadataSignature;
      setAutosavedAt(new Date());
      setAutosaveStatus("saved");
      cache.invalidateQueries({ queryKey: ["knowledge"] });
    } catch (error: unknown) {
      setAutosaveError({
        message: error instanceof Error ? error.message : "Unknown autosave error.",
        status: error instanceof KnowledgeApiError ? error.status : undefined,
        requestID: error instanceof KnowledgeApiError ? error.requestID : undefined,
        operation: "Draft autosave",
        endpoint,
        occurredAt: new Date(),
      });
      setAutosaveStatus("error");
    } finally {
      autosaveRunningRef.current = false;
    }
  };
  useEffect(() => {
    if (!addOpen) return;
    const interval = window.setInterval(
      () => void autosaveLatestRef.current(),
      20_000,
    );
    return () => window.clearInterval(interval);
  }, [addOpen, editingKnowledge?.publication_status]);
  useEffect(() => {
    if (initialPage === "new") onDraftTitleChange?.(newTitle);
  }, [newTitle, initialPage]);
  useEffect(() => {
    if (initialPage !== "new" && editingKnowledge && addOpen) {
      onKnowledgeTitleChange?.(newTitle);
    }
  }, [addOpen, editingKnowledge, initialPage, newTitle, onKnowledgeTitleChange]);
  useEffect(() => {
    const project = sourceProject.data;
    if (!project || prefilledProject.current === project.id) return;
    prefilledProject.current = project.id;
    setNewRelatedProjectID(project.id);
    const metadata = project.metadata ?? {};
    setNewTitle(`${project.name} - Project knowledge`);
    setNewTags(
      Array.from(new Set(["project-knowledge", ...(project.tags ?? [])])).slice(
        0,
        20,
      ),
    );
    const projectContent = [
        `# ${project.name}`,
        "",
        "## Project context",
        "",
        `- Project ID: ${project.id}`,
        `- Status: ${project.status}`,
        `- Project type: ${project.project_type ?? "Not specified"}`,
        `- Created by: ${project.created_by_name ?? "Not specified"}`,
        "",
        "## Project metadata",
        "",
        "```json",
        JSON.stringify(metadata, null, 2),
        "```",
        "",
        "## Knowledge notes",
        "",
      ].join("\n");
    setNewContent(projectContent);
    setDocumentTabs((current) =>
      current.map((tab, index) =>
        index === 0 ? { ...tab, content: projectContent } : tab,
      ),
    );
  }, [sourceProject.data]);
  useEffect(() => {
    if (kinds.length && !kinds.some((item) => item.id === kind))
      setKind(kinds[0].id);
  }, [knowledgeTypes.data, kind]);
  function addExternalResource() {
    try {
      const parsed = new URL(resourceUrl.trim());
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
      if (externalResources.some((item) => item.url === parsed.href)) {
        setResourceError("This resource has already been added.");
        return;
      }
      const googleDocs = parsed.hostname === "docs.google.com";
      setExternalResources((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          url: parsed.href,
          type: googleDocs ? "google_docs" : "url",
          label: googleDocs ? "Google Docs" : "External URL",
        },
      ]);
      setResourceUrl("");
      setResourceError("");
    } catch {
      setResourceError("Enter a valid public http or https URL.");
    }
  }
  async function uploadKnowledgeCover(file: File) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setCoverError("Cover must be a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setCoverError("Cover image must be 5 MB or smaller.");
      return;
    }
    setCoverUploadStatus("uploading");
    setCoverError("");
    try {
      const form = new FormData();
      form.append("image", file);
      const uploaded = await api<{ url: string }>("/api/v1/knowledge/media", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: form,
      });
      setCoverSource("upload");
      setCoverUrl(uploaded.url);
    } catch (error) {
      setCoverError(error instanceof Error ? error.message : "Cover upload failed.");
    } finally {
      setCoverUploadStatus("idle");
    }
  }
  const availableKnowledgeTags = useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...(documents.data ?? []),
            ...treeDocumentQueries.flatMap((query) => query.data ?? []),
          ].flatMap((item) => tags(item.tags)),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [documents.data, treeDocumentQueries],
  );
  const focusTableOfContents = useMemo(() => {
    const headings: Array<{ level: number; label: string }> = [];
    for (const match of newContent.matchAll(/^(#{1,6})\s+(.+)$/gm)) {
      headings.push({
        level: match[1].length,
        label: match[2]
          .replace(/\s+#+\s*$/, "")
          .replace(/[\[\]*_`~]/g, "")
          .trim(),
      });
    }
    return headings;
  }, [newContent]);
  const draftWordCount = useMemo(
    () =>
      documentTabs.reduce(
        (total, tab) => total + countMarkdownWords(tab.content),
        0,
      ),
    [documentTabs],
  );
  const draftDocumentBytes = new Blob([serializeDocumentTabs()]).size;
  const draftDocumentSize = draftDocumentBytes < 1024
    ? `${draftDocumentBytes} B`
    : draftDocumentBytes < 1024 * 1024
      ? `${(draftDocumentBytes / 1024).toFixed(1)} KB`
      : `${(draftDocumentBytes / (1024 * 1024)).toFixed(1)} MB`;
  const documentTabsWithHeadings = useMemo(
    () =>
      documentTabs.map((tab) => ({
        ...tab,
        children:
          (activeDocumentTabID ?? documentTabs[0]?.id) === tab.id
            ? focusTableOfContents.map((heading, index) => ({ heading, index }))
            : [],
      })),
    [activeDocumentTabID, documentTabs, focusTableOfContents],
  );
  function navigateToEditorHeading(index: number) {
    const headings = document.querySelectorAll(
      ".knowledge-create-page .knowledge-tiptap-content h1, .knowledge-create-page .knowledge-tiptap-content h2, .knowledge-create-page .knowledge-tiptap-content h3, .knowledge-create-page .knowledge-tiptap-content h4, .knowledge-create-page .knowledge-tiptap-content h5, .knowledge-create-page .knowledge-tiptap-content h6",
    );
    setActiveTocIndex(index);
    headings[index]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  useEffect(() => {
    if (activeTocIndex < 0) return;
    const toc = document.getElementById("knowledge-editor-toc");
    const item = toc?.querySelectorAll(".knowledge-document-tab-outline button")[activeTocIndex] as HTMLElement | undefined;
    if (!toc || !item) return;
    const tocBounds = toc.getBoundingClientRect();
    const itemBounds = item.getBoundingClientRect();
    if (itemBounds.top < tocBounds.top) toc.scrollTop -= tocBounds.top - itemBounds.top + 8;
    if (itemBounds.bottom > tocBounds.bottom) toc.scrollTop += itemBounds.bottom - tocBounds.bottom + 8;
  }, [activeTocIndex, activeDocumentTabID]);
  function addDocumentTab() {
    if (documentTabs.length >= MAX_DOCUMENT_TABS) return;
    const currentContent = knowledgeEditorRef.current?.getMarkdown() ?? newContent;
    const tab = {
      id: crypto.randomUUID(),
      label: `Tab ${documentTabs.length + 1}`,
      content: "",
    };
    const currentID = activeDocumentTabID ?? documentTabs[0]?.id;
    setDocumentTabs((current) => [
      ...current.map((item) =>
        item.id === currentID ? { ...item, content: currentContent } : item,
      ),
      tab,
    ]);
    setActiveDocumentTabID(tab.id);
    setNewContent("");
    setActiveTocIndex(0);
    setEditingDocumentTabID(tab.id);
  }
  function activateDocumentTab(tab: (typeof documentTabsWithHeadings)[number]) {
    if ((activeDocumentTabID ?? documentTabs[0]?.id) === tab.id) return;
    const currentID = activeDocumentTabID ?? documentTabs[0]?.id;
    const currentContent = knowledgeEditorRef.current?.getMarkdown() ?? newContent;
    setDocumentTabs((current) =>
      current.map((item) =>
        item.id === currentID ? { ...item, content: currentContent } : item,
      ),
    );
    setActiveDocumentTabID(tab.id);
    setNewContent(tab.content);
    setActiveTocIndex(0);
  }
  function updateActiveDocumentContent(content: string) {
    const activeID = activeDocumentTabID ?? documentTabs[0]?.id;
    setNewContent(content);
    setDocumentTabs((current) =>
      current.map((tab) => (tab.id === activeID ? { ...tab, content } : tab)),
    );
  }
  function serializeDocumentTabs() {
    const activeID = activeDocumentTabID ?? documentTabs[0]?.id;
    const activeContent = knowledgeEditorRef.current?.getMarkdown() ?? newContent;
    const tabs = documentTabs.map((tab) =>
      tab.id === activeID ? { ...tab, content: activeContent } : tab,
    );
    if (tabs.length === 1) return tabs[0].content.trim();
    return tabs
      .map((tab, index) => {
        const label = tab.label.replace(/[\r\n]+/g, " ").replace(/^#+\s*/, "").trim() || `Tab ${index + 1}`;
        return `# ${label}\n\n${tab.content.trim()}`.trimEnd();
      })
      .join("\n\n");
  }
  function selectVersion(version: VersionHistoryEntry) {
    if (version.content == null) {
      setVersionActionMessage("This version has no content snapshot.");
      return;
    }
    setNewTitle(version.title ?? newTitle);
    setNewContent(version.content);
    setDocumentTabs([{ id: crypto.randomUUID(), label: "Tab 1", content: version.content }]);
    setActiveDocumentTabID(null);
    setEditingDocumentTabID(null);
    setActiveVersionID(version.id === "current" ? "current" : version.id);
    setVersionMenuOpenID(null);
  }
  function renameDocumentTab(id: string, label: string) {
    setDocumentTabs((current) =>
      current.map((tab) => (tab.id === id ? { ...tab, label } : tab)),
    );
  }
  function finishEditingDocumentTab(id: string) {
    setDocumentTabs((current) =>
      current.map((tab, index) =>
        tab.id === id
          ? { ...tab, label: tab.label.trim() || `Tab ${index + 1}` }
          : tab,
      ),
    );
    setEditingDocumentTabID(null);
  }
  function addKnowledgeTag() {
    const value = tagDraft.trim().replace(/^#/, "");
    if (!value) return;
    if (!newTags.some((tag) => tag.toLowerCase() === value.toLowerCase()))
      setNewTags((current) => [...current, value]);
    setTagDraft("");
  }
  function knowledgeViewCount(item: Doc) {
    return Object.entries(knowledgeReadCounts)
      .filter(([key]) => key.endsWith(`:${item.id}`))
      .reduce((total, [, value]) => total + value, 0);
  }
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const collectionItems =
      knowledgeCollection === "drafts"
        ? (drafts.data ?? [])
        : knowledgeCollection === "personal"
        ? personalDocumentQueries.flatMap((query) => query.data ?? [])
        : knowledgeCollection === "category"
        ? (documents.data ?? [])
        : treeDocumentQueries
            .flatMap((query) => query.data ?? [])
            .filter(
              (item) =>
                knowledgeCollection !== "most-viewed" ||
                Object.entries(knowledgeReadCounts).some(
                  ([key, count]) => key.endsWith(`:${item.id}`) && count > 0,
                ),
            )
            .sort((left, right) => {
              if (knowledgeCollection === "most-viewed") {
                const count = (item: Doc) =>
                  Object.entries(knowledgeReadCounts)
                    .filter(([key]) => key.endsWith(`:${item.id}`))
                    .reduce((total, [, value]) => total + value, 0);
                return (
                  count(right) - count(left) ||
                  Date.parse(right.updated_at) - Date.parse(left.updated_at)
                );
              }
              return (
                Date.parse(right.created_at ?? right.updated_at) -
                Date.parse(left.created_at ?? left.updated_at)
              );
            });
    const filteredItems = collectionItems
      .filter(
        (item) =>
          (divisionFilter === "all" ||
            !tags(item.accessible_division_ids ?? []).length ||
            tags(item.accessible_division_ids ?? []).includes(
              divisionFilter,
            )) &&
          (!term ||
            `${item.title} ${item.content} ${tags(item.tags).join(" ")}`
              .toLowerCase()
              .includes(term)) &&
          filterTags.every((tag) => tags(item.tags).includes(tag)) &&
          (createdByFilter === "all" || item.author_id === createdByFilter) &&
          (knowledgeCollection === "drafts" ||
            knowledgeCollection === "personal" ||
            !isPrivateKnowledge(item) ||
            (showPrivateContent &&
              (currentUserRole === "admin" || item.author_id === currentUserID))),
      );

    // Recents and Most Viewed already have a fixed ranking above. Do not let
    // the category/list order preference sort those pseudo-tabs again.
    if (
      knowledgeCollection === "recents" ||
      knowledgeCollection === "most-viewed"
    ) {
      return filteredItems;
    }

    return filteredItems.sort((left, right) => {
        if (listOrder === "title") return left.title.localeCompare(right.title);
        if (listOrder === "most-read") {
          return (
            knowledgeViewCount(right) - knowledgeViewCount(left) ||
            Date.parse(right.updated_at) - Date.parse(left.updated_at)
          );
        }
        return Date.parse(right.updated_at) - Date.parse(left.updated_at);
      });
  }, [
    documents.data,
    drafts.data,
    personalDocumentQueries,
    treeDocumentQueries,
    knowledgeReadCounts,
    knowledgeCollection,
    search,
    divisionFilter,
    filterTags,
    listOrder,
    createdByFilter,
    showPrivateContent,
    currentUserRole,
    currentUserID,
  ]);
  const treeGroups = useMemo(() => {
    const term = search.trim().toLowerCase();
    return kinds.slice(0, 20).map((item, index) => ({
      ...item,
      items: (treeDocumentQueries[index]?.data ?? []).filter(
        (document) =>
          (divisionFilter === "all" ||
            !tags(document.accessible_division_ids ?? []).length ||
            tags(document.accessible_division_ids ?? []).includes(
              divisionFilter,
            )) &&
          (!term ||
            `${document.title} ${document.content} ${tags(document.tags).join(" ")}`
              .toLowerCase()
              .includes(term)) &&
          filterTags.every((tag) => tags(document.tags).includes(tag)) &&
          (createdByFilter === "all" || document.author_id === createdByFilter) &&
          (!isPrivateKnowledge(document) ||
            (showPrivateContent &&
              (currentUserRole === "admin" || document.author_id === currentUserID))),
      ),
      pending: treeDocumentQueries[index]?.isPending ?? false,
    }));
  }, [
    kinds,
    treeDocumentQueries,
    search,
    divisionFilter,
    filterTags,
    createdByFilter,
    showPrivateContent,
    currentUserRole,
    currentUserID,
  ]);
  const treeItemCount = treeGroups.reduce(
    (total, group) => total + group.items.length,
    0,
  );
  function toggleTreeCategory(categoryID: string) {
    setOpenTreeCategories((current) => {
      const next = current.includes(categoryID)
        ? current.filter((item) => item !== categoryID)
        : [...current, categoryID].slice(-2);
      localStorage.setItem(
        "npms:knowledge-open-tree-categories",
        JSON.stringify(next),
      );
      return next;
    });
  }
  const treeEntries = treeGroups.flatMap((group) =>
    group.items.map((item) => ({ item, kind: group.id })),
  );
  const mostReadEntries = [...treeEntries]
    .filter(
      ({ item, kind: itemKind }) =>
        (knowledgeReadCounts[`${itemKind}:${item.id}`] ?? 0) > 0,
    )
    .sort((left, right) => {
      const countDifference =
        (knowledgeReadCounts[`${right.kind}:${right.item.id}`] ?? 0) -
        (knowledgeReadCounts[`${left.kind}:${left.item.id}`] ?? 0);
      return (
        countDifference ||
        Date.parse(right.item.updated_at) - Date.parse(left.item.updated_at)
      );
    })
    .slice(0, 3);
  const recentEditEntries = [...treeEntries]
    .sort(
      (left, right) =>
        Date.parse(right.item.updated_at) - Date.parse(left.item.updated_at),
    )
    .slice(0, 3);
  function openTreePreview(item: Doc, itemKind: string) {
    setTreePreview({ item, kind: itemKind });
    setKnowledgeReadCounts((current) => {
      const key = `${itemKind}:${item.id}`;
      const next = { ...current, [key]: (current[key] ?? 0) + 1 };
      localStorage.setItem("npms:knowledge-read-counts", JSON.stringify(next));
      return next;
    });
  }
  function openKnowledgeDetail(item: Doc, options: { restore?: boolean } = {}) {
    const itemKind = item.kind ?? kind;
    setKind(itemKind);
    setNewTypes(tags(item.knowledge_types ?? [itemKind]));
    setNewWorkspace(item.workspace_id ?? "");
    setNewRelatedProjectID(item.related_project_id ?? "");
    setNewTitle(item.title ?? "");
    setNewContent(item.content ?? "");
    setDocumentTabs([{ id: crypto.randomUUID(), label: "Tab 1", content: item.content ?? "" }]);
    setActiveDocumentTabID(null);
    setEditingDocumentTabID(null);
    setNewTags(tags(item.tags));
    setNewDivisionIDs(tags(item.accessible_division_ids ?? []));
    setNewTeamIDs(tags(item.accessible_team_ids ?? []));
    setNewUserIDs(tags(item.accessible_user_ids ?? []));
    setNewEditorUserIDs(tags(item.accessible_editor_user_ids ?? []));
    setExternalResources(resources(item.external_resources));
    setCoverSource(item.cover_source === "url" ? "url" : "upload");
    setCoverUrl(item.cover_url ?? "");
    setEditingKnowledge(item);
    setLastUpdatedByName(item.last_updated_by_name ?? item.author_name ?? "Unknown user");
    setCurrentVersionDisplayAt(item.updated_at ?? null);
    setVersionHistoryItems(item.version_history ?? []);
    setActiveVersionID("current");
    autosaveDraftRef.current = canEditKnowledge
      ? { id: item.id, kind: itemKind }
      : null;
    const url = new URL(window.location.href);
    url.searchParams.set("knowledge", item.id);
    const state = { ...window.history.state, npmsKnowledgeDetail: true, knowledgeID: item.id };
    if (options.restore) {
      window.history.replaceState(state, "", url);
      knowledgeDetailHistoryRef.current = false;
    } else {
      window.history.pushState(state, "", url);
      knowledgeDetailHistoryRef.current = true;
    }
    setSelected(null);
    setAddOpen(true);
    setKnowledgeReadCounts((current) => {
      const key = `knowledge:${item.id}`;
      const next = { ...current, [key]: (current[key] ?? 0) + 1 };
      localStorage.setItem("npms:knowledge-read-counts", JSON.stringify(next));
      return next;
    });
  }
  function resumeDraft(item: Doc, options: { restore?: boolean } = {}) {
    const itemKind = item.kind ?? "wiki";
    const content = item.content ?? "";
    setKind(itemKind);
    setNewTypes(tags(item.knowledge_types ?? [itemKind]));
    setNewWorkspace(item.workspace_id);
    setNewRelatedProjectID(item.related_project_id ?? "");
    setNewTitle(item.title ?? "");
    setNewContent(content);
    setDocumentTabs([{ id: crypto.randomUUID(), label: "Tab 1", content }]);
    setActiveDocumentTabID(null);
    setEditingDocumentTabID(null);
    setNewTags(tags(item.tags));
    setNewDivisionIDs(tags(item.accessible_division_ids ?? []));
    setNewTeamIDs(tags(item.accessible_team_ids ?? []));
    setNewUserIDs(tags(item.accessible_user_ids ?? []));
    setNewEditorUserIDs(tags(item.accessible_editor_user_ids ?? []));
    setExternalResources(resources(item.external_resources));
    setCoverSource(item.cover_source === "url" ? "url" : "upload");
    setCoverUrl(item.cover_url ?? "");
    setCoverUploadStatus("idle");
    setCoverError("");
    setLastUpdatedByName(item.last_updated_by_name ?? item.author_name ?? "Unknown user");
    setCurrentVersionDisplayAt(item.updated_at ?? null);
    setVersionHistoryItems(item.version_history ?? []);
    setActiveVersionID("current");
    autosaveDraftRef.current = { id: item.id, kind: itemKind };
    autosaveWordCountRef.current = countMarkdownWords(content);
    setAutosaveStatus("saved");
    setAutosavedAt(item.updated_at ? new Date(item.updated_at) : null);
    setKnowledgeCollection("drafts");
    const url = new URL(window.location.href);
    url.searchParams.set("knowledge", item.id);
    const state = { ...window.history.state, npmsKnowledgeDetail: true, knowledgeID: item.id };
    if (options.restore) {
      window.history.replaceState(state, "", url);
      knowledgeDetailHistoryRef.current = false;
    } else {
      window.history.pushState(state, "", url);
      knowledgeDetailHistoryRef.current = true;
    }
    setAddOpen(true);
  }
  function orderedTreeItems(items: Doc[], itemKind: string) {
    return [...items].sort((left, right) => {
      if (treeOrder === "title") return left.title.localeCompare(right.title);
      if (treeOrder === "recent-edit") {
        return Date.parse(right.updated_at) - Date.parse(left.updated_at);
      }
      const countDifference =
        (knowledgeReadCounts[`${itemKind}:${right.id}`] ?? 0) -
        (knowledgeReadCounts[`${itemKind}:${left.id}`] ?? 0);
      return (
        countDifference ||
        Date.parse(right.updated_at) - Date.parse(left.updated_at)
      );
    });
  }
  const knowledgePager = usePagination(filtered, 10);
  const workspaceMap = new Map(
    (workspaces.data ?? []).map((item) => [item.id, item.name]),
  );
  const advancedFilterCount =
    filterTags.length +
    Number(createdByFilter !== "all") +
    Number(Boolean(search.trim())) +
    Number(divisionFilter !== "all") +
    Number(showPrivateContent);
  const advancedFilterControl = (
    <div className="knowledge-advanced-filter" ref={advancedFilterRef}>
      <button
        type="button"
        className={`knowledge-advanced-trigger ${
          advancedFilterCount ? "active" : ""
        }`}
        aria-expanded={advancedFilterOpen}
        aria-label="Advanced filters"
        title="Advanced filters"
        onClick={() => setAdvancedFilterOpen((current) => !current)}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M3 5h14M5.5 10h9M8 15h4" />
        </svg>
        {advancedFilterCount > 0 && <span>{advancedFilterCount}</span>}
      </button>
      {advancedFilterOpen && (
        <div className="knowledge-advanced-menu">
          <header>
            <strong>Advanced filter</strong>
            <button
              type="button"
              disabled={!advancedFilterCount}
              onClick={() => {
                setFilterTags([]);
                setCreatedByFilter("all");
                setSearch("");
                setDivisionFilter("all");
                setShowPrivateContent(false);
              }}
            >
              Clear all
            </button>
          </header>
          <label>
            <span>Search knowledge</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search title, content, or tags..."
            />
          </label>
          {(currentUserRole === "admin" ||
            accessibleDivisionIDs.length > 1) && (
            <label>
              <span>Division</span>
              <select
                value={divisionFilter}
                onChange={(event) => setDivisionFilter(event.target.value)}
              >
                <option value="all">All divisions</option>
                {divisions.data
                  ?.filter(
                    (division) =>
                      currentUserRole === "admin" ||
                      accessibleDivisionIDs.includes(division.id),
                  )
                  .map((division) => (
                    <option value={division.id} key={division.id}>
                      {division.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label>
            <span>Created by</span>
            <select
              value={createdByFilter}
              onChange={(event) => setCreatedByFilter(event.target.value)}
            >
              <option value="all">Anyone</option>
              {directoryUsers.data?.map((user) => (
                <option value={user.id} key={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
          <label className="knowledge-private-filter">
            <input
              type="checkbox"
              checked={showPrivateContent}
              onChange={(event) => setShowPrivateContent(event.target.checked)}
            />
            <span>
              {currentUserRole === "admin"
                ? "Show all private content"
                : "Show my private content"}
            </span>
            <small>
              {currentUserRole === "admin"
                ? "Includes private content from every creator."
                : "Includes private content created by you."}
            </small>
          </label>
          <fieldset>
            <legend>Tags</legend>
            <div>
              {availableKnowledgeTags.map((tag) => (
                <label key={tag}>
                  <input
                    type="checkbox"
                    checked={filterTags.includes(tag)}
                    onChange={() =>
                      setFilterTags((current) =>
                        current.includes(tag)
                          ? current.filter((item) => item !== tag)
                          : [...current, tag],
                      )
                    }
                  />
                  <span>{tag}</span>
                </label>
              ))}
              {!availableKnowledgeTags.length && (
                <small>No tags available.</small>
              )}
            </div>
          </fieldset>
        </div>
      )}
    </div>
  );
  const viewModeControl = (
    <div
      className="knowledge-view-switch"
      role="group"
      aria-label="Knowledge view"
    >
      <button
        type="button"
        aria-pressed={viewMode === "list"}
        onClick={() => changeViewMode("list")}
      >
        <svg viewBox="0 0 18 18" aria-hidden="true">
          <path d="M3 5h12M3 9h12M3 13h12" />
        </svg>
        List
      </button>
      <button
        type="button"
        aria-pressed={viewMode === "notion"}
        onClick={() => changeViewMode("notion")}
      >
        <svg viewBox="0 0 18 18" aria-hidden="true">
          <rect x="3" y="3" width="5" height="5" rx="1" />
          <rect x="10" y="3" width="5" height="5" rx="1" />
          <rect x="3" y="10" width="5" height="5" rx="1" />
          <rect x="10" y="10" width="5" height="5" rx="1" />
        </svg>
        Card
      </button>
      <button
        type="button"
        aria-pressed={viewMode === "tree"}
        onClick={() => changeViewMode("tree")}
      >
        <svg viewBox="0 0 18 18" aria-hidden="true">
          <path d="M5 3v12M5 6h4M5 12h4" />
          <rect x="9" y="4" width="6" height="4" rx="1" />
          <rect x="9" y="10" width="6" height="4" rx="1" />
        </svg>
        Tree
      </button>
    </div>
  );
  const orderControl = (
    <div className="knowledge-order-control" ref={orderMenuRef}>
      <button
        type="button"
        className={`knowledge-advanced-trigger ${orderMenuOpen ? "active" : ""}`}
        aria-expanded={orderMenuOpen}
        aria-label="Order knowledge items"
        title="Order by"
        onClick={() => setOrderMenuOpen((current) => !current)}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M4 5h12M4 10h8M4 15h4" />
          <path d="m14 12 2 2 2-2M16 14V6" />
        </svg>
      </button>
      {orderMenuOpen && (
        <label className="knowledge-order-menu">
          <span>Order by</span>
          <select
            autoFocus
            aria-label={
              viewMode === "tree" ? "Order tree items" : "Order knowledge items"
            }
            value={viewMode === "tree" ? treeOrder : listOrder}
            onChange={(event) => {
              const next = event.target.value as KnowledgeTreeOrder;
              if (viewMode === "tree") {
                setTreeOrder(next);
                localStorage.setItem("npms:knowledge-tree-order", next);
              } else {
                setListOrder(next);
                localStorage.setItem("npms:knowledge-list-order", next);
              }
            }}
          >
            <option value="most-read">
              {viewMode === "tree" ? "Most Read" : "Most Viewed"}
            </option>
            <option value="recent-edit">Recent Edit</option>
            <option value="title">Title</option>
          </select>
        </label>
      )}
    </div>
  );
  return (
    <section
      className={`knowledge-panel knowledge-list-page ${addOpen ? "creating" : ""}`}
    >
      <header className="knowledge-list-hero">
        <div>
          <h1>
            {knowledgeCollection === "personal"
              ? "Your personal note"
              : "Knowledge library"}
          </h1>
          <p>
            {knowledgeCollection === "personal"
              ? "Create anything for your personal knowledge"
              : "Browse organizational knowledge, decisions, meeting notes, and lessons learned."}
          </p>
        </div>
        <div className="knowledge-hero-actions">
          {viewModeControl}
          <button
            type="button"
            className="knowledge-add-button"
            onClick={() => {
              if (onOpenNew) {
                onOpenNew();
                return;
              }
              setNewTypes([kind]);
              setNewWorkspace(workspaces.data?.[0]?.id ?? "");
              setAddOpen(true);
            }}
          >
            + Add New
          </button>
        </div>
      </header>
      <div className="knowledge-list-toolbar">
        {viewMode !== "tree" && (
          <div
            className="knowledge-kind-tabs"
            role="tablist"
            aria-label="Knowledge types"
          >
            {[
              ...(drafts.data?.length
                ? [{ id: "drafts" as const, label: "Your Draft" }]
                : []),
              { id: "recents" as const, label: "Recents" },
              { id: "most-viewed" as const, label: "Most Viewed" },
            ].map((collection) => (
              <button
                role="tab"
                aria-selected={knowledgeCollection === collection.id}
                className={
                  knowledgeCollection === collection.id ? "active" : ""
                }
                onClick={() => {
                  setKnowledgeCollection(collection.id);
                  setMoreOpen(false);
                }}
                key={collection.id}
              >
                {collection.label}
              </button>
            ))}
            {visibleKinds.map((item) => (
              <button
                role="tab"
                aria-selected={
                  knowledgeCollection === "category" && kind === item.id
                }
                className={
                  knowledgeCollection === "category" && kind === item.id
                    ? "active"
                    : ""
                }
                style={
                  knowledgeCollection === "category" && kind === item.id
                    ? ({ "--kb-color": item.color } as React.CSSProperties)
                    : undefined
                }
                onClick={() => {
                  setKnowledgeCollection("category");
                  setKind(item.id);
                  setMoreOpen(false);
                }}
                key={item.id}
              >
                {item.label}
              </button>
            ))}
            {moreKinds.length > 0 && (
              <div className="knowledge-more">
                <button
                  className={
                    moreKinds.some((item) => item.id === kind) ? "active" : ""
                  }
                  aria-haspopup="menu"
                  aria-expanded={moreOpen}
                  onClick={() => setMoreOpen((value) => !value)}
                >
                  More... <span>{moreOpen ? "▴" : "▾"}</span>
                </button>
                {moreOpen && (
                  <div className="knowledge-more-menu" role="menu">
                    {moreKinds.map((item) => (
                      <button
                        role="menuitem"
                        className={kind === item.id ? "selected" : ""}
                        onClick={() => {
                          setKnowledgeCollection("category");
                          setKind(item.id);
                          setMoreOpen(false);
                        }}
                        key={item.id}
                      >
                        <i style={{ background: item.color }} />
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="knowledge-filter-actions">
              {advancedFilterControl}
              {knowledgeCollection !== "recents" &&
                knowledgeCollection !== "most-viewed" &&
                orderControl}
            </div>
            <div className="knowledge-total knowledge-tab-total">
              <strong>
                {knowledgeCollection === "category"
                  ? (documents.data?.length ?? 0)
                  : knowledgeCollection === "drafts"
                    ? (drafts.data?.length ?? 0)
                  : filtered.length}
              </strong>
              <span>
                {knowledgeCollection === "drafts"
                  ? "Your drafts"
                  : knowledgeCollection === "recents"
                  ? "Recent entries"
                  : knowledgeCollection === "most-viewed"
                    ? "Most viewed entries"
                    : `${kinds.find((item) => item.id === kind)?.label} entries`}
              </span>
            </div>
          </div>
        )}
        {viewMode === "tree" && (
          <div className="knowledge-list-filters knowledge-tree-filter-row">
            <div className="knowledge-filter-actions">
              {advancedFilterControl}
              {orderControl}
            </div>
          </div>
        )}
      </div>
      <div
        className={`knowledge-table ${viewMode === "notion" ? "notion-view" : ""} ${viewMode === "tree" ? "tree-view" : ""}`}
      >
        {viewMode === "list" && (
          <div className="knowledge-table-head">
            <span>Title</span>
            <span aria-hidden="true" />
            <span>Created by</span>
            <span>Last updated</span>
          </div>
        )}
        {viewMode !== "tree" && (knowledgeCollection === "drafts" ? drafts.isPending : documents.isPending) && (
          <div className="knowledge-loading">
            <i />
            <i />
            <i />
          </div>
        )}
        {!(knowledgeCollection === "drafts" ? drafts.isPending : documents.isPending) &&
          viewMode === "list" &&
          knowledgePager.pageItems.map((item) => (
            <button
              type="button"
              className="knowledge-row"
              key={item.id}
              onClick={() => knowledgeCollection === "drafts" ? resumeDraft(item) : openKnowledgeDetail(item)}
            >
              <div className="knowledge-entry-title">
                <span className={item.kind ?? kind}>{kindIcon(item.kind ?? kind)}</span>
                <div className="knowledge-entry-title">
                  <strong>{item.title}</strong>
                  <p>{excerpt(item.content)}</p>
                  {item.related_project_name && (
                    <small className="knowledge-project-reference">
                      Project: {item.related_project_name}
                    </small>
                  )}
                </div>
              </div>
              <span className="knowledge-private-column">
                {isPrivateKnowledge(item) && (
                  <span className="knowledge-private-icon" aria-label="Private" data-tooltip="Private" tabIndex={0}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="5" y="10" width="14" height="10" rx="2" />
                      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                    </svg>
                  </span>
                )}
              </span>
              <span className="knowledge-author-label">
                {item.author_name ?? "Unknown user"}
              </span>
              <time dateTime={item.updated_at} title={formatDateTime(item.updated_at, general.data?.date_format)}>
                {formatRelativeDate(item.updated_at, general.data?.date_format)}
              </time>
              <div className="knowledge-hover-preview" role="tooltip">
                <strong>{item.title}</strong>
                <div className="knowledge-hover-preview-content">
                  {renderMarkdownPreview(item.content)}
                </div>
              </div>
            </button>
          ))}
        {!(knowledgeCollection === "drafts" ? drafts.isPending : documents.isPending) &&
          viewMode === "notion" &&
          filtered.length > 0 && (
            <div className="knowledge-notion-grid">
              {knowledgePager.pageItems.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => knowledgeCollection === "drafts" ? resumeDraft(item) : openKnowledgeDetail(item)}
                >
                  <span className={`knowledge-notion-icon ${item.kind ?? kind}`}>
                    {kindIcon(item.kind ?? kind)}
                  </span>
                  <div className="knowledge-notion-copy">
                    <strong>{item.title}</strong>
                    <p>{excerpt(item.content)}</p>
                  </div>
                  {item.related_project_name && (
                    <span className="knowledge-notion-project">
                      Project · {item.related_project_name}
                    </span>
                  )}
                  <div className="knowledge-notion-tags">
                    {tags(item.tags)
                      .slice(0, 3)
                      .map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                  </div>
                  <footer>
                    <span>
                      {workspaceMap.get(item.workspace_id) ??
                        "Company knowledge"}
                    </span>
                    <time>{formatDate(item.updated_at)}</time>
                  </footer>
                </button>
              ))}
            </div>
          )}
        {viewMode === "tree" && (
          <div className="knowledge-tree-layout">
            <div className="knowledge-tree">
              {[
                { id: "most-read", label: "Most Read", items: mostReadEntries },
                {
                  id: "recent-edit",
                  label: "Recent Edit",
                  items: recentEditEntries,
                },
              ].map((section) => (
                <details
                  className="knowledge-tree-pseudo"
                  key={section.id}
                  open={openTreeCategories.includes(section.id)}
                >
                  <summary
                    onClick={(event) => {
                      event.preventDefault();
                      toggleTreeCategory(section.id);
                    }}
                  >
                    <span className={`knowledge-tree-type ${section.id}`}>
                      {section.id === "most-read" ? "↗" : "↻"}
                    </span>
                    <strong>{section.label}</strong>
                    <small>{section.items.length} pages</small>
                  </summary>
                  <div className="knowledge-tree-branch">
                    {section.items.map(({ item, kind: itemKind }) => (
                      <button
                        type="button"
                        key={`${itemKind}:${item.id}`}
                        className={
                          treePreview?.item.id === item.id &&
                          treePreview.kind === itemKind
                            ? "active"
                            : ""
                        }
                        onClick={() => openTreePreview(item, itemKind)}
                      >
                        <i aria-hidden="true" />
                        <span>
                          <strong>{item.title}</strong>
                        </span>
                        {isPrivateKnowledge(item) && (
                          <span className="knowledge-private-icon knowledge-tree-private-icon" aria-label="Private" data-tooltip="Private" tabIndex={0}>
                            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
                          </span>
                        )}
                      </button>
                    ))}
                    {!section.items.length && (
                      <p>
                        {section.id === "most-read"
                          ? "No reading history yet."
                          : "No knowledge pages yet."}
                      </p>
                    )}
                  </div>
                </details>
              ))}
              {treeGroups.map((group) => {
                const orderedItems = orderedTreeItems(group.items, group.id);
                const expanded = expandedTreeCategories.includes(group.id);
                const visibleItems = expanded
                  ? orderedItems.slice(0, 50)
                  : orderedItems.slice(0, 5);
                return (
                  <details
                    key={group.id}
                    open={openTreeCategories.includes(group.id)}
                  >
                    <summary
                      onClick={(event) => {
                        event.preventDefault();
                        toggleTreeCategory(group.id);
                      }}
                    >
                      <span className={`knowledge-tree-type ${group.id}`}>
                        {kindIcon(group.id)}
                      </span>
                      <strong>{group.label}</strong>
                      <small>
                        {group.pending
                          ? "Loading..."
                          : `${group.items.length} pages`}
                      </small>
                    </summary>
                    <div className="knowledge-tree-branch">
                      {visibleItems.map((item) => (
                        <button
                          type="button"
                          key={item.id}
                          className={
                            treePreview?.item.id === item.id &&
                            treePreview.kind === group.id
                              ? "active"
                              : ""
                          }
                          onClick={() => openTreePreview(item, group.id)}
                        >
                          <i aria-hidden="true" />
                          <span>
                            <strong>{item.title}</strong>
                          </span>
                          {isPrivateKnowledge(item) && (
                            <span className="knowledge-private-icon knowledge-tree-private-icon" aria-label="Private" data-tooltip="Private" tabIndex={0}>
                              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
                            </span>
                          )}
                        </button>
                      ))}
                      {!group.pending && !group.items.length && (
                        <p>No pages in this category.</p>
                      )}
                      {group.items.length > 5 && (
                        <button
                          type="button"
                          className="knowledge-tree-more"
                          onClick={() =>
                            setExpandedTreeCategories((current) =>
                              expanded
                                ? current.filter((item) => item !== group.id)
                                : [...current, group.id],
                            )
                          }
                        >
                          <span>
                            <strong>
                              {expanded
                                ? "Show less"
                                : `More (${group.items.length - 5})`}
                            </strong>
                          </span>
                        </button>
                      )}
                      {expanded && group.items.length > 50 && (
                        <p>
                          Showing the first 50 of {group.items.length} pages.
                        </p>
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
            <aside className="knowledge-tree-preview">
              {treePreview ? (
                <>
                  <header>
                    <span className={`knowledge-tree-type ${treePreview.kind}`}>
                      {kindIcon(treePreview.kind)}
                    </span>
                    <div>
                      <small>
                        {kinds.find((item) => item.id === treePreview.kind)
                          ?.label ?? "Knowledge"}
                      </small>
                      <div className="knowledge-tree-preview-title">
                        <h2>{treePreview.item.title}</h2>
                        {isPrivateKnowledge(treePreview.item) && (
                          <span className="knowledge-private-icon knowledge-tree-private-icon" aria-label="Private" data-tooltip="Private" tabIndex={0}>
                            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
                          </span>
                        )}
                      </div>
                    </div>
                  </header>
                  <div className="knowledge-tree-preview-meta">
                    <span>
                      {workspaceMap.get(treePreview.item.workspace_id) ??
                        "Company knowledge"}
                    </span>
                    <div className="knowledge-tree-preview-meta-actions">
                      <time
                        className="knowledge-tree-preview-updated"
                        aria-label="updated at"
                        title="updated at"
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <rect x="4" y="5" width="16" height="15" rx="2" />
                          <path d="M8 3v4M16 3v4M4 10h16" />
                        </svg>
                        {formatRelativeDate(
                          treePreview.item.updated_at,
                          general.data?.date_format,
                        )}
                      </time>
                      <button
                        type="button"
                        className="knowledge-tree-preview-detail-button"
                        onClick={() => openKnowledgeDetail(treePreview.item)}
                      >
                        More Detail
                      </button>
                    </div>
                  </div>
                  {treePreview.item.related_project_name && (
                    <div className="knowledge-tree-preview-project">
                      <small>Related project</small>
                      <strong>{treePreview.item.related_project_name}</strong>
                    </div>
                  )}
                  <div className="knowledge-tree-preview-tags">
                    {tags(treePreview.item.tags).map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                  <div className="knowledge-tree-preview-editor">
                    <Suspense fallback={<div className="knowledge-tree-preview-loading">Loading preview...</div>}>
                    <KnowledgeRichEditor
                      value={truncatePreviewContent(treePreview.item.content || "")}
                        onChange={() => {}}
                        readOnly
                        hideToolbar
                        compact
                        ariaLabel={`Preview of ${treePreview.item.title}`}
                      />
                    </Suspense>
                  </div>
                </>
              ) : (
                <div className="knowledge-tree-preview-empty">
                  <span aria-hidden="true">↳</span>
                  <strong>Select a knowledge page</strong>
                  <p>
                    Choose an item from the category tree to preview it here.
                  </p>
                </div>
              )}
            </aside>
          </div>
        )}
        {viewMode !== "tree" && !documents.isPending && !filtered.length && (
          <div className="knowledge-empty">
            <span>{kindIcon(kind)}</span>
            <h3>
              No {kinds.find((item) => item.id === kind)?.label.toLowerCase()}{" "}
              found
            </h3>
            <p>
              {search ||
              divisionFilter !== "all" ||
              filterTags.length ||
              createdByFilter !== "all" ||
              showPrivateContent
                ? "Try changing or clearing the active filters."
                : "Entries will appear here once knowledge is added."}
            </p>
          </div>
        )}
      </div>
      {!addOpen && viewMode !== "tree" && (
        <ListPagination
          page={knowledgePager.page}
          pageSize={knowledgePager.pageSize}
          total={knowledgePager.total}
          onPageChange={knowledgePager.setPage}
          onPageSizeChange={knowledgePager.setPageSize}
        />
      )}
      {viewMode === "tree" &&
        !treeDocumentQueries.some((query) => query.isPending) &&
        treeItemCount === 0 && (
          <p className="knowledge-tree-empty">
            No knowledge matches the current filters.
          </p>
        )}
      {addOpen && (
        <section className={`knowledge-create-page ${focusMode ? "is-focus-mode" : ""}`}>
          <header>
            <div>
              <div className="knowledge-draft-label">
                <input
                  className="knowledge-heading-title-input"
                  autoFocus
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                  readOnly={Boolean(editingKnowledge && !canEditKnowledge)}
                  placeholder="Untitled knowledge"
                  maxLength={160}
                  aria-label="Knowledge title"
                />
              </div>
            </div>
            <span className="knowledge-header-draft">
              {editingKnowledge?.publication_status === "published" ? "Published" : "Draft"}
            </span>
          </header>
          <form
            className={`${focusMode ? "focus-mode" : ""} ${inlineTocOpen && !focusMode ? "inline-toc-open" : ""}`.trim()}
            onSubmit={(event) => {
              event.preventDefault();
              if (newTitle.trim() && newTypes.length) createKnowledge.mutate("draft");
            }}
          >
            <fieldset disabled={Boolean(editingKnowledge && !canEditKnowledge)}>
            <div className="knowledge-sidebar-column">
            {leftSidebarView === "toc" ? <aside
              id="knowledge-editor-toc"
              className="knowledge-focus-toc"
              aria-label="Table of contents"
            >
              <nav>
                <div className="knowledge-document-tabs-head"><button type="button" className="knowledge-document-tabs-toggle" aria-label={`${documentTabsCollapsed ? "Expand" : "Collapse"} document tabs`} aria-controls="knowledge-document-tabs-list" aria-expanded={!documentTabsCollapsed} onClick={() => setDocumentTabsCollapsed((collapsed) => !collapsed)}><strong>Document tabs</strong><span className="knowledge-document-tabs-count" aria-hidden="true">{documentTabs.length}</span></button><button type="button" aria-label="Add document tab" title={documentTabs.length >= MAX_DOCUMENT_TABS ? "Maximum 20 document tabs" : "Add document tab"} disabled={documentTabs.length >= MAX_DOCUMENT_TABS} onClick={addDocumentTab}>+</button></div>
                {!documentTabsCollapsed && <div id="knowledge-document-tabs-list">
                {documentTabsWithHeadings.map((tab) => {
                  const active = (activeDocumentTabID ?? documentTabsWithHeadings[0]?.id) === tab.id;
                  return <section className="knowledge-document-tab" key={tab.id}>
                    <div role="tab" tabIndex={0} aria-selected={active} className={`knowledge-document-tab-button ${active ? "active" : ""}`} onClick={() => activateDocumentTab(tab)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activateDocumentTab(tab); } }} onDoubleClick={() => setEditingDocumentTabID(tab.id)}><span className="knowledge-document-tab-radar" aria-hidden="true" />{editingDocumentTabID === tab.id ? <input autoFocus value={tab.label} maxLength={100} aria-label="Document tab name" onClick={(event) => event.stopPropagation()} onChange={(event) => renameDocumentTab(tab.id, event.target.value)} onBlur={() => finishEditingDocumentTab(tab.id)} onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Enter" || event.key === "Escape") event.currentTarget.blur(); }} /> : <TocMarqueeText>{tab.label}</TocMarqueeText>}<button type="button" aria-label="Document tab menu" title="Document tab menu" onClick={(event) => event.stopPropagation()}>⋮</button></div>
                    <div className="knowledge-document-tab-outline">
                      {tab.children.map(({ heading, index }) => <button type="button" key={`${heading.label}-${index}`} className={`level-${heading.level} ${activeTocIndex === index ? "active" : ""}`} onClick={() => { setActiveDocumentTabID(tab.id); navigateToEditorHeading(index); }}><TocMarqueeText>{heading.label}</TocMarqueeText></button>)}
                    </div>
                  </section>;
                })}
                </div>}
                {!focusTableOfContents.length && <small>Add headings to create the table of contents.</small>}
              </nav>
            </aside> : <aside
              id="knowledge-editor-version-history"
              className="knowledge-focus-toc knowledge-version-history-sidebar"
              aria-label="Version history"
            >
              <nav>
                <div className="knowledge-version-history-heading">
                  <strong>Version history</strong>
                </div>
                <div className="knowledge-version-history-actions">
                  <button type="button" aria-label="Create new version" title="Create new version" onClick={() => createVersion.mutate()} disabled={createVersion.isPending || !editingKnowledge}>+ New Version</button>
                </div>
                {versionActionMessage && <small className="knowledge-version-history-action-message">{versionActionMessage}</small>}
                {editingKnowledge ? (
                  <>
                    <div className="knowledge-version-history-current" onClick={() => selectVersion({ id: "current", action: "current", created_at: editingKnowledge.updated_at, actor_name: lastUpdatedByName, title: editingKnowledge.title, content: editingKnowledge.content })}>
                    <div className="knowledge-version-history-version-row">
                      <time className={activeVersionID === "current" ? "is-active" : ""} dateTime={currentVersionDisplayAt ?? editingKnowledge.updated_at} title={formatDateTime(currentVersionDisplayAt ?? editingKnowledge.updated_at, general.data?.date_format)}>
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13H4V6a1 1 0 0 1 1-1Z" /></svg>
                        {formatRelativeDate(currentVersionDisplayAt ?? editingKnowledge.updated_at, general.data?.date_format)}
                      </time>
                      <button type="button" className="knowledge-version-history-menu-trigger" aria-label="Version actions" aria-expanded={versionMenuOpenID === "current"} onClick={(event) => { event.stopPropagation(); setVersionMenuOpenID((open) => open === "current" ? null : "current"); }}>⋮</button>
                      {versionMenuOpenID === "current" && (
                        <div className="knowledge-version-history-menu">
                          <button type="button" onClick={() => selectVersion({ id: "current", action: "current", created_at: editingKnowledge.updated_at, actor_name: lastUpdatedByName, title: editingKnowledge.title, content: editingKnowledge.content })}>Restore this version</button>
                        </div>
                      )}
                    </div>
                    {activeVersionID === "current" && <i className="knowledge-version-current-dot" aria-label="Current version" title="Current version" />}
                    <small title="Last updated by"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-3.1 3.1-5 7-5s6.2 1.9 7 5" /></svg>{lastUpdatedByName}</small>
                    </div>
                    {versionHistoryItems.map((version) => (
                      <div className="knowledge-version-history-current knowledge-version-history-previous" key={version.id} onClick={() => selectVersion(version)}>
                        <div className="knowledge-version-history-version-row">
                          <time className={activeVersionID === version.id ? "is-active" : ""} dateTime={version.created_at} title={formatDateTime(version.created_at, general.data?.date_format)}>
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13H4V6a1 1 0 0 1 1-1Z" /></svg>
                            {formatRelativeDate(version.created_at, general.data?.date_format)}
                          </time>
                          <button type="button" className="knowledge-version-history-menu-trigger" aria-label="Version actions" aria-expanded={versionMenuOpenID === version.id} onClick={(event) => { event.stopPropagation(); setVersionMenuOpenID((open) => open === version.id ? null : version.id); }}>⋮</button>
                          {versionMenuOpenID === version.id && (
                            <div className="knowledge-version-history-menu">
                              <button type="button" onClick={(event) => { event.stopPropagation(); selectVersion(version); }}>Restore this version</button>
                              <button type="button" disabled={removeVersion.isPending} onClick={(event) => { event.stopPropagation(); setVersionActionMessage("Removing version..."); removeVersion.mutate(version.id); }}>{removeVersion.isPending ? "Removing..." : "Remove"}</button>
                            </div>
                          )}
                        </div>
                        {activeVersionID === version.id && <i className="knowledge-version-current-dot" aria-label="Selected version" title="Selected version" />}
                        <small title="Version author"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-3.1 3.1-5 7-5s6.2 1.9 7 5" /></svg>{version.actor_name ?? "Unknown user"}</small>
                      </div>
                    ))}
                  </>
                ) : (
                  <small>Not saved yet.</small>
                )}
              </nav>
            </aside>}
            <div className="knowledge-sidebar-tabs" aria-label="Knowledge side panels">
              <button
                type="button"
                className="knowledge-sidebar-tab knowledge-toc-sidebar-tab"
                aria-label="Table of contents"
                aria-pressed={leftSidebarView === "toc"}
                title="Table of contents"
                onClick={() => setLeftSidebarView("toc")}
              >
                <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
                  <circle cx="5" cy="6" r="1" />
                  <circle cx="5" cy="16" r="1" />
                  <circle cx="5" cy="26" r="1" />
                  <line x1="10" x2="28" y1="6" y2="6" />
                  <line x1="10" x2="28" y1="16" y2="16" />
                  <line x1="10" x2="28" y1="26" y2="26" />
                </svg>
              </button>
              <button
                type="button"
                className="knowledge-sidebar-tab knowledge-version-history-tab"
                aria-label="Version history"
                aria-pressed={leftSidebarView === "history"}
                title="Version history"
                onClick={() => setLeftSidebarView("history")}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M12 8V12L14.5 14.5" />
                  <path fill="currentColor" stroke="none" d="M5.60414 5.60414L5.07381 5.07381C8.86873 1.27889 15.042 1.31758 18.8622 5.13777C22.6824 8.95796 22.7211 15.1313 18.9262 18.9262C15.1313 22.7211 8.95796 22.6824 5.13777 18.8622C2.87392 16.5984 1.93907 13.5099 2.3405 10.5812L3.82661 10.7849C3.48663 13.2652 4.27785 15.881 6.19843 17.8016C9.44291 21.0461 14.6664 21.0646 17.8655 17.8655C21.0646 14.6664 21.0461 9.44291 17.8016 6.19843C14.5571 2.95395 9.33358 2.93536 6.13447 6.13447L4.86809 7.40085L4.33399 7.62051L3.58777 6.87429L4.33776 6.87052L5.60414 5.60414ZM4.3212 3.57498C4.73541 3.5729 5.07288 3.90699 5.07496 4.3212L5.08775 6.86675L3.58777 6.87429L3.57498 4.32874C3.5729 3.91453 3.90699 3.57706 4.3212 3.57498ZM4.34153 6.12053L6.88708 6.13332C7.30129 6.1354 7.63538 6.47287 7.6333 6.88708C7.63122 7.30129 7.29375 7.63539 6.87954 7.6333L4.33399 7.62051L4.34153 6.12053Z" />
                </svg>
              </button>
            </div>
            </div>
            <div className="knowledge-editor-column">
              {!focusMode && !inlineTocOpen && (
                <button
                  type="button"
                  className="knowledge-inline-toc-toggle"
                  aria-label="Show table of contents"
                  aria-controls="knowledge-editor-toc"
                  aria-expanded="false"
                  title="Show table of contents"
                  onClick={() => setInlineTocOpen(true)}
                >
                  <span aria-hidden="true">Table of Contents</span>
                </button>
              )}
              {true ? (
                <section className="knowledge-content-field">
                  <Suspense
                    fallback={
                      <div className="knowledge-editor-loading">
                        Loading visual editor...
                      </div>
                    }
                  >
                    <KnowledgeRichEditor
                      key={activeDocumentTabID ?? documentTabs[0]?.id}
                      ref={knowledgeEditorRef}
                      value={newContent}
                      onChange={updateActiveDocumentContent}
                      readOnly={!canEditKnowledge}
                    />
                  </Suspense>
                </section>
              ) : (
                <section className="knowledge-external-resources external-primary-resource">
                  <div>
                    <strong>External resource</strong>
                    <small>
                      Add a public URL, Google Docs, or another web resource.
                    </small>
                  </div>
                  <div className="knowledge-resource-input">
                    <input
                      autoFocus
                      type="url"
                      value={resourceUrl}
                      onChange={(event) => {
                        setResourceUrl(event.target.value);
                        setResourceError("");
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addExternalResource();
                        }
                      }}
                      placeholder="https://docs.google.com/..."
                    />
                    <button
                      type="button"
                      disabled={!resourceUrl.trim()}
                      onClick={addExternalResource}
                    >
                      Add resource
                    </button>
                  </div>
                  {resourceError && (
                    <small className="knowledge-resource-error">
                      {resourceError}
                    </small>
                  )}
                  <div className="knowledge-resource-list">
                    {externalResources.map((item) => (
                      <div key={item.id}>
                        <i>{item.type === "google_docs" ? "G" : "↗"}</i>
                        <span>
                          <strong>{item.label}</strong>
                          <small>{item.url}</small>
                        </span>
                        <button
                          type="button"
                          aria-label={`Remove ${item.label}`}
                          onClick={() =>
                            setExternalResources((current) =>
                              current.filter(
                                (resource) => resource.id !== item.id,
                              ),
                            )
                          }
                        >
                          x
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
            <aside className="knowledge-metadata-panel">
              <div className="knowledge-metadata-top">
                <div className={`knowledge-focus-toggle ${focusMode ? "active" : ""}`} aria-label="Focus mode">
                  <button type="button" aria-pressed={focusMode} onClick={() => onFocusModeChange(!focusMode)}>
                    <i aria-hidden="true" />
                    Focus Mode
                  </button>
                </div>
              </div>
              <section className="knowledge-visibility-panel" aria-label="Accessibility">
                <div className="knowledge-visibility-heading">
                  <div>
                    <strong>Accessibility</strong>
                    <small>Who can access the content</small>
                  </div>
                  <button type="button" className="knowledge-share-button" disabled={!canShareKnowledge} aria-disabled={!canShareKnowledge} onClick={() => { if (!canShareKnowledge) return; setShareTab("users"); setShareUserInitial(null); setShareShowSelected(false); setShareModalOpen(true); }}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="2" /><circle cx="6" cy="12" r="2" /><circle cx="18" cy="19" r="2" /><path d="m8 11 8-5M8 13l8 5" /></svg>
                    Share
                  </button>
                </div>
                <div className="knowledge-visibility-summary">
                  {newDivisionIDs.length > 0 && <div><span aria-hidden="true">▦</span><strong>{newDivisionIDs.length} divisions</strong></div>}
                  {newTeamIDs.length > 0 && <div><span aria-hidden="true">▤</span><strong>{newTeamIDs.length} teams</strong></div>}
                  {newUserIDs.length > 0 && <div><span aria-hidden="true">♙</span><strong>{newUserIDs.length} users</strong></div>}
                  {!newDivisionIDs.length && !newTeamIDs.length && !newUserIDs.length && <span className="knowledge-visibility-private"><span aria-hidden="true">🔒</span> This content is private</span>}
                </div>
              </section>
              {shareModalOpen && (
                <div className="knowledge-share-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShareModalOpen(false); }}>
                  <section className="knowledge-share-modal" role="dialog" aria-modal="true" aria-labelledby="knowledge-share-title">
                    <header>
                      <div><strong id="knowledge-share-title">Share knowledge</strong><small>Choose people, divisions, or teams.</small></div>
                      <button type="button" className="knowledge-share-close" aria-label="Close share dialog" onClick={() => setShareModalOpen(false)}>×</button>
                    </header>
                    <nav className="knowledge-share-tabs" aria-label="Share target type">
                      {(["users", "divisions", "teams"] as const).map((tab) => (
                        <button key={tab} type="button" className={shareTab === tab ? "active" : ""} onClick={() => setShareTab(tab)}>
                          {tab === "users" ? "User" : tab === "divisions" ? "Division" : "Teams"} ({tab === "users" ? newUserIDs.length : tab === "divisions" ? newDivisionIDs.length : newTeamIDs.length})
                        </button>
                      ))}
                    </nav>
                    <div className={`knowledge-share-list${shareTab === "users" ? " is-user-list" : ""}`}>
                      <div className="knowledge-share-list-heading">
                        <span>{shareTab === "users" ? "Users" : shareTab === "divisions" ? "Divisions" : "Teams"}</span>
                        <button type="button" className={`knowledge-share-show-selected${shareShowSelected ? " active" : ""}`} aria-pressed={shareShowSelected} onClick={() => setShareShowSelected((current) => !current)}>{shareShowSelected ? "Show All" : "Show Selected"} ({selectedShareCount})</button>
                        <span className="knowledge-share-actions-divider" aria-hidden="true" />
                        <button type="button" className="knowledge-share-clear" onClick={clearShareSelection}>Clear all</button>
                      </div>
                      {shareTab === "users" && <div className="knowledge-share-users-picker">
                        <nav className="knowledge-share-alphabet" aria-label="Filter users by initial">
                          <button type="button" className={shareUserInitial === null ? "active" : ""} onClick={() => setShareUserInitial(null)}>All</button>
                          {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((initial) => <button type="button" className={shareUserInitial === initial ? "active" : ""} key={initial} onClick={() => setShareUserInitial(initial)}>{initial}</button>)}
                        </nav>
                        <div className="knowledge-share-user-results">
                          {shareUsers.data?.map((user) => {
                            const checked = newUserIDs.includes(user.id);
                            const canEdit = newEditorUserIDs.includes(user.id);
                            return <label className={checked ? "selected" : ""} key={user.id}><input type="checkbox" checked={checked} onChange={() => toggleShareUser(user.id, checked)} /><span>{user.name}</span><span className="knowledge-share-permissions">{checked&&<select aria-label={`Share ${user.name} as`} value={canEdit ? "editor" : "viewer"} onClick={(event) => event.stopPropagation()} onChange={(event) => setShareUserRole(user.id, event.target.value as "viewer" | "editor" | "owner")}><option value="viewer">Viewer</option><option value="editor">Editor</option><option disabled>────────</option><option value="owner">Transfer Ownership</option></select>}</span></label>;
                          })}
                        </div>
                      </div>}
                      {shareTab === "divisions" && divisions.data?.map((division) => {
                        if (shareShowSelected && !newDivisionIDs.includes(division.id)) return null;
                        const checked = newDivisionIDs.includes(division.id);
                        return <label className={checked ? "selected" : ""} key={division.id}><input type="checkbox" checked={checked} onChange={() => setNewDivisionIDs((current) => checked ? current.filter((id) => id !== division.id) : [...current, division.id])} /><i className="knowledge-share-target-icon" aria-hidden="true">{division.icon ?? "🏢"}</i><span>{division.name}</span><small className="knowledge-share-member-count">{(division.member_ids?.length ?? 0) === 0 ? "-" : `${division.member_ids?.length} user${division.member_ids?.length === 1 ? "" : "s"}`}</small></label>;
                      })}
                      {shareTab === "teams" && teams.data?.map((team) => {
                        if (shareShowSelected && !newTeamIDs.includes(team.id)) return null;
                        const checked = newTeamIDs.includes(team.id);
                        return <label className={checked ? "selected" : ""} key={team.id}><input type="checkbox" checked={checked} onChange={() => setNewTeamIDs((current) => checked ? current.filter((id) => id !== team.id) : [...current, team.id])} /><i className="knowledge-check-color" style={{ background: team.color ?? "#4774b8" }} /><span>{team.name}</span><small className="knowledge-share-member-count">{(team.member_ids?.length ?? 0) === 0 ? "-" : `${team.member_ids?.length} user${team.member_ids?.length === 1 ? "" : "s"}`}</small></label>;
                      })}
                      {((shareTab === "users" && shareUsers.isPending) || (shareTab === "divisions" && divisions.isPending) || (shareTab === "teams" && teams.isPending)) && <small>Loading share targets...</small>}
                    </div>
                    <footer><button type="button" className="knowledge-share-button knowledge-share-done-button" disabled={updateKnowledgeSharing.isPending} onClick={() => { setShareModalOpen(false); if (editingKnowledge) updateKnowledgeSharing.mutate(); }}>{updateKnowledgeSharing.isPending ? "Saving..." : "Done"}</button></footer>
                  </section>
                </div>
              )}
              {editingKnowledge && (
                <section className="knowledge-view-meta" aria-label="Knowledge ownership">
                  <div>
                    <span>Creator</span>
                    <strong>{editingKnowledge.author_name ?? "Unknown user"}</strong>
                  </div>
                  <div>
                    <span>Created Time</span>
                    <strong
                      title={editingKnowledge.created_at ? formatDateTime(editingKnowledge.created_at, general.data?.date_format) : undefined}
                    >
                      {editingKnowledge.created_at
                        ? formatRelativeDate(editingKnowledge.created_at, general.data?.date_format)
                        : "Not available"}
                    </strong>
                  </div>
                </section>
              )}
              <details className="knowledge-metadata-section">
                <summary>Knowledge cover</summary>
              <section className="knowledge-cover-field">
                <div>
                  <small>JPEG, PNG, WebP, or an image URL</small>
                </div>
                <div className="knowledge-cover-source" role="group" aria-label="Knowledge cover source">
                  <button type="button" className={coverSource === "upload" ? "active" : ""} aria-pressed={coverSource === "upload"} onClick={() => { setCoverSource("upload"); setCoverUrl(""); setCoverError(""); }}>Upload image</button>
                  <button type="button" className={coverSource === "url" ? "active" : ""} aria-pressed={coverSource === "url"} onClick={() => { setCoverSource("url"); setCoverUrl(""); setCoverError(""); }}>Image URL</button>
                </div>
                {coverSource === "upload" ? (
                  <label className={`knowledge-cover-upload ${coverUploadStatus === "uploading" ? "uploading" : ""}`}>
                    <input type="file" accept="image/jpeg,image/png,image/webp" disabled={coverUploadStatus === "uploading"} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadKnowledgeCover(file); event.currentTarget.value = ""; }} />
                    <span>{coverUploadStatus === "uploading" ? "Uploading cover..." : "Choose cover image"}</span>
                    <small>Maximum 5 MB</small>
                  </label>
                ) : (
                  <input className="knowledge-cover-url" type="url" maxLength={2048} value={coverUrl} onChange={(event) => { setCoverUrl(event.target.value); setCoverError(""); }} placeholder="https://example.com/cover.jpg" aria-label="Knowledge cover URL" />
                )}
                {coverUrl && <div className="knowledge-cover-preview"><img src={coverUrl} alt="Knowledge cover preview" loading="lazy" referrerPolicy="no-referrer" /><button type="button" aria-label="Remove knowledge cover" onClick={() => { setCoverUrl(""); setCoverError(""); }}>Remove</button></div>}
                {coverError && <small className="knowledge-cover-error" role="alert">{coverError}</small>}
              </section>
              </details>
              {sourceProjectID && (
                <details className="knowledge-metadata-section">
                  <summary>Related project</summary>
                <section className="knowledge-related-project">
                  {sourceProject.isPending ? (
                    <small>Loading project metadata...</small>
                  ) : sourceProject.data ? (
                    <div>
                      <strong>{sourceProject.data.name}</strong>
                      <small>
                        {sourceProject.data.project_type ?? "Project"} ·{" "}
                        {sourceProject.data.status}
                      </small>
                      <code>{sourceProject.data.id}</code>
                    </div>
                  ) : (
                    <small>Project metadata could not be loaded.</small>
                  )}
                </section>
                </details>
              )}
              <details className="knowledge-metadata-section">
                <summary><span>Knowledge types{newTypes.length > 0 && <b className="knowledge-metadata-count"><i>{newTypes.length}</i></b>}</span></summary>
              <fieldset className="knowledge-type-checklist">
                <legend>Knowledge types</legend>
                <button
                  type="button"
                  className="knowledge-division-clear"
                  disabled={!newTypes.length}
                  onClick={() => setNewTypes([])}
                >
                  Clear all
                </button>
                <div>
                  {kinds.map((item) => {
                    const checked = newTypes.includes(item.id);
                    return (
                      <label
                        className={checked ? "selected" : ""}
                        key={item.id}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setNewTypes((current) =>
                              checked
                                ? current.length > 1
                                  ? current.filter((id) => id !== item.id)
                                  : current
                                : [...current, item.id],
                            )
                          }
                        />
                        <i
                          className="knowledge-check-icon"
                          style={{
                            background: `${item.color}18`,
                            color: item.color,
                          }}
                        >
                          {kindIcon(item.id)}
                        </i>
                        <span>{item.label}</span>
                      </label>
                    );
                  })}
                </div>
                {!addingType ? (
                  <button
                    type="button"
                    className="knowledge-add-type"
                    onClick={() => setAddingType(true)}
                  >
                    + Add type
                  </button>
                ) : (
                  <div className="knowledge-inline-type">
                    <input
                      className="knowledge-inline-type-icon"
                      value={typeIcon}
                      onChange={(event) => setTypeIcon(event.target.value)}
                      placeholder="📚"
                      aria-label="New type emoji or icon"
                      title="Emoji or icon"
                      maxLength={16}
                    />
                    <input
                      autoFocus
                      value={typeLabel}
                      onChange={(event) => setTypeLabel(event.target.value)}
                      placeholder="New type name"
                      maxLength={50}
                    />
                    <input
                      type="color"
                      value={typeColor}
                      onChange={(event) => setTypeColor(event.target.value)}
                      aria-label="New type color"
                    />
                    <div>
                      <button
                        type="button"
                        onClick={() => {
                          setAddingType(false);
                          setTypeLabel("");
                          setTypeIcon("📚");
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="save-type"
                        disabled={!typeLabel.trim() || createType.isPending}
                        onClick={() => createType.mutate()}
                      >
                        {createType.isPending ? "Adding..." : "Add"}
                      </button>
                    </div>
                    {createType.isError && (
                      <small className="knowledge-inline-type-error">
                        {createType.error.message}
                      </small>
                    )}
                  </div>
                )}
              </fieldset>
              </details>
              <details className="knowledge-metadata-section">
                <summary>Tags</summary>
              <fieldset className="knowledge-tag-picker">
                <legend>Tags</legend>
                <div className="knowledge-selected-tags">
                  {newTags.map((tag) => (
                    <button
                      type="button"
                      key={tag}
                      onClick={() =>
                        setNewTags((current) =>
                          current.filter((item) => item !== tag),
                        )
                      }
                    >
                      {tag}
                      <span>×</span>
                    </button>
                  ))}
                  {!newTags.length && <small>No tags selected</small>}
                </div>
                {availableKnowledgeTags.some(
                  (tag) => !newTags.includes(tag),
                ) && (
                  <div className="knowledge-tag-options">
                    <small>Choose existing</small>
                    <div>
                      {availableKnowledgeTags
                        .filter((tag) => !newTags.includes(tag))
                        .slice(0, 8)
                        .map((tag) => (
                          <button
                            type="button"
                            key={tag}
                            onClick={() =>
                              setNewTags((current) => [...current, tag])
                            }
                          >
                            {tag}
                          </button>
                        ))}
                    </div>
                  </div>
                )}
                <div className="knowledge-tag-add">
                  <input
                    value={tagDraft}
                    onChange={(event) => setTagDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addKnowledgeTag();
                      }
                    }}
                    placeholder="Add new tag"
                    maxLength={50}
                  />
                  <button
                    type="button"
                    disabled={!tagDraft.trim()}
                    onClick={addKnowledgeTag}
                  >
                    Add
                  </button>
                </div>
              </fieldset>
              </details>
              {
                <details className="knowledge-metadata-section">
                  <summary>External resources</summary>
                <section className="knowledge-external-resources">
                  <div>
                    <small>Public URL or Google Docs link</small>
                  </div>
                  <div className="knowledge-resource-input">
                    <input
                      type="url"
                      value={resourceUrl}
                      onChange={(event) => {
                        setResourceUrl(event.target.value);
                        setResourceError("");
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addExternalResource();
                        }
                      }}
                      placeholder="https://docs.google.com/..."
                    />
                    <button
                      type="button"
                      disabled={!resourceUrl.trim()}
                      onClick={addExternalResource}
                    >
                      Add
                    </button>
                  </div>
                  {resourceError && (
                    <small className="knowledge-resource-error">
                      {resourceError}
                    </small>
                  )}
                  <div className="knowledge-resource-list">
                    {externalResources.map((item) => (
                      <div key={item.id}>
                        <i>{item.type === "google_docs" ? "G" : "↗"}</i>
                        <span>
                          <strong>{item.label}</strong>
                          <small>{item.url}</small>
                        </span>
                        <button
                          type="button"
                          aria-label={`Remove ${item.label}`}
                          onClick={() =>
                            setExternalResources((current) =>
                              current.filter(
                                (resource) => resource.id !== item.id,
                              ),
                            )
                          }
                        >
                          x
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
                </details>
              }
            </aside>
            {createKnowledge.isError && (
              <p className="knowledge-form-error">
                {createKnowledge.error.message}
              </p>
            )}
            </fieldset>
            <footer>
              <div className="knowledge-save-information">
                <div className={autosaveStatus === "saving" ? "is-saving" : autosaveStatus === "error" ? "is-error" : ""}>
                    <strong className="knowledge-autosave-title"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.0789 3V2.25M3.67981 11.3333H2.92981M3.67981 13L3.15157 13.5324M5.88787 11.8657C6.18191 11.574 6.18377 11.0991 5.89203 10.8051M2.52824 10.8009C2.2342 10.5092 1.75933 10.511 1.46759 10.8051M18.6156 7.39279C18.8325 7.74565 19.2944 7.85585 19.6473 7.63892C20.0001 7.42199 20.1103 6.96007 19.8934 6.60721M12.0789 2.25C7.03155 2.25 2.92981 6.3112 2.92981 11.3333H4.42981C4.42981 7.15072 7.84884 3.75 12.0789 3.75V2.25ZM2.92981 11.3333V13H4.42981V11.3333H2.92981ZM4.20805 13.5324L5.88787 11.8657L4.83138 10.8009L3.15157 12.4676L4.20805 13.5324ZM4.20805 12.4676L2.52824 10.8009L1.47176 11.8657L3.15157 13.5324L4.20805 12.4676ZM19.8934 6.60721C18.287 3.99427 15.3873 2.25 12.0789 2.25V3.75C14.8484 3.75 17.2727 5.20845 18.6156 7.39279L19.8934 6.60721Z" /><path opacity="0.5" d="M11.8825 21V21.75M20.3137 12.6667H21.0637M20.3137 11L20.8409 10.4666M18.1002 12.1333C17.8056 12.4244 17.8028 12.8993 18.094 13.1939M21.4727 13.2001C21.7673 13.4913 22.2421 13.4885 22.5333 13.1939M5.31769 16.6061C5.10016 16.2536 4.63806 16.1442 4.28557 16.3618C3.93307 16.5793 3.82366 17.0414 4.0412 17.3939M11.8825 21.75C16.9448 21.75 21.0637 17.6915 21.0637 12.6667H19.5637C19.5637 16.8466 16.133 20.25 11.8825 20.25V21.75ZM21.0637 12.6667V11H19.5637V12.6667H21.0637ZM19.7864 10.4666L18.1002 12.1333L19.1546 13.2001L20.8409 11.5334L19.7864 10.4666ZM19.7864 11.5334L21.4727 13.2001L22.5271 12.1332L20.8409 10.4666ZM4.0412 17.3939C5.65381 20.007 8.56379 21.75 11.8825 21.75V20.25C9.09999 20.25 6.6656 18.7903 5.31769 16.6061L4.0412 17.3939Z" /></svg>Draft autosave</strong>
                  <small aria-live="polite" title={autosavedAt ? formatDateTime(autosavedAt.toISOString(), general.data?.date_format) : undefined}>
                    {autosaveStatus === "saving"
                      ? <span className="knowledge-saving-label">Saving<span aria-hidden="true" className="knowledge-saving-dots"><i>.</i><i>.</i><i>.</i></span></span>
                      : autosaveStatus === "error"
                        ? <span
                            className="knowledge-autosave-error-trigger"
                            role="button"
                            tabIndex={0}
                            onClick={() => setShowAutosaveError(true)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setShowAutosaveError(true);
                              }
                            }}
                          >
                            Autosave failed — retrying in 20 seconds
                          </span>
                        : autosavedAt
                          ? `Saved ${formatRelativeDate(autosavedAt.toISOString(), general.data?.date_format)}`
                          : ""}
                  </small>
                </div>
                <span className="knowledge-save-divider" aria-hidden="true" />
                <span className="knowledge-save-document-size">Document size: <b>{draftDocumentSize}</b></span>
                <span className="knowledge-save-divider" aria-hidden="true" />
                <span className={`knowledge-save-word-count ${draftWordCount > 50000 ? "over-limit" : ""}`}><b>{draftWordCount.toLocaleString()}</b> words / 50,000 words</span>
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => {
                    if (knowledgeDetailHistoryRef.current) {
                      window.history.back();
                      return;
                    }
                    const url = new URL(window.location.href);
                    url.searchParams.delete("knowledge");
                    window.history.replaceState(window.history.state, "", url);
                    setAddOpen(false);
                    setEditingKnowledge(null);
                    autosaveDraftRef.current = null;
                  }}
                >
                  Cancel
                </button>
                {editingKnowledge?.publication_status === "published" ? (
                  canEditKnowledge && (
                    <button
                      type="button"
                      className="save-knowledge"
                      disabled={createKnowledge.isPending || !newTitle.trim() || !newTypes.length}
                      onClick={() => createKnowledge.mutate("published")}
                    >
                      {createKnowledge.isPending ? "Saving..." : "Save changes"}
                    </button>
                  )
                ) : (
                  <>
                    <button
                      className="save-knowledge"
                      disabled={createKnowledge.isPending || autosaveStatus === "saving" || !newTitle.trim() || !newTypes.length}
                    >
                      {createKnowledge.isPending ? "Saving..." : "Save draft"}
                    </button>
                    <button
                      type="button"
                      className="save-knowledge"
                      disabled={createKnowledge.isPending || autosaveStatus === "saving" || !newTitle.trim() || !newTypes.length || (!serializeDocumentTabs().trim() && !externalResources.length)}
                      onClick={() => createKnowledge.mutate("published")}
                    >
                      {createKnowledge.isPending ? "Publishing..." : "Publish"}
                    </button>
                  </>
                )}
              </div>
            </footer>
            {showAutosaveError && autosaveError && (
              <div className="knowledge-autosave-modal-backdrop" role="presentation" onMouseDown={() => setShowAutosaveError(false)}>
                <section
                  className="knowledge-autosave-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="knowledge-autosave-error-title"
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  <header>
                    <div>
                      <span className="eyebrow">Autosave diagnostics</span>
                      <h3 id="knowledge-autosave-error-title">Draft autosave failed</h3>
                    </div>
                    <button type="button" className="knowledge-autosave-modal-close" aria-label="Close autosave diagnostics" onClick={() => setShowAutosaveError(false)}>×</button>
                  </header>
                  <div className="knowledge-autosave-modal-body">
                    <p>The editor will retry automatically in 20 seconds. Use the details below to identify the failing request.</p>
                    <dl>
                      <div><dt>Message</dt><dd>{autosaveError.message}</dd></div>
                      <div><dt>Request</dt><dd><code>{autosaveError.endpoint}</code></dd></div>
                      {autosaveError.status !== undefined && <div><dt>HTTP status</dt><dd>{autosaveError.status}</dd></div>}
                      {autosaveError.requestID && <div><dt>Request ID</dt><dd><code>{autosaveError.requestID}</code></dd></div>}
                      <div><dt>Time</dt><dd>{formatDateTime(autosaveError.occurredAt.toISOString(), general.data?.date_format)}</dd></div>
                    </dl>
                  </div>
                  <footer>
                    <button type="button" onClick={() => setShowAutosaveError(false)}>Close</button>
                  </footer>
                </section>
              </div>
            )}
          </form>
        </section>
      )}
      {selected && (
        <>
          <button
            type="button"
            className="knowledge-detail-backdrop"
            aria-label="Close knowledge detail"
            onClick={() => setSelected(null)}
          />
          <aside className="knowledge-detail">
            <header>
              <div>
                <span className="eyebrow">
                  {kinds.find((item) => item.id === kind)?.label ?? "Knowledge"}
                </span>
                <h3>{selected.title}</h3>
                <p>
                  {workspaceMap.get(selected.workspace_id) ??
                    "Company knowledge"}{" "}
                  · Updated {formatDate(selected.updated_at)}
                </p>
              </div>
              <div className="knowledge-detail-actions">
                <button
                  type="button"
                  className="open-detail"
                  title="Full detail page will be added next"
                >
                  Detail
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  aria-label="Close detail"
                >
                  x
                </button>
              </div>
            </header>
            <div className="knowledge-detail-tags">
              {tags(selected.tags).map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
              {!tags(selected.tags).length && <small>Untagged</small>}
            </div>
            {selected.related_project_id && (
              <section className="knowledge-detail-project">
                <span>Related project</span>
                <strong>{selected.related_project_name ?? "Project"}</strong>
                <code>{selected.related_project_id}</code>
              </section>
            )}
            <article>{selected.content || "No content available."}</article>
          </aside>
        </>
      )}
    </section>
  );
}
function tags(value: Doc["tags"]): string[] {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return value
    .replace(/^\{|\}$/g, "")
    .split(",")
    .map((item) => item.replace(/^"|"$/g, "").trim())
    .filter(Boolean);
}
function isPrivateKnowledge(item: Doc): boolean {
  return (
    !tags(item.accessible_division_ids ?? []).length &&
    !tags(item.accessible_team_ids ?? []).length &&
    !tags(item.accessible_user_ids ?? []).length
  );
}
function resources(value: Doc["external_resources"]): ExternalResource[] {
  if (Array.isArray(value)) return value.slice(0, 20);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 20).flatMap((item): ExternalResource[] => {
      if (!item || typeof item !== "object" || typeof item.url !== "string") return [];
      return [{
        id: crypto.randomUUID(),
        url: item.url,
        type: item.type === "google_docs" ? "google_docs" : "url",
        label: typeof item.label === "string" ? item.label : "External URL",
      }];
    });
  } catch {
    return [];
  }
}
function excerpt(value: string) {
  const plain = (value ?? "")
    .replace(/[#*_>`~-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain || "No description available.";
}
function renderMarkdownPreview(markdown: string): ReactNode {
  const lines = (markdown || "No content available.")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .slice(0, 14);
  let inCodeBlock = false;
  const blocks: ReactNode[] = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      return;
    }
    if (inCodeBlock) {
      blocks.push(
        <code className="knowledge-hover-preview-code" key={`code-${index}`}>
          {line}
        </code>,
      );
      return;
    }
    if (!trimmed) return;
    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    const listItem = trimmed.match(/^(?:[-*+] |\d+\. )(.+)$/);
    const content = renderInlineMarkdown(
      heading?.[2] ?? listItem?.[1] ?? trimmed.replace(/^>\s?/, ""),
    );
    if (heading) {
      blocks.push(
        <strong className="knowledge-hover-preview-heading" key={index}>
          {content}
        </strong>,
      );
    } else if (listItem) {
      blocks.push(
        <span className="knowledge-hover-preview-list-item" key={index}>
          • {content}
        </span>,
      );
    } else if (trimmed.startsWith(">")) {
      blocks.push(
        <em className="knowledge-hover-preview-quote" key={index}>
          {content}
        </em>,
      );
    } else {
      blocks.push(
        <span className="knowledge-hover-preview-paragraph" key={index}>
          {content}
        </span>,
      );
    }
  });
  return blocks;
}
function renderInlineMarkdown(value: string): ReactNode[] {
  const tokens = value.split(
    /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*]+\*|_[^_]+_|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g,
  );
  return tokens.filter(Boolean).map((token, index) => {
    if (/^\*\*|^__/.test(token)) {
      return <strong key={index}>{token.slice(2, -2)}</strong>;
    }
    if (/^`/.test(token)) {
      return <code key={index}>{token.slice(1, -1)}</code>;
    }
    if (/^\*|^_/.test(token)) {
      return <em key={index}>{token.slice(1, -1)}</em>;
    }
    const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (link) {
      return (
        <a href={link[2]} target="_blank" rel="noreferrer" key={index}>
          {link[1]}
        </a>
      );
    }
    return <span key={index}>{token}</span>;
  });
}
function parseApplicationDate(value: string) {
  const postgresUtc = value.match(/^(.*?)(?:\+08(?::?00)?)$/);
  const normalized = postgresUtc
    ? `${postgresUtc[1].replace(" ", "T")}Z`
    : /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(value)
      ? value
      : `${value.replace(" ", "T")}Z`;
  return new Date(normalized);
}
function formatDate(value: string, format = "d F Y") {
  if (!value) return "Not updated";
  const date = parseApplicationDate(value);
  if (Number.isNaN(date.getTime())) return "Not updated";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  if (format === "Y-m-d") return `${year}-${month}-${day}`;
  if (format === "d/m/Y") return `${day}/${month}/${year}`;
  if (format === "m/d/Y") return `${month}/${day}/${year}`;
  const monthLabel = date.toLocaleString(undefined, {
    month: format === "d M Y" ? "short" : "long",
  });
  return `${day} ${monthLabel} ${year}`;
}
function formatRelativeDate(value: string, dateFormat = "d F Y") {
  if (!value) return "Not updated";
  const timestamp = parseApplicationDate(value).getTime();
  if (Number.isNaN(timestamp)) return "Not updated";

  const differenceInSeconds = (Date.now() - timestamp) / 1000;
  const absoluteSeconds = Math.abs(differenceInSeconds);
  if (absoluteSeconds < 60) return "A moment ago";
  if (absoluteSeconds >= 31_536_000) return formatDate(value, dateFormat);

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
    ["second", 1],
  ];
  const [unit, secondsPerUnit] = units.find(([, seconds]) => absoluteSeconds >= seconds) ?? ["second", 1];
  return new Intl.RelativeTimeFormat("en", { numeric: "always" }).format(
    Math.round(-differenceInSeconds / secondsPerUnit),
    unit,
  );
}
function truncatePreviewContent(value: string, maxWords = 1000) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return value;
  return `${words.slice(0, maxWords).join(" ")}\n\n...`;
}
function TocMarqueeText({ children }: { children: string }) {
  const containerRef = useRef<HTMLSpanElement | null>(null);
  const contentRef = useRef<HTMLSpanElement | null>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;
    const measure = () => setIsOverflowing(content.scrollWidth > container.clientWidth);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [children]);

  return (
    <span ref={containerRef} className={`knowledge-toc-marquee${isOverflowing ? " is-overflowing" : ""}`}>
      <span ref={contentRef}>{children}</span>
    </span>
  );
}
function formatDateTime(value?: string, dateFormat = "d F Y") {
  if (!value) return "Not available";
  const date = parseApplicationDate(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  const time = new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `${formatDate(value, dateFormat)}, ${time}`;
}
function divisionColor(id: string) {
  const colors = ["#3b82f6", "#8b5cf6", "#ef7b45", "#2f9e73", "#d14f7b"];
  const hash = [...id].reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );
  return colors[hash % colors.length];
}
function icon(kind: string, customIcon?: string | null) {
  if (customIcon) return customIcon;
  if (kind === "meetings") return "M";
  if (kind === "decisions") return "D";
  if (kind === "lessons") return "L";
  if (kind === "wiki") return "W";
  return "📚";
}
