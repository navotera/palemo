import { useEffect, useMemo, useRef, useState } from "react";
import "./weekly-kpi.css";

/**
 * Weekly KPI — mode "KPI Saya" (fase 1, UI only, data dummy).
 *
 * Model minggu:
 *  - Minggu berjalan (status "active")  -> grid bebas diedit, autosave (mock).
 *  - Minggu lampau (status "locked")    -> read-only. Untuk mengedit, staff
 *    mengajukan "Minta izin edit" ke supervisor (status jadi "pending").
 *
 * Pola kartu (ala Trello):
 *  - Grid hanya menampilkan baris ringkas: nama aktivitas, status, catatan.
 *  - Klik nama aktivitas membuka "kartu detail". Di dalam kartu:
 *      • checklist penyelesaian (tambah / centang / hapus)
 *      • lampiran berkas (unggah / hapus) — disimpan lokal (mock)
 *      • audit trail (riwayat perubahan)
 *
 * Catatan: semua data di bawah masih dummy lokal. Belum menyentuh backend.
 */

type ActivityStatus = "not_started" | "in_progress" | "done" | "blocked";

type ChecklistItem = {
  id: string;
  text: string;
  done: boolean;
};

type Attachment = {
  id: string;
  name: string;
  size: number; // bytes
  type: string; // MIME type
  addedAt: string; // ISO
  url: string; // object URL (lokal, mock)
};

type AuditEntry = {
  id: string;
  at: string; // ISO
  by: string;
  field: string;
  from: string;
  to: string;
};

type Activity = {
  id: string;
  name: string;
  status: ActivityStatus;
  note: string;
  checklist: ChecklistItem[];
  attachments: Attachment[];
  history: AuditEntry[];
};

type EditRequestStatus = "none" | "pending";

type ReviewNote = {
  by: string;
  role: string;
  at: string;
  rating: number; // 1..5
  comment: string;
};

type WeekPlan = {
  id: string;
  startISO: string; // Monday
  endISO: string; // Sunday
  status: "active" | "locked";
  editRequest: EditRequestStatus;
  goals: string[]; // ditetapkan supervisor (read-only)
  activities: Activity[];
  review: ReviewNote | null;
};

const STATUS_LABELS: Record<ActivityStatus, string> = {
  not_started: "Belum mulai",
  in_progress: "Berjalan",
  done: "Selesai",
  blocked: "Terblokir",
};

