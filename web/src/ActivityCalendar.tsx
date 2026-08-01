import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import "./activity-calendar.css";
import "./activity-reader-compact.css";

export type PlannedActivity = {
  id: string;
  date: string;
  title: string;
  description: string;
  boardColumn?: "todo" | "in_progress" | "review" | "done";
};
type ActivityMode = "calendar" | "tree" | "kanban";
type CalendarPeriod = 1 | 3 | 5 | 12;
type PublicHoliday = { date: string; name: string; local_name: string };
type HolidayEnvelope = { data: { country_code: string; year: number; items: PublicHoliday[] }; errors: null | Array<{message:string}> };
type GeneralSettingsEnvelope = { data: { date_format: string }; errors: null | Array<{message:string}> };
const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const monthNames = Array.from({ length: 12 }, (_, month) =>
  new Date(2024, month, 1).toLocaleString(undefined, { month: "long" }),
);

function formatWorkspaceDate(value: string, format = "d F Y") {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  if (format === "Y-m-d") return `${year}-${month}-${day}`;
  if (format === "d/m/Y") return `${day}/${month}/${year}`;
  if (format === "m/d/Y") return `${month}/${day}/${year}`;
  const monthLabel = date.toLocaleString(undefined, { month: format === "d M Y" ? "short" : "long" });
  return `${day} ${monthLabel} ${year}`;
}

export function activityTitle(markdown: string) {
  const line =
    markdown
      .split(/\r?\n/)
      .map((value) => value.trim())
      .find(Boolean) ?? "Activity";
  const plain =
    line
      .replace(/^#{1,6}\s+/, "")
      .replace(/^[-*+]\s+/, "")
      .replace(/^\d+[.)]\s+/, "")
      .replace(/^>\s+/, "")
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
      .replace(/[*_~`]/g, "")
      .trim() || "Activity";
  return plain.length > 80 ? `${plain.slice(0, 77)}...` : plain;
}

function activityStatusLabel(status: PlannedActivity["boardColumn"]) {
  return { todo: "To do", in_progress: "In progress", review: "Review", done: "Done" }[
    status ?? "todo"
  ];
}

function CalendarIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M5 2v3M15 2v3M3 7h14M4 4h12a1 1 0 0 1 1 1v12H3V5a1 1 0 0 1 1-1Z" />
    </svg>
  );
}
function TreeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M6 4h8M6 10h8M6 16h8M3 4h.01M3 10h.01M3 16h.01" />
    </svg>
  );
}
function KanbanIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <rect x="2.5" y="3" width="4" height="14" rx="1" />
      <rect x="8" y="3" width="4" height="9" rx="1" />
      <rect x="13.5" y="3" width="4" height="12" rx="1" />
    </svg>
  );
}

export function ActivityCalendar({
  activities,
  onActivitiesChange,
  finishDate,
  onFinishDateChange,
  reviewerCount,
  readOnly = false,
  periodViews = false,
}: {
  activities: PlannedActivity[];
  onActivitiesChange: (items: PlannedActivity[]) => void;
  finishDate: string;
  onFinishDateChange: (date: string) => void;
  reviewerCount: number;
  readOnly?: boolean;
  periodViews?: boolean;
}) {
  const now = new Date(),
    today = iso(now),
    todayYear = now.getFullYear(),
    todayMonth = now.getMonth();
  const [mode, setMode] = useState<ActivityMode>("calendar");
  const [calendarPeriod, setCalendarPeriod] = useState<CalendarPeriod>(1);
  const [current, setCurrent] = useState(
    () => new Date(todayYear, todayMonth, 1),
  );
  const [editingDate, setEditingDate] = useState("");
  const [editingID, setEditingID] = useState("");
  const [description, setDescription] = useState("");
  const [editingColumn, setEditingColumn] =
    useState<PlannedActivity["boardColumn"]>("todo");
  const [markFinish, setMarkFinish] = useState(false);
  const [draggedActivityID, setDraggedActivityID] = useState<string | null>(
    null,
  );
  const [dropColumn, setDropColumn] = useState<
    PlannedActivity["boardColumn"] | null
  >(null);
  const orderedActivities = useMemo(
    () =>
      [...activities].sort(
        (a, b) =>
          a.date.localeCompare(b.date) || a.title.localeCompare(b.title),
      ),
    [activities],
  );
  const selectedActivity = activities.find((item) => item.id === editingID);
  const years = useMemo(
    () => Array.from({ length: 16 }, (_, index) => todayYear + index),
    [todayYear],
  );
  const visibleMonths = useMemo(() => Array.from({length:calendarPeriod},(_,monthOffset)=>{
    const month=new Date(current.getFullYear(),current.getMonth()+monthOffset,1);
    const start=new Date(month);
    start.setDate(1-month.getDay());
    return {month,days:Array.from({length:42},(_,dayOffset)=>{const day=new Date(start);day.setDate(start.getDate()+dayOffset);return day})};
  }),[current,calendarPeriod]);
  const activitiesByDate=useMemo(()=>activities.reduce((grouped,item)=>{const items=grouped.get(item.date);if(items)items.push(item);else grouped.set(item.date,[item]);return grouped},new Map<string,PlannedActivity[]>()),[activities]);
  const calendarYear=current.getFullYear();
  const generalSettingsQuery=useQuery({
    queryKey:["settings","general"],
    queryFn:async()=>{
      const response=await fetch("/api/v1/settings/general",{credentials:"include"});
      const body=await response.json() as GeneralSettingsEnvelope;
      if(!response.ok)throw new Error(body.errors?.[0]?.message??"Unable to load date format");
      return body.data;
    },
    staleTime:1000*60*5,
  });
  const holidayQuery=useQuery({
    queryKey:["calendar-holidays",calendarYear],
    queryFn:async()=>{
      const responses=await Promise.all([calendarYear-1,calendarYear,calendarYear+1].map(async year=>{
        const response=await fetch(`/api/v1/calendar/holidays?year=${year}`,{credentials:"include"});
        const body=await response.json() as HolidayEnvelope;
        if(!response.ok)throw new Error(body.errors?.[0]?.message??"Unable to load public holidays");
        return body.data;
      }));
      return {countryCode:responses[1].country_code,items:responses.flatMap(item=>item.items)};
    },
    staleTime:1000*60*60*24,
  });
  const holidays=useMemo(()=>new Map((holidayQuery.data?.items??[]).map(item=>[item.date,item])),[holidayQuery.data]);
  const holidayCalendarUnavailable=mode==="calendar"&&!holidayQuery.isSuccess;
  function defaultTreeDate() {
    if (today !== finishDate) return today;
    const next = new Date(now);
    next.setDate(next.getDate() + 1);
    return iso(next);
  }
  function openNew(
    date: string,
    column: PlannedActivity["boardColumn"] = "todo",
  ) {
    if (readOnly || date < today || date === finishDate || holidayCalendarUnavailable || (mode==="calendar"&&holidays.has(date))) return;
    setEditingDate(date);
    setEditingID("");
    setDescription("");
    setEditingColumn(column);
    setMarkFinish(false);
  }
  function openEdit(item: PlannedActivity) {
    if(holidayCalendarUnavailable||(mode==="calendar"&&holidays.has(item.date)))return;
    setEditingDate(item.date);
    setEditingID(item.id);
    setDescription(item.description);
    setEditingColumn(item.boardColumn ?? "todo");
    setMarkFinish(false);
  }
  function closeEditor() {
    setEditingDate("");
    setEditingID("");
    setDescription("");
    setEditingColumn("todo");
    setMarkFinish(false);
  }
  function save() {
    if (!editingDate || editingDate < today) return;
    if (markFinish) {
      onActivitiesChange(
        activities.filter((item) => item.date !== editingDate),
      );
      onFinishDateChange(editingDate);
      closeEditor();
      return;
    }
    if (!description.trim() || editingDate === finishDate) return;
    const markdown = description.trim();
    const next = {
      id: editingID || crypto.randomUUID(),
      date: editingDate,
      title: activityTitle(markdown),
      description: markdown,
      boardColumn: editingColumn,
    };
    onActivitiesChange(
      editingID
        ? activities.map((item) => (item.id === editingID ? next : item))
        : [...activities, next],
    );
    closeEditor();
  }
  function moveActivity(column: PlannedActivity["boardColumn"]) {
    if (readOnly || !draggedActivityID || !column) return;
    onActivitiesChange(
      activities.map((item) =>
        item.id === draggedActivityID ? { ...item, boardColumn: column } : item,
      ),
    );
    setDraggedActivityID(null);
    setDropColumn(null);
  }
  function changeYear(year: number) {
    setCurrent(
      new Date(
        year,
        year === todayYear
          ? Math.max(current.getMonth(), todayMonth)
          : current.getMonth(),
        1,
      ),
    );
  }
  const atCurrentMonth =
    current.getFullYear() === todayYear && current.getMonth() === todayMonth;
  const saveDisabled =
    !editingDate ||
    editingDate < today ||
    (!markFinish && (!description.trim() || editingDate === finishDate)) ||
    holidayCalendarUnavailable ||
    (mode==="calendar"&&holidays.has(editingDate));
  return (
    <div className="activity-calendar">
      <div
        className="activity-mode-switch"
        role="tablist"
        aria-label="Activity planning mode"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "calendar"}
          className={mode === "calendar" ? "active" : ""}
          onClick={() => setMode("calendar")}
        >
          <CalendarIcon />
          Calendar Mode
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "tree"}
          className={mode === "tree" ? "active" : ""}
          onClick={() => setMode("tree")}
        >
          <TreeIcon />
          Tree Mode
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "kanban"}
          className={mode === "kanban" ? "active" : ""}
          onClick={() => setMode("kanban")}
        >
          <KanbanIcon />
          Kanban Mode
        </button>
      </div>
      {mode === "calendar" && (
        <>
          <div className="calendar-toolbar">
            <div className={`calendar-period ${periodViews?"has-period-views":""}`}>
              <select
                aria-label="Calendar month"
                value={current.getMonth()}
                onChange={(event) =>
                  setCurrent(
                    new Date(
                      current.getFullYear(),
                      Number(event.target.value),
                      1,
                    ),
                  )
                }
              >
                {monthNames.map((month, index) => (
                  <option
                    key={month}
                    value={index}
                    disabled={
                      current.getFullYear() === todayYear && index < todayMonth
                    }
                  >
                    {month}
                  </option>
                ))}
              </select>
              <select
                aria-label="Calendar year"
                value={current.getFullYear()}
                onChange={(event) => changeYear(Number(event.target.value))}
              >
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
            <div>
              {periodViews&&<label className="calendar-view-control"><span>View Period</span><select className="calendar-view-period" aria-label="Calendar view period" value={calendarPeriod} onChange={event=>setCalendarPeriod(Number(event.target.value) as CalendarPeriod)}><option value={1}>Current month</option><option value={3}>3 month period</option><option value={5}>5 month period</option><option value={12}>1 year period</option></select></label>}
              <button
                type="button"
                aria-label="Previous month"
                disabled={atCurrentMonth}
                onClick={() =>
                  setCurrent(
                    new Date(current.getFullYear(), current.getMonth() - 1, 1),
                  )
                }
              >
                &lt;
              </button>
              <button
                type="button"
                onClick={() => setCurrent(new Date(todayYear, todayMonth, 1))}
              >
                Today
              </button>
              <button
                type="button"
                aria-label="Next month"
                onClick={() =>
                  setCurrent(
                    new Date(current.getFullYear(), current.getMonth() + 1, 1),
                  )
                }
              >
                &gt;
              </button>
            </div>
          </div>
          <div className={`calendar-months period-${calendarPeriod}`}>
          {visibleMonths.map(({month,days})=><section className={`calendar-month-panel ${calendarPeriod===1?"current-period-month":"compact-period-month"}`} key={`${month.getFullYear()}-${month.getMonth()}`} aria-label={month.toLocaleString(undefined,{month:"long",year:"numeric"})}>
          {calendarPeriod>1&&<h4>{month.toLocaleString(undefined,{month:"long",year:"numeric"})}</h4>}
          <div className="calendar-weekdays">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="calendar-grid">
            {days.map((day) => {
              const date = iso(day),
                items = activitiesByDate.get(date)??[],
                isFinish = date === finishDate,
                isPast = date < today,
                holiday=holidays.get(date);
              return (
                <div
                  key={date}
                  className={`calendar-day ${day.getDay()===0?"sunday-date":""} ${day.getMonth() !== month.getMonth() ? "outside" : ""} ${isPast ? "past-date" : ""} ${holiday ? "holiday-date" : ""} ${date === today ? "today" : ""} ${items.length ? "has-activity" : ""} ${isFinish ? "finish-date" : ""}`}
                  title={holiday?.local_name}
                >
                  <div className="day-head">
                    <time>{day.getDate()}</time>
                    {!readOnly && holidayQuery.isSuccess && !isPast && !isFinish && !holiday && (
                      <button
                        type="button"
                        aria-label={`Add activity on ${date}`}
                        onClick={() => openNew(date)}
                      >
                        +
                      </button>
                    )}
                  </div>
                  {holiday&&<><span className="holiday-label">{holiday.local_name}</span><span className="holiday-tooltip" role="tooltip"><strong>{holiday.local_name}</strong>{holiday.name!==holiday.local_name&&<small>{holiday.name}</small>}<time>{formatWorkspaceDate(date,generalSettingsQuery.data?.date_format)}</time></span></>}
                  {isFinish && (
                    <span className="finish-label">
                      <svg viewBox="0 0 16 16" aria-hidden="true">
                        <path d="m3 8 3 3 7-7" />
                      </svg>
                      Finish
                    </span>
                  )}
                  {items.length === 1 && (
                    <button
                      type="button"
                      className="calendar-activity single"
                      onClick={() => openEdit(items[0])}
                    >
                      <strong>{items[0].title}</strong>
                      <small>{items[0].description}</small>
                    </button>
                  )}
                  {items.length > 1 && (
                    <div className="activity-bubble-wrap">
                      <button
                        type="button"
                        className="activity-count-bubble"
                        aria-label={`${items.length} activities on ${date}`}
                      >
                        {items.length} activities
                      </button>
                      <div className="activity-popover">
                        <strong>{items.length} activities</strong>
                        {items.map((item) => (
                          <button
                            type="button"
                            key={item.id}
                            onClick={() => openEdit(item)}
                          >
                            <span>{item.title}</span>
                            <small>{item.description}</small>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          </section>)}
          </div>
          <small className="calendar-readonly-note">
            {readOnly
              ? "Select an activity to view its details."
              : holidayQuery.isError
                ? "Holiday calendar is unavailable; scheduling is temporarily disabled."
                : holidayQuery.isPending
                  ? "Loading public holidays..."
                  : `Past dates and public holidays (${holidayQuery.data.countryCode}) are read-only.`}
          </small>
        </>
      )}
      {mode === "tree" && (
        <section className="activity-tree mode-tree">
          <div className="activity-tree-head">
            <div>
              <strong>Activity tree</strong>
              <small>Chronological delivery path</small>
            </div>
            <div className="tree-head-actions">
              <span>{activities.length} activities</span>
              {!readOnly && (
                <button type="button" onClick={() => openNew(defaultTreeDate())}>
                  Add Activity
                </button>
              )}
            </div>
          </div>
          <div className="tree-track">
            {orderedActivities.length === 0 && !finishDate && (
              <div className="tree-empty">
                {readOnly
                  ? "No project activities are available."
                  : "Add an activity to build the project path."}
              </div>
            )}
            {orderedActivities.map((item, index) => (
              <button
                type="button"
                className="tree-node activity-node"
                key={item.id}
                onClick={() => openEdit(item)}
              >
                <span className="tree-marker">{index + 1}</span>
                <span className="tree-content">
                  <time>
                    {new Date(`${item.date}T12:00:00`).toLocaleDateString(
                      undefined,
                      { day: "numeric", month: "short", year: "numeric" },
                    )}
                  </time>
                  <strong>{item.title}</strong>
                  <small>{item.description}</small>
                </span>
                <span className="tree-edit">{readOnly ? "Details" : "Edit"}</span>
              </button>
            ))}
            {finishDate && (
              <>
                <div className="tree-node finish-node">
                  <span className="tree-marker">✓</span>
                  <span className="tree-content">
                    <time>
                      {new Date(`${finishDate}T12:00:00`).toLocaleDateString(
                        undefined,
                        { day: "numeric", month: "short", year: "numeric" },
                      )}
                    </time>
                    <strong>Work finished</strong>
                    <small>
                      {reviewerCount
                        ? "Project moves to On Review."
                        : "No reviewer configured; project can complete directly."}
                    </small>
                  </span>
                </div>
                {reviewerCount > 0 && (
                  <div className="tree-node review-node">
                    <span className="tree-marker">R</span>
                    <span className="tree-content">
                      <strong>On Review</strong>
                      <small>
                        {reviewerCount} reviewer{reviewerCount === 1 ? "" : "s"}{" "}
                        must approve or request revision.
                      </small>
                    </span>
                  </div>
                )}
                <div className="tree-node completed-node">
                  <span className="tree-marker">✓</span>
                  <span className="tree-content">
                    <strong>Completed</strong>
                    <small>
                      {reviewerCount
                        ? "Reached after review approval."
                        : "Reached when work is submitted as finished."}
                    </small>
                  </span>
                </div>
              </>
            )}
            {!finishDate && (
              <div className="tree-node finish-missing">
                <span className="tree-marker">!</span>
                <span className="tree-content">
                  <strong>Finish date required</strong>
                  <small>
                    Add a date and select Finish before creating this project.
                  </small>
                </span>
              </div>
            )}
          </div>
        </section>
      )}
      {mode === "kanban" && (
        <section className="activity-kanban">
          {(
            [
              { id: "todo", label: "To do" },
              { id: "in_progress", label: "In progress" },
              { id: "review", label: "Review" },
              { id: "done", label: "Done" },
            ] as const
          ).map((column) => {
            const items = orderedActivities.filter(
              (item) => (item.boardColumn ?? "todo") === column.id,
            );
            return (
              <div
                className={`kanban-column ${column.id} ${dropColumn === column.id ? "drag-over" : ""}`}
                onDragEnter={() => setDropColumn(column.id)}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDragLeave={(event) => {
                  if (
                    !event.currentTarget.contains(event.relatedTarget as Node)
                  )
                    setDropColumn(null);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  moveActivity(column.id);
                }}
                key={column.id}
              >
                <header>
                  <div>
                    <i />
                    <strong>{column.label}</strong>
                  </div>
                  <span>{items.length}</span>
                </header>
                <div className="kanban-cards">
                  {items.map((item) => (
                    <button
                      type="button"
                      draggable={!readOnly}
                      className={`kanban-card ${draggedActivityID === item.id ? "dragging" : ""}`}
                      key={item.id}
                      onDragStart={(event) => {
                        if (readOnly) return;
                        setDraggedActivityID(item.id);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", item.id);
                      }}
                      onDragEnd={() => {
                        setDraggedActivityID(null);
                        setDropColumn(null);
                      }}
                      onClick={() => openEdit(item)}
                    >
                      <time>
                        {new Date(`${item.date}T12:00:00`).toLocaleDateString(
                          undefined,
                          { day: "numeric", month: "short" },
                        )}
                      </time>
                      <strong>{item.title}</strong>
                      <small>{item.description}</small>
                    </button>
                  ))}
                  {!items.length && <p>No activities</p>}
                </div>
                {!readOnly && (
                  <button
                    type="button"
                    className="kanban-add"
                    onClick={() => openNew(defaultTreeDate(), column.id)}
                  >
                    + Add activity
                  </button>
                )}
              </div>
            );
          })}
        </section>
      )}{" "}
      {editingDate && readOnly && selectedActivity ? (
        <section className="activity-reader" role="dialog" aria-modal="false" aria-label="Activity details">
          <header>
            <div>
              <span>Activity details</span>
              <strong>{selectedActivity.title}</strong>
            </div>
            <button type="button" aria-label="Close activity details" onClick={closeEditor}>
              ×
            </button>
          </header>
          <div className="activity-reader-facts">
            <span>
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <rect x="3" y="4.5" width="14" height="12.5" rx="2" />
                <path d="M6 2.5v4M14 2.5v4M3 8h14" />
              </svg>
              {new Date(`${selectedActivity.date}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
            </span>
            <span>
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <circle cx="10" cy="10" r="7" />
                <path d="m6.5 10 2.2 2.2 4.8-5" />
              </svg>
              {activityStatusLabel(selectedActivity.boardColumn)}
            </span>
          </div>
          <div className="activity-reader-description">
            <span>Description</span>
            <pre>{selectedActivity.description || "No description provided."}</pre>
          </div>
          <footer>
            <button type="button" onClick={closeEditor}>Close</button>
          </footer>
        </section>
      ) : editingDate && (
        <div className="activity-editor">
          <div className="editor-head">
            <div>
              <strong>{editingID ? "Edit activity" : "Add activity"}</strong>
              <small>Shared activity form · Markdown supported</small>
            </div>
            <button
              type="button"
              aria-label="Close activity editor"
              onClick={closeEditor}
            >
              x
            </button>
          </div>
          <label>
            <span>Date</span>
            <input
              type="date"
              min={today}
              value={editingDate}
              onChange={(event) => setEditingDate(event.target.value)}
              required
            />
          </label>
          <label>
            <span>Status</span>
            <select
              value={editingColumn}
              disabled={markFinish}
              onChange={(event) =>
                setEditingColumn(
                  event.target.value as PlannedActivity["boardColumn"],
                )
              }
            >
              <option value="todo">To do</option>
              <option value="in_progress">In progress</option>
              <option value="review">Review</option>
              <option value="done">Done</option>
            </select>
          </label>
          <label>
            <span>Description</span>
            <textarea
              autoFocus={!editingID}
              disabled={markFinish}
              rows={7}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={
                "Describe the activity using Markdown\n\n- Deliverable\n- Acceptance criteria"
              }
            />
            <small>Markdown formatting is stored with the activity.</small>
          </label>
          {!editingID && (
            <label className="finish-check">
              <input
                type="checkbox"
                checked={markFinish}
                onChange={(event) => setMarkFinish(event.target.checked)}
              />
              <span>
                <strong>Finish</strong>
                <small>
                  Use the selected date as the project finish marker instead of
                  an activity.
                </small>
              </span>
            </label>
          )}
          {editingDate === finishDate && !markFinish && (
            <small className="field-warning">
              Choose another date; this date is reserved for Finish.
            </small>
          )}
          {editingID && (
            <button
              type="button"
              className="delete-activity"
              onClick={() => {
                onActivitiesChange(
                  activities.filter((item) => item.id !== editingID),
                );
                closeEditor();
              }}
            >
              Delete activity
            </button>
          )}
          <div className="editor-actions">
            <button type="button" onClick={closeEditor}>
              Cancel
            </button>
            <button
              type="button"
              className="save-activity"
              disabled={saveDisabled}
              onClick={save}
            >
              {markFinish
                ? "Set finish date"
                : editingID
                  ? "Save changes"
                  : "Add activity"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