const STATUS_ORDER: ActivityStatus[] = [
  "not_started",
  "in_progress",
  "done",
  "blocked",
];

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}`;

function startOfWeek(date: Date): Date {
  const copy = new Date(date);
  const day = copy.getDay(); // 0 Sun .. 6 Sat
  const diff = (day + 6) % 7; // days since Monday
  copy.setDate(copy.getDate() - diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ID_FMT = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
});
const ID_FMT_FULL = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const ID_DATETIME = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const ID_MONTH = new Intl.DateTimeFormat("id-ID", {
  month: "long",
  year: "numeric",
});
const WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

function formatRange(startISO: string, endISO: string): string {
  const start = new Date(startISO);
  const end = new Date(endISO);
  return `${ID_FMT.format(start)} – ${ID_FMT_FULL.format(end)}`;
}

function completion(activities: Activity[]): number {
  const total = activities.reduce((n, a) => n + a.checklist.length, 0);
  if (total === 0) {
    const done = activities.filter((a) => a.status === "done").length;
    return activities.length ? Math.round((done / activities.length) * 100) : 0;
  }
  const done = activities.reduce(
    (n, a) => n + a.checklist.filter((c) => c.done).length,
    0,
  );
  return Math.round((done / total) * 100);
}

function buildMockWeeks(me: string): WeekPlan[] {
  const thisMonday = startOfWeek(new Date());
  const lastMonday = addDays(thisMonday, -7);
  const twoAgoMonday = addDays(thisMonday, -14);

  return [
    {
      id: "w-current",
      startISO: toISODate(thisMonday),
      endISO: toISODate(addDays(thisMonday, 6)),
      status: "active",
      editRequest: "none",
      goals: [
        "Rilis modul laporan v2 ke staging sebelum Jumat",
        "Tutup minimal 8 tiket dukungan prioritas tinggi",
      ],
      review: null,
      activities: [
        {
          id: uid(),
          name: "Finalisasi desain halaman laporan",
          status: "in_progress",
          note: "Menunggu masukan dari tim desain.",
          attachments: [],
          checklist: [
            { id: uid(), text: "Wireframe disetujui", done: true },
            { id: uid(), text: "Komponen chart dibuat", done: true },
            { id: uid(), text: "Review aksesibilitas", done: false },
          ],
          history: [
            {
              id: uid(),
              at: addDays(thisMonday, 1).toISOString(),
              by: me,
              field: "Status",
              from: STATUS_LABELS.not_started,
              to: STATUS_LABELS.in_progress,
            },
          ],
        },
        {
          id: uid(),
          name: "Integrasi API ekspor PDF",
          status: "not_started",
          note: "",
          attachments: [],
          checklist: [{ id: uid(), text: "Spesifikasi endpoint", done: false }],
          history: [],
        },
      ],
    },
    {
      id: "w-last",
      startISO: toISODate(lastMonday),
      endISO: toISODate(addDays(lastMonday, 6)),
      status: "locked",
      editRequest: "none",
      goals: ["Selesaikan migrasi basis data pengguna"],
      review: {
        by: "Sari Dewi",
        role: "Supervisor",
        at: addDays(lastMonday, 7).toISOString(),
        rating: 4,
        comment:
          "Progres bagus, lain kali mohon catatan harian lebih rinci untuk aktivitas yang terblokir.",
      },
      activities: [
        {
          id: uid(),
          name: "Migrasi tabel pengguna ke skema baru",
          status: "done",
          note: "Selesai lebih cepat dari rencana.",
          attachments: [],
          checklist: [
            { id: uid(), text: "Skrip migrasi", done: true },
            { id: uid(), text: "Verifikasi data", done: true },
          ],
          history: [
            {
              id: uid(),
              at: addDays(lastMonday, 3).toISOString(),
              by: me,
              field: "Status",
              from: STATUS_LABELS.in_progress,
              to: STATUS_LABELS.done,
            },
          ],
        },
        {
          id: uid(),
          name: "Dokumentasi prosedur rollback",
          status: "done",
          note: "",
          attachments: [],
          checklist: [{ id: uid(), text: "Draf dokumen", done: true }],
          history: [],
        },
      ],
    },
    {
      id: "w-two-ago",
      startISO: toISODate(twoAgoMonday),
      endISO: toISODate(addDays(twoAgoMonday, 6)),
      status: "locked",
      editRequest: "pending",
      goals: ["Perbaikan bug prioritas dari rilis sebelumnya"],
      review: {
        by: "Sari Dewi",
        role: "Supervisor",
        at: addDays(twoAgoMonday, 7).toISOString(),
        rating: 3,
        comment: "Beberapa target tidak tercapai, perlu estimasi yang lebih realistis.",
      },
      activities: [
        {
          id: uid(),
          name: "Perbaikan bug perhitungan invoice",
          status: "done",
          note: "",
          attachments: [],
          checklist: [{ id: uid(), text: "Unit test ditambahkan", done: true }],
          history: [],
        },
      ],
    },
  ];
}

export function WeeklyKpi({ userName }: { userName: string }) {
  const me = userName || "Saya";
  const [weeks, setWeeks] = useState<WeekPlan[]>(() => buildMockWeeks(me));
  const [activeWeekID, setActiveWeekID] = useState("w-current");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestReason, setRequestReason] = useState("");
  const [openCardID, setOpenCardID] = useState<string | null>(null);
  const [statusMenuFor, setStatusMenuFor] = useState<string | null>(null);
  const [editingID, setEditingID] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const week = weeks.find((w) => w.id === activeWeekID) ?? weeks[0];
  const weekIndex = weeks.findIndex((w) => w.id === week.id);
  const editable = week.status === "active";
  const completionPct = completion(week.activities);

  // Kartu yang sedang terbuka — diturunkan dari state agar selalu sinkron
  // dengan hasil edit (bukan snapshot).
  const openCard =
    openCardID != null
      ? week.activities.find((a) => a.id === openCardID) ?? null
      : null;

  // Tutup kartu dengan tombol Escape.
  useEffect(() => {
    if (!openCard) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenCardID(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openCard]);

  // --- mutation helpers (mock autosave + audit trail) -----------------------

  function markSaved() {
    setSavedAt(Date.now());
  }

  function updateWeek(mut: (w: WeekPlan) => WeekPlan) {
    setWeeks((current) =>
      current.map((w) => (w.id === week.id ? mut(w) : w)),
    );
    markSaved();
  }

  function updateActivity(
    activityID: string,
    mut: (a: Activity) => Activity,
  ) {
    updateWeek((w) => ({
      ...w,
      activities: w.activities.map((a) =>
        a.id === activityID ? mut(a) : a,
      ),
    }));
  }

  function audit(
    activity: Activity,
    field: string,
    from: string,
    to: string,
  ): AuditEntry[] {
    if (from === to) return activity.history;
    const [latest, ...rest] = activity.history;
    // Gabungkan perubahan beruntun pada field yang sama oleh orang yang sama
    // (mis. mengetik nama/catatan) menjadi satu entri: from awal, to akhir.
    if (latest && latest.field === field && latest.by === me) {
      return [
        { ...latest, to: to || "(kosong)", at: new Date().toISOString() },
        ...rest,
      ];
    }
    return [
      {
        id: uid(),
        at: new Date().toISOString(),
        by: me,
        field,
        from: from || "(kosong)",
        to: to || "(kosong)",
      },
      ...activity.history,
    ];
  }

  function setName(activity: Activity, name: string) {
    updateActivity(activity.id, (a) => ({
      ...a,
      name,
      history: audit(a, "Nama aktivitas", a.name, name),
    }));
  }

  function setStatus(activity: Activity, status: ActivityStatus) {
    updateActivity(activity.id, (a) => ({
      ...a,
      status,
      history: audit(a, "Status", STATUS_LABELS[a.status], STATUS_LABELS[status]),
    }));
  }

  function setNote(activity: Activity, note: string) {
    updateActivity(activity.id, (a) => ({
      ...a,
      note,
      history: audit(a, "Catatan", a.note, note),
    }));
  }

  function toggleChecklist(activity: Activity, itemID: string) {
    updateActivity(activity.id, (a) => {
      const item = a.checklist.find((c) => c.id === itemID);
      const nextDone = !item?.done;
      return {
        ...a,
        checklist: a.checklist.map((c) =>
          c.id === itemID ? { ...c, done: nextDone } : c,
        ),
        history: audit(
          a,
          `Checklist: ${item?.text ?? ""}`,
          item?.done ? "selesai" : "belum",
          nextDone ? "selesai" : "belum",
        ),
      };
    });
  }

  function addChecklistItem(activity: Activity, text: string) {
    const clean = text.trim();
    if (!clean) return;
    updateActivity(activity.id, (a) => ({
      ...a,
      checklist: [...a.checklist, { id: uid(), text: clean, done: false }],
      history: audit(a, "Checklist ditambah", "", clean),
    }));
  }

  function removeChecklistItem(activity: Activity, itemID: string) {
    updateActivity(activity.id, (a) => {
      const item = a.checklist.find((c) => c.id === itemID);
      return {
        ...a,
        checklist: a.checklist.filter((c) => c.id !== itemID),
        history: audit(a, "Checklist dihapus", item?.text ?? "", ""),
      };
    });
  }

  function addAttachments(activity: Activity, files: FileList | null) {
    if (!files || files.length === 0) return;
    const items: Attachment[] = Array.from(files).map((file) => ({
      id: uid(),
      name: file.name,
      size: file.size,
      type: file.type,
      addedAt: new Date().toISOString(),
      url: URL.createObjectURL(file),
    }));
    updateActivity(activity.id, (a) => ({
      ...a,
      attachments: [...a.attachments, ...items],
      history: items.reduce(
        (hist, it) => [
          {
            id: uid(),
            at: new Date().toISOString(),
            by: me,
            field: "Lampiran ditambah",
            from: "(kosong)",
            to: it.name,
          },
          ...hist,
        ],
        a.history,
      ),
    }));
  }

  function removeAttachment(activity: Activity, attID: string) {
    updateActivity(activity.id, (a) => {
      const att = a.attachments.find((x) => x.id === attID);
      if (att) {
        try {
          URL.revokeObjectURL(att.url);
        } catch {
          /* no-op */
        }
      }
      return {
        ...a,
        attachments: a.attachments.filter((x) => x.id !== attID),
        history: audit(a, "Lampiran dihapus", att?.name ?? "", ""),
      };
    });
  }

  function addRow() {
    const row: Activity = {
      id: uid(),
      name: "",
      status: "not_started",
      note: "",
      checklist: [],
      attachments: [],
      history: [],
    };
    updateWeek((w) => ({ ...w, activities: [...w.activities, row] }));
    // Kemudahan: langsung edit inline di baris baru (bukan pop-up).
    setEditingID(row.id);
  }

  // Selesai edit nama inline: bersihkan baris kosong, lepas mode edit.
  function finishEditing(activity: Activity) {
    setEditingID((cur) => (cur === activity.id ? null : cur));
    if (!activity.name.trim()) removeRow(activity.id);
  }

  function removeRow(activityID: string) {
    updateWeek((w) => ({
      ...w,
      activities: w.activities.filter((a) => a.id !== activityID),
    }));
    if (openCardID === activityID) setOpenCardID(null);
  }

  function submitEditRequest() {
    updateWeek((w) => ({ ...w, editRequest: "pending" }));
    setRequestModalOpen(false);
    setRequestReason("");
  }

  const emptyNameExists = useMemo(
    () => week.activities.some((a) => !a.name.trim()),
    [week.activities],
  );

  return (
    <section className="weekly-kpi" aria-labelledby="weekly-kpi-title">
      <header className="wk-header">
        <div className="wk-heading">
          <span className="wk-eyebrow">KPI Mingguan</span>
          <h1 id="weekly-kpi-title">KPI Saya</h1>
          <p>Rencana & pencapaian kerja mingguan Anda.</p>
        </div>

        <div className="wk-week-switch" role="group" aria-label="Pilih minggu">
          <button
            type="button"
            className="wk-week-arrow"
            aria-label="Minggu sebelumnya"
            disabled={weekIndex >= weeks.length - 1}
            onClick={() =>
              setActiveWeekID(weeks[Math.min(weeks.length - 1, weekIndex + 1)].id)
            }
          >
            ‹
          </button>
          <div className="wk-week-anchor">
            <button
              type="button"
              className="wk-week-label"
              aria-expanded={calendarOpen}
              aria-haspopup="dialog"
              title="Lihat kalender"
              onClick={() => setCalendarOpen((o) => !o)}
            >
              <strong>
                {formatRange(week.startISO, week.endISO)}
                <ChevronIcon open={calendarOpen} />
              </strong>
              <span
                className={`wk-week-badge ${editable ? "is-active" : "is-locked"}`}
              >
                {editable ? (
                  <>
                    <i /> Berjalan · bisa diedit
                  </>
                ) : (
                  <>
                    <LockIcon /> Terkunci
                  </>
                )}
              </span>
            </button>
            {calendarOpen && (
              <>
                <button
                  type="button"
                  className="wk-cal-backdrop"
                  aria-label="Tutup kalender"
                  onClick={() => setCalendarOpen(false)}
                />
                <WeekCalendar
                  weeks={weeks}
                  selectedWeekID={week.id}
                  onSelect={(id) => {
                    setActiveWeekID(id);
                    setCalendarOpen(false);
                  }}
                />
              </>
            )}
          </div>
          <button
            type="button"
            className="wk-week-arrow"
            aria-label="Minggu berikutnya"
            disabled={weekIndex <= 0}
            onClick={() =>
              setActiveWeekID(weeks[Math.max(0, weekIndex - 1)].id)
            }
          >
            ›
          </button>
        </div>
      </header>

      {/* Ringkasan + Target */}
      <div className="wk-top-grid">
        <article className="wk-summary-card">
          <span className="wk-card-label">Penyelesaian minggu ini</span>
          <div className="wk-progress-ring">
            <strong>{completionPct}%</strong>
          </div>
          <div className="wk-progress-bar" aria-hidden="true">
            <span style={{ width: `${completionPct}%` }} />
          </div>
          <small>
            {week.activities.length} aktivitas ·{" "}
            {week.activities.filter((a) => a.status === "done").length} selesai
          </small>
        </article>

        <article className="wk-goals-card">
          <div className="wk-card-head">
            <span className="wk-card-label">Target dari supervisor</span>
            <span className="wk-readonly-pill">Hanya baca</span>
          </div>
          {week.goals.length ? (
            <ul className="wk-goals">
              {week.goals.map((goal) => (
                <li key={goal}>
                  <GoalIcon />
                  {goal}
                </li>
              ))}
            </ul>
          ) : (
            <p className="wk-empty-inline">Belum ada target yang ditetapkan.</p>
          )}
        </article>
      </div>

      {/* Banner kondisi minggu terkunci */}
      {!editable && (
        <div
          className={`wk-lock-banner ${week.editRequest === "pending" ? "is-pending" : ""}`}
          role="status"
        >
          {week.editRequest === "pending" ? (
            <>
              <ClockIcon />
              <div>
                <strong>Menunggu persetujuan supervisor</strong>
                <span>
                  Permintaan izin edit minggu ini sudah dikirim. Grid akan terbuka
                  setelah disetujui.
                </span>
              </div>
            </>
          ) : (
            <>
              <LockIcon />
              <div>
                <strong>Minggu ini sudah terkunci</strong>
                <span>
                  Minggu yang sudah lewat tidak bisa diubah. Ajukan izin edit ke
                  supervisor jika perlu merevisi.
                </span>
              </div>
              <button
                type="button"
                className="wk-btn wk-btn-primary"
                onClick={() => setRequestModalOpen(true)}
              >
                Minta izin edit
              </button>
            </>
          )}
        </div>
      )}

      {/* Catatan review dari supervisor / owner */}
      {week.review && (
        <article className="wk-review-card">
          <div className="wk-review-head">
            <div className="wk-review-avatar">{week.review.by.charAt(0)}</div>
            <div>
              <strong>{week.review.by}</strong>
              <span>
                {week.review.role} · {ID_DATETIME.format(new Date(week.review.at))}
              </span>
            </div>
            <div className="wk-review-rating" aria-label={`Rating ${week.review.rating} dari 5`}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} filled={n <= week.review!.rating} />
              ))}
            </div>
          </div>
          <p>{week.review.comment}</p>
        </article>
      )}

      {/* Grid aktivitas */}
      <section className="wk-grid-wrap" aria-label="Daftar aktivitas mingguan">
        <div className="wk-grid-toolbar">
          <h2>Aktivitas</h2>
          <div className="wk-toolbar-right">
            {editable && savedAt && (
              <span className="wk-saved" aria-live="polite">
                <CheckIcon /> Tersimpan otomatis
              </span>
            )}
            {editable && (
              <button
                type="button"
                className="wk-btn wk-btn-ghost"
                onClick={() => addRow()}
              >
                + Tambah baris
              </button>
            )}
          </div>
        </div>

        <div className="wk-grid" role="table">
          <div className="wk-row wk-row-head" role="row">
            <span role="columnheader" className="wk-col-no">
              #
            </span>
            <span role="columnheader">
              Nama aktivitas <em>wajib</em>
            </span>
            <span role="columnheader" className="wk-col-status">
              Status
            </span>
          </div>

          {week.activities.map((activity, index) => {
            const invalid = editable && !activity.name.trim();
            const done = activity.checklist.filter((c) => c.done).length;
            const total = activity.checklist.length;
            const statusMenuOpen = statusMenuFor === activity.id;
            return (
              <div className="wk-row-group" key={activity.id}>
                <div
                  className={`wk-row ${invalid ? "is-invalid" : ""}`}
                  role="row"
                >
                  <span role="cell" className="wk-col-no">
                    {index + 1}
                  </span>

                  <span role="cell" className="wk-cell-name">
                    <div className="wk-name-wrap">
                      {editable && editingID === activity.id ? (
                        <input
                          className="wk-input"
                          autoFocus
                          value={activity.name}
                          placeholder="Tulis nama aktivitas…"
                          onChange={(e) => setName(activity, e.target.value)}
                          onBlur={() => finishEditing(activity)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              if (activity.name.trim()) addRow();
                              else finishEditing(activity);
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              finishEditing(activity);
                            }
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className="wk-name-open"
                          title={
                            editable && !activity.name.trim()
                              ? "Isi nama aktivitas"
                              : "Buka kartu aktivitas"
                          }
                          onClick={() =>
                            editable && !activity.name.trim()
                              ? setEditingID(activity.id)
                              : setOpenCardID(activity.id)
                          }
                        >
                          {activity.name ? (
                            activity.name
                          ) : (
                            <span className="wk-name-empty">
                              {editable ? "Beri nama aktivitas…" : "—"}
                            </span>
                          )}
                        </button>
                      )}
                      {(total > 0 || activity.attachments.length > 0) && (
                        <div className="wk-row-meta">
                          {total > 0 && (
                            <span
                              className={`wk-meta-chip ${done === total ? "is-complete" : ""}`}
                              title="Checklist"
                            >
                              <CheckSquareIcon />
                              {done}/{total}
                            </span>
                          )}
                          {activity.attachments.length > 0 && (
                            <span className="wk-meta-chip" title="Lampiran">
                              <PaperclipIcon />
                              {activity.attachments.length}
                            </span>
                          )}
                        </div>
                      )}
                      <button
                        type="button"
                        className="wk-card-open-btn"
                        title="Buka kartu aktivitas"
                        aria-label="Buka kartu aktivitas"
                        onClick={() => setOpenCardID(activity.id)}
                      >
                        <ExpandIcon />
                      </button>
                    </div>
                    {invalid && (
                      <small className="wk-field-error">Nama wajib diisi</small>
                    )}
                  </span>

                  <span role="cell" className="wk-col-status">
                    <div className="wk-status-anchor">
                      <span className={`wk-status-badge status-${activity.status}`}>
                        {STATUS_LABELS[activity.status]}
                        {editable && (
                          <button
                            type="button"
                            className="wk-status-kebab"
                            aria-label="Ubah status"
                            aria-haspopup="menu"
                            aria-expanded={statusMenuOpen}
                            onClick={() =>
                              setStatusMenuFor(statusMenuOpen ? null : activity.id)
                            }
                          >
                            <ChevronIcon open={statusMenuOpen} />
                          </button>
                        )}
                      </span>
                      {editable && statusMenuOpen && (
                        <>
                          <button
                            type="button"
                            className="wk-status-backdrop"
                            aria-label="Tutup menu status"
                            onClick={() => setStatusMenuFor(null)}
                          />
                          <ul className="wk-status-menu" role="menu">
                            {STATUS_ORDER.map((s) => (
                              <li key={s} role="none">
                                <button
                                  type="button"
                                  role="menuitem"
                                  className={`wk-status-opt ${s === activity.status ? "is-current" : ""}`}
                                  onClick={() => {
                                    setStatus(activity, s);
                                    setStatusMenuFor(null);
                                  }}
                                >
                                  <span
                                    className={`wk-status-dot status-${s}`}
                                    aria-hidden="true"
                                  />
                                  {STATUS_LABELS[s]}
                                  {s === activity.status && (
                                    <span className="wk-status-check">
                                      <CheckIcon />
                                    </span>
                                  )}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  </span>
                </div>
              </div>
            );
          })}

          {week.activities.length === 0 && (
            <div className="wk-grid-empty">
              Belum ada aktivitas.{" "}
              {editable && (
                <button
                  type="button"
                  className="wk-link"
                  onClick={() => addRow()}
                >
                  Tambah baris pertama
                </button>
              )}
            </div>
          )}
        </div>

        {editable && (
          <button type="button" className="wk-add-row-foot" onClick={() => addRow()}>
            + Tambah aktivitas &nbsp;
            <span className="wk-add-row-hint">ketik nama, <kbd>Enter</kbd> untuk baris berikutnya</span>
          </button>
        )}
        {editable && emptyNameExists && (
          <p className="wk-hint wk-hint-warn">
            Ada baris tanpa nama aktivitas. Isi nama agar tersimpan sebagai KPI.
          </p>
        )}
      </section>

      {/* Modal minta izin edit */}
      {requestModalOpen && (
        <>
          <button
            type="button"
            className="wk-modal-backdrop"
            aria-label="Tutup"
            onClick={() => setRequestModalOpen(false)}
          />
          <section
            className="wk-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wk-request-title"
          >
            <h3 id="wk-request-title">Minta izin edit minggu terkunci</h3>
            <p className="wk-modal-sub">
              {formatRange(week.startISO, week.endISO)}
            </p>
            <label className="wk-field">
              <span>Alasan permintaan</span>
              <textarea
                value={requestReason}
                rows={4}
                placeholder="Jelaskan kenapa minggu ini perlu direvisi…"
                onChange={(e) => setRequestReason(e.target.value)}
              />
            </label>
            <div className="wk-modal-actions">
              <button
                type="button"
                className="wk-btn wk-btn-ghost"
                onClick={() => setRequestModalOpen(false)}
              >
                Batal
              </button>
              <button
                type="button"
                className="wk-btn wk-btn-primary"
                disabled={!requestReason.trim()}
                onClick={submitEditRequest}
              >
                Kirim permintaan
              </button>
            </div>
          </section>
        </>
      )}

      {/* Kartu detail aktivitas (ala Trello) */}
      {openCard && (
        <ActivityCard
          activity={openCard}
          editable={editable}
          onClose={() => setOpenCardID(null)}
          onName={(name) => setName(openCard, name)}
          onStatus={(status) => setStatus(openCard, status)}
          onNote={(note) => setNote(openCard, note)}
          onToggleChecklist={(itemID) => toggleChecklist(openCard, itemID)}
          onAddChecklist={(text) => addChecklistItem(openCard, text)}
          onRemoveChecklist={(itemID) => removeChecklistItem(openCard, itemID)}
          onAddAttachments={(files) => addAttachments(openCard, files)}
          onRemoveAttachment={(attID) => removeAttachment(openCard, attID)}
          onDelete={() => removeRow(openCard.id)}
        />
      )}
    </section>
  );
}

/* ---- Kartu detail aktivitas --------------------------------------------- */

function ActivityCard({
  activity,
  editable,
  onClose,
  onName,
  onStatus,
  onNote,
  onToggleChecklist,
  onAddChecklist,
  onRemoveChecklist,
  onAddAttachments,
  onRemoveAttachment,
  onDelete,
}: {
  activity: Activity;
  editable: boolean;
  onClose: () => void;
  onName: (name: string) => void;
  onStatus: (status: ActivityStatus) => void;
  onNote: (note: string) => void;
  onToggleChecklist: (itemID: string) => void;
  onAddChecklist: (text: string) => void;
  onRemoveChecklist: (itemID: string) => void;
  onAddAttachments: (files: FileList | null) => void;
  onRemoveAttachment: (attID: string) => void;
  onDelete: () => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<Attachment | null>(null);
  const done = activity.checklist.filter((c) => c.done).length;
  const total = activity.checklist.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <>
      <button
        type="button"
        className="wk-modal-backdrop"
        aria-label="Tutup kartu"
        onClick={onClose}
      />
      <section
        className="wk-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wk-card-title"
      >
        <header className="wk-card-head">
          <div className="wk-card-title-row">
            <span className={`wk-status-dot status-${activity.status}`} aria-hidden="true" />
            {editable ? (
              <input
                id="wk-card-title"
                className="wk-card-title-input"
                value={activity.name}
                placeholder="Nama aktivitas…"
                autoFocus={!activity.name}
                onChange={(e) => onName(e.target.value)}
              />
            ) : (
              <h3 id="wk-card-title" className="wk-card-title-static">
                {activity.name || "Aktivitas"}
              </h3>
            )}
          </div>
          <button
            type="button"
            className="wk-icon-btn"
            aria-label="Tutup"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="wk-card-body">
          <div className="wk-card-main">
            {/* Status + catatan */}
            <div className="wk-card-meta-row">
              <div className="wk-card-field">
                <span className="wk-detail-label">Status</span>
                {editable ? (
                  <select
                    className={`wk-status-select status-${activity.status}`}
                    value={activity.status}
                    onChange={(e) => onStatus(e.target.value as ActivityStatus)}
                  >
                    {STATUS_ORDER.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className={`wk-status-tag status-${activity.status}`}>
                    {STATUS_LABELS[activity.status]}
                  </span>
                )}
              </div>
            </div>

            <div className="wk-card-section">
              <span className="wk-detail-label">Catatan</span>
              {editable ? (
                <textarea
                  className="wk-card-note"
                  value={activity.note}
                  rows={3}
                  placeholder="Tambahkan catatan / deskripsi…"
                  onChange={(e) => onNote(e.target.value)}
                />
              ) : (
                <p className="wk-card-note-static">{activity.note || "—"}</p>
              )}
            </div>

            {/* Checklist */}
            <div className="wk-card-section">
              <div className="wk-section-head">
                <span className="wk-detail-label">
                  <CheckSquareIcon /> Checklist
                </span>
                {total > 0 && (
                  <span className="wk-section-count">
                    {pct}% · {done}/{total}
                  </span>
                )}
              </div>
              {total > 0 && (
                <div className="wk-card-progress" aria-hidden="true">
                  <span style={{ width: `${pct}%` }} />
                </div>
              )}
              <ul className="wk-checklist">
                {activity.checklist.map((item) => (
                  <li key={item.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={item.done}
                        disabled={!editable}
                        onChange={() => onToggleChecklist(item.id)}
                      />
                      <span className={item.done ? "is-done" : ""}>
                        {item.text}
                      </span>
                    </label>
                    {editable && (
                      <button
                        type="button"
                        className="wk-chk-remove"
                        aria-label="Hapus item"
                        onClick={() => onRemoveChecklist(item.id)}
                      >
                        ×
                      </button>
                    )}
                  </li>
                ))}
                {total === 0 && (
                  <li className="wk-empty-inline">Belum ada item checklist.</li>
                )}
              </ul>
              {editable && (
                <ChecklistAdder onAdd={(text) => onAddChecklist(text)} />
              )}
            </div>

            {/* Lampiran */}
            <div className="wk-card-section">
              <div className="wk-section-head">
                <span className="wk-detail-label">
                  <PaperclipIcon /> Lampiran
                </span>
                {activity.attachments.length > 0 && (
                  <span className="wk-section-count">
                    {activity.attachments.length} berkas
                  </span>
                )}
              </div>
              <ul className="wk-attach-list">
                {activity.attachments.map((att) => {
                  const isImage = att.type.startsWith("image/");
                  const info = (
                    <span className="wk-attach-info">
                      <strong>{att.name}</strong>
                      <small>
                        {formatSize(att.size)} ·{" "}
                        {ID_DATETIME.format(new Date(att.addedAt))}
                      </small>
                    </span>
                  );
                  return (
                    <li key={att.id}>
                      {isImage ? (
                        <button
                          type="button"
                          className="wk-attach-item"
                          onClick={() => setPreview(att)}
                          title="Lihat gambar"
                        >
                          <span className="wk-attach-thumb">
                            <img src={att.url} alt={att.name} />
                          </span>
                          {info}
                        </button>
                      ) : (
                        <a
                          href={att.url}
                          target="_blank"
                          rel="noreferrer"
                          className="wk-attach-item"
                        >
                          <span className="wk-attach-icon">
                            <FileIcon />
                          </span>
                          {info}
                        </a>
                      )}
                      {editable && (
                        <button
                          type="button"
                          className="wk-chk-remove"
                          aria-label="Hapus lampiran"
                          onClick={() => onRemoveAttachment(att.id)}
                        >
                          ×
                        </button>
                      )}
                    </li>
                  );
                })}
                {activity.attachments.length === 0 && (
                  <li className="wk-empty-inline">Belum ada lampiran.</li>
                )}
              </ul>
              {editable && (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    multiple
                    className="wk-file-hidden"
                    onChange={(e) => {
                      onAddAttachments(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    className="wk-btn wk-btn-ghost wk-attach-btn"
                    onClick={() => fileRef.current?.click()}
                  >
                    <PaperclipIcon /> Unggah berkas
                  </button>
                </>
              )}
            </div>

            {editable && (
              <div className="wk-card-danger">
                <button
                  type="button"
                  className="wk-card-delete"
                  onClick={onDelete}
                >
                  <TrashIcon /> Hapus aktivitas
                </button>
              </div>
            )}
          </div>

          {/* Audit trail */}
          <aside className="wk-card-aside">
            <span className="wk-detail-label">
              <HistoryIcon /> Audit trail
            </span>
            {activity.history.length === 0 ? (
              <p className="wk-empty-inline">Belum ada perubahan tercatat.</p>
            ) : (
              <ol className="wk-timeline">
                {activity.history.map((entry) => (
                  <li key={entry.id}>
                    <div className="wk-timeline-dot" aria-hidden="true" />
                    <div className="wk-timeline-body">
                      <strong>{entry.field}</strong>
                      <div className="wk-diff">
                        <span className="wk-diff-from">{entry.from}</span>
                        <span className="wk-diff-arrow">→</span>
                        <span className="wk-diff-to">{entry.to}</span>
                      </div>
                      <small>
                        {entry.by} · {ID_DATETIME.format(new Date(entry.at))}
                      </small>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </aside>
        </div>
      </section>

      {preview && (
        <>
          <button
            type="button"
            className="wk-lightbox-backdrop"
            aria-label="Tutup pratinjau"
            onClick={() => setPreview(null)}
          />
          <div className="wk-lightbox" role="dialog" aria-modal="true">
            <img src={preview.url} alt={preview.name} />
            <div className="wk-lightbox-bar">
              <span className="wk-lightbox-name">{preview.name}</span>
              <a
                href={preview.url}
                download={preview.name}
                className="wk-btn wk-btn-ghost"
              >
                Unduh
              </a>
              <button
                type="button"
                className="wk-btn wk-btn-ghost"
                onClick={() => setPreview(null)}
              >
                Tutup
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function ChecklistAdder({ onAdd }: { onAdd: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="wk-checklist-add">
      <input
        className="wk-input"
        value={text}
        placeholder="Tambah item checklist…"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onAdd(text);
            setText("");
          }
        }}
      />
      <button
        type="button"
        className="wk-btn wk-btn-ghost"
        onClick={() => {
          onAdd(text);
          setText("");
        }}
      >
        Tambah
      </button>
    </div>
  );
}

/** Mini-calendar: tiap baris = satu minggu. Baris minggu terpilih putih,
 *  lainnya abu. Badge jumlah aktivitas muncul di pojok tanggal Sabtu. */
function WeekCalendar({
  weeks,
  selectedWeekID,
  onSelect,
}: {
  weeks: WeekPlan[];
  selectedWeekID: string;
  onSelect: (id: string) => void;
}) {
  const selected = weeks.find((w) => w.id === selectedWeekID) ?? weeks[0];
  const [cursor, setCursor] = useState(() => new Date(selected.startISO));
  const todayISO = toISODate(new Date());

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const gridStart = startOfWeek(monthStart);
  const weeksCount = Math.ceil(
    ((monthEnd.getTime() - gridStart.getTime()) / 86_400_000 + 1) / 7,
  );

  const byMonday = new Map(weeks.map((w) => [w.startISO, w]));
  const rows = Array.from({ length: weeksCount }, (_, w) => {
    const monday = addDays(gridStart, w * 7);
    const plan = byMonday.get(toISODate(monday));
    const days = Array.from({ length: 7 }, (_, d) => addDays(monday, d));
    return { plan, days };
  });

  const shiftMonth = (delta: number) =>
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));

  return (
    <section
      className="wk-cal-pop"
      role="dialog"
      aria-label="Kalender minggu"
      onClick={(e) => e.stopPropagation()}
    >
      <header className="wk-cal-head">
        <button
          type="button"
          className="wk-cal-nav"
          aria-label="Bulan sebelumnya"
          onClick={() => shiftMonth(-1)}
        >
          ‹
        </button>
        <strong>{ID_MONTH.format(cursor)}</strong>
        <button
          type="button"
          className="wk-cal-nav"
          aria-label="Bulan berikutnya"
          onClick={() => shiftMonth(1)}
        >
          ›
        </button>
      </header>

      <div className="wk-cal-weekdays" aria-hidden="true">
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      <div className="wk-cal-body">
        {rows.map((row, i) => {
          const isActive = !!row.plan && row.plan.id === selectedWeekID;
          const selectable = !!row.plan;
          return (
            <div
              className={`wk-cal-week ${isActive ? "is-active" : ""} ${selectable ? "is-selectable" : ""}`}
              key={i}
              role={selectable ? "button" : undefined}
              tabIndex={selectable ? 0 : undefined}
              onClick={() => row.plan && onSelect(row.plan.id)}
              onKeyDown={(e) => {
                if (row.plan && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onSelect(row.plan.id);
                }
              }}
              title={
                selectable
                  ? `${formatRange(row.plan!.startISO, row.plan!.endISO)} · ${row.plan!.activities.length} aktivitas`
                  : undefined
              }
            >
              {row.days.map((day, d) => {
                const outside = day.getMonth() !== cursor.getMonth();
                const isToday = toISODate(day) === todayISO;
                const isSaturday = d === 5;
                const count = row.plan?.activities.length ?? 0;
                return (
                  <span
                    className={`wk-cal-day ${outside ? "is-outside" : ""} ${isToday ? "is-today" : ""}`}
                    key={d}
                  >
                    {day.getDate()}
                    {isSaturday && selectable && count > 0 && (
                      <b className="wk-cal-count" title={`${count} aktivitas`}>
                        {count}
                      </b>
                    )}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>

      <footer className="wk-cal-legend">
        <span>
          <i className="wk-cal-swatch is-active" /> Minggu aktif
        </span>
        <span>
          <i className="wk-cal-swatch" /> Minggu lain
        </span>
        <span>
          <b className="wk-cal-count static">n</b> jumlah aktivitas
        </span>
      </footer>
    </section>
  );
}

/* ---- ikon inline (stroke, mengikuti pola nav-icon) ---------------------- */

function LockIcon() {
  return (
    <svg className="wk-ico" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg className="wk-ico" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </svg>
  );
}
function GoalIcon() {
  return (
    <svg className="wk-ico" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="1" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg className="wk-ico" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}
function CheckSquareIcon() {
  return (
    <svg className="wk-ico" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="m8.5 12 2.5 2.5L16 9" />
    </svg>
  );
}
function PaperclipIcon() {
  return (
    <svg className="wk-ico" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 11.5 12.5 20a5 5 0 0 1-7-7l8-8a3.5 3.5 0 0 1 5 5l-8 8a2 2 0 0 1-3-3l7.5-7.5" />
    </svg>
  );
}
function FileIcon() {
  return (
    <svg className="wk-ico" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}
function ExpandIcon() {
  return (
    <svg className="wk-ico" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  );
}
function HistoryIcon() {
  return (
    <svg className="wk-ico" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 4v4h4" />
      <path d="M12 8v4l3 2" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg className="wk-ico" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
    </svg>
  );
}
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`wk-ico wk-chevron ${open ? "open" : ""}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="m7 10 5 5 5-5" />
    </svg>
  );
}
function Star({ filled }: { filled: boolean }) {
  return (
    <svg
      className={`wk-star ${filled ? "filled" : ""}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="m12 3 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.7 1-5.8L3.5 9.9l5.9-.9Z" />
    </svg>
  );
}
