import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowDownLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleCheck,
  Clock3,
  LayoutDashboard,
  ListTodo,
  LoaderCircle,
  LogOut,
  Menu,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import Auth from "./Auth";
import { api, ApiError, errorMessage } from "./api";
import { Brand, EmptyState, Modal, TaskForm } from "./components";
import {
  priorityLabels,
  statusLabels,
  type Priority,
  type Stats,
  type Status,
  type Task,
  type TaskInput,
  type TaskPage,
  type User,
} from "./types";

type View = "overview" | "tasks" | "completed";
export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [initializing, setInitializing] = useState(true),
    [sessionError, setSessionError] = useState("");
  const checkSession = useCallback(async () => {
    setInitializing(true);
    setSessionError("");
    try {
      setUser((await api<{ user: User }>("/auth/me")).user);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401))
        setSessionError(
          "We couldn’t reach your workspace. Check your connection and try again.",
        );
    } finally {
      setInitializing(false);
    }
  }, []);
  useEffect(() => {
    void checkSession();
  }, [checkSession]);
  if (initializing)
    return (
      <div className="full-loading" role="status">
        <Brand />
        <LoaderCircle className="spin" />
        <p>Opening your workspace…</p>
      </div>
    );
  if (sessionError)
    return (
      <div className="full-loading">
        <Brand />
        <p role="alert">{sessionError}</p>
        <button className="button primary" onClick={() => void checkSession()}>
          Try again
        </button>
      </div>
    );
  if (!user) return <Auth onAuthenticated={setUser} />;
  return <Workspace user={user} onLogout={() => setUser(null)} />;
}
function Workspace({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [view, setView] = useState<View>("overview"),
    [mobileNav, setMobileNav] = useState(false);
  const [data, setData] = useState<TaskPage | null>(null),
    [stats, setStats] = useState<Stats | null>(null);
  const [search, setSearch] = useState(""),
    [debounced, setDebounced] = useState(""),
    [status, setStatus] = useState<Status | "">(""),
    [priority, setPriority] = useState<Priority | "">(""),
    [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [refresh, setRefresh] = useState(0);
  const [editor, setEditor] = useState<Task | "new" | null>(null),
    [deleting, setDeleting] = useState<Task | null>(null),
    [detail, setDetail] = useState<Task | null>(null),
    [busy, setBusy] = useState(false),
    [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [compact, setCompact] = useState(
    () => window.matchMedia("(max-width: 850px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width: 850px)");
    const update = () => setCompact(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!mobileNav) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNav(false);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [mobileNav]);
  const generation = useRef(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const current = ++generation.current;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      page: String(page),
      limit: "12",
      ...(debounced && { search: debounced }),
      ...((view === "completed" || status) && {
        status: view === "completed" ? "COMPLETED" : status,
      }),
      ...(priority && { priority }),
    });
    void Promise.all([
      api<TaskPage>(`/tasks?${params}`),
      api<Stats>("/dashboard/stats"),
    ])
      .then(([tasks, counts]) => {
        if (current !== generation.current) return;
        if (page > 1 && !tasks.tasks.length) {
          setPage(Math.max(1, tasks.pages));
          return;
        }
        setData(tasks);
        setStats(counts);
      })
      .catch((e) => {
        if (current !== generation.current) return;
        if (e instanceof ApiError && e.status === 401) onLogout();
        else setError(errorMessage(e));
      })
      .finally(() => {
        if (current === generation.current) setLoading(false);
      });
    return () => {
      generation.current++;
    };
  }, [debounced, status, priority, page, view, refresh, onLogout]);
  // Menus close on Escape and outside clicks, and when their action is chosen.
  useEffect(() => {
    if (!activeMenu) return;
    const close = () => setActiveMenu(null);
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", key);
    };
  }, [activeMenu]);
  function navigate(next: View) {
    setView(next);
    setStatus("");
    setPriority("");
    setSearch("");
    setDebounced("");
    setPage(1);
    setMobileNav(false);
  }
  function reload(message: string) {
    setNotice(message);
    setRefresh((n) => n + 1);
  }
  async function save(input: TaskInput) {
    await api(editor === "new" ? "/tasks" : `/tasks/${(editor as Task).id}`, {
      method: editor === "new" ? "POST" : "PATCH",
      body: JSON.stringify(input),
    });
    reload(
      editor === "new" ? "Task created. One step closer." : "Task updated.",
    );
    setEditor(null);
  }
  async function toggle(task: Task) {
    setBusy(true);
    setError("");
    try {
      await api(`/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: task.status === "COMPLETED" ? "TODO" : "COMPLETED",
        }),
      });
      reload(
        task.status === "COMPLETED"
          ? "Task reopened."
          : "Task completed. Nicely done!",
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    setError("");
    try {
      await api(`/tasks/${deleting.id}`, { method: "DELETE", body: "{}" });
      setDeleting(null);
      reload("Task deleted.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    try {
      await api("/auth/logout", { method: "POST", body: "{}" });
      onLogout();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  const filtered = Boolean(search || status || priority);
  const completion = stats?.total
    ? Math.round((stats.completed / stats.total) * 100)
    : 0;
  const firstName = user.name.split(" ")[0];
  return (
    <div className="workspace">
      {mobileNav && (
        <button
          className="nav-backdrop"
          aria-label="Dismiss navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside
        id="workspace-navigation"
        inert={compact && !mobileNav}
        aria-hidden={compact && !mobileNav}
        className={`sidebar ${mobileNav ? "open" : ""}`}
      >
        <div className="sidebar-brand">
          <Brand />
          <button
            className="icon-button mobile-only"
            aria-label="Close navigation"
            onClick={() => setMobileNav(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace-label">
          <span className="workspace-avatar">{firstName[0].toUpperCase()}</span>
          <div>
            <strong>Personal workspace</strong>
            <small>Let’s make things happen</small>
          </div>
        </div>
        <span className="nav-heading">WORKSPACE</span>
        <nav aria-label="Main navigation">
          <button
            className={`nav-item ${view === "overview" ? "active" : ""}`}
            onClick={() => navigate("overview")}
          >
            <LayoutDashboard size={18} />
            Overview
          </button>
          <button
            className={`nav-item ${view === "tasks" ? "active" : ""}`}
            onClick={() => navigate("tasks")}
          >
            <ListTodo size={18} />
            All tasks<span className="nav-count">{stats?.total ?? "—"}</span>
          </button>
          <button
            className={`nav-item ${view === "completed" ? "active" : ""}`}
            onClick={() => navigate("completed")}
          >
            <CircleCheck size={18} />
            Completed
            <span className="nav-count">{stats?.completed ?? "—"}</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="focus-note">
            <span className="focus-spark">✳</span>
            <h3>
              A little focus
              <br />
              goes a long way.
            </h3>
            <p>
              You don’t have to do it all.
              <br />
              Just the next right thing.
            </p>
            <button onClick={() => setEditor("new")}>
              Make your next move <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="sidebar-user">
            <span className="user-avatar">
              {user.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </span>
            <div>
              <strong>{user.name}</strong>
              <small>Personal account</small>
            </div>
            <button
              className="icon-button"
              disabled={busy}
              onClick={() => void logout()}
              aria-label="Sign out"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-only"
              aria-label="Open navigation"
              aria-expanded={mobileNav}
              aria-controls="workspace-navigation"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>
              {view === "overview"
                ? "Overview"
                : view === "tasks"
                  ? "All tasks"
                  : "Completed"}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="today-date">
              <CalendarDays size={15} />
              {new Intl.DateTimeFormat("en", {
                month: "short",
                day: "numeric",
                year: "numeric",
              }).format(new Date())}
            </span>
            <span className="private-badge">
              <span className="live-dot" /> Personal space
            </span>
          </div>
        </header>
        <main className="main-content">
          <section className="page-heading">
            <div>
              <span className="eyebrow">A LITTLE FOCUS, EVERY DAY</span>
              <h1>
                {view === "overview" ? (
                  <>
                    Let’s find your flow, <span>{firstName}.</span>
                  </>
                ) : view === "tasks" ? (
                  <>
                    Your work. <span>In one place.</span>
                  </>
                ) : (
                  <>
                    Look how far <span>you’ve come.</span>
                  </>
                )}
              </h1>
              <p>
                {view === "completed"
                  ? "Every finished task is a small win worth noticing."
                  : "A clear view of your priorities. A little more room to breathe."}
              </p>
            </div>
            <button className="button primary" onClick={() => setEditor("new")}>
              <Plus size={17} />
              New task
            </button>
          </section>
          {view === "overview" && (
            <>
              <section className="stats-grid" aria-label="Task statistics">
                {[
                  {
                    label: "Total tasks",
                    value: stats?.total,
                    icon: ListTodo,
                    caption: "Everything on your radar",
                    tone: "neutral",
                  },
                  {
                    label: "To do",
                    value: stats?.pending,
                    icon: Circle,
                    caption: "Ready when you are",
                    tone: "gray",
                  },
                  {
                    label: "In progress",
                    value: stats?.inProgress,
                    icon: Clock3,
                    caption: "Good things in motion",
                    tone: "amber",
                  },
                  {
                    label: "Completed",
                    value: stats?.completed,
                    icon: CheckCheck,
                    caption: "A little closer to your goals",
                    tone: "green",
                  },
                ].map(({ label, value, icon: Icon, caption, tone }) => (
                  <article className={`stat-card ${tone}`} key={label}>
                    <div className="stat-label">
                      {label}
                      <span className={`stat-icon ${tone}`}>
                        <Icon size={18} />
                      </span>
                    </div>
                    <strong className="stat-number">{value ?? "—"}</strong>
                    <span className="stat-caption">{caption}</span>
                  </article>
                ))}
              </section>
              <section className="progress-banner">
                <div className="progress-illustration" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <ArrowUpRight size={32} />
                </div>
                <div className="progress-copy">
                  <span className="eyebrow">PROGRESS OVER PERFECTION</span>
                  <h2>
                    {stats?.total
                      ? completion === 100
                        ? "Everything done. Take a breath."
                        : "Every small step adds up."
                      : "Your next chapter is a blank canvas."}
                  </h2>
                  <p>
                    {stats?.total
                      ? `${stats.completed} of ${stats.total} tasks completed. Keep your momentum going.`
                      : "Add a task, set a priority, and make a little progress today."}
                  </p>
                </div>
                <div className="progress-summary">
                  <div>
                    <span>Overall progress</span>
                    <strong>{completion}%</strong>
                  </div>
                  <div
                    className="progress-track"
                    role="progressbar"
                    aria-label="Overall task completion"
                    aria-valuenow={completion}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div style={{ width: `${completion}%` }} />
                  </div>
                </div>
              </section>
            </>
          )}
          <section className="tasks-section">
            <div className="section-heading">
              <div>
                <h2>
                  {view === "completed" ? "Your finished tasks" : "Your tasks"}
                  <span className="number-chip">{data?.total ?? "—"}</span>
                </h2>
                <p>
                  {view === "completed"
                    ? "Small wins, collected here."
                    : "Big ideas. Small steps. All in one place."}
                </p>
              </div>
              <span className="section-hint">
                <SlidersHorizontal size={14} /> Organize your way
              </span>
            </div>
            <div className="filter-bar">
              <div className="search-input">
                <Search size={17} />
                <input
                  aria-label="Search tasks"
                  placeholder="Find a task…"
                  value={search}
                  maxLength={160}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    className="icon-button"
                    aria-label="Clear search"
                    onClick={() => setSearch("")}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <div className="filter-selects">
                {view !== "completed" && (
                  <label className="sr-only" htmlFor="status-filter">
                    Filter by status
                  </label>
                )}
                {view !== "completed" && (
                  <select
                    id="status-filter"
                    value={status}
                    onChange={(e) => {
                      setStatus(e.target.value as Status | "");
                      setPage(1);
                    }}
                  >
                    <option value="">All statuses</option>
                    {Object.entries(statusLabels).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                )}
                <label className="sr-only" htmlFor="priority-filter">
                  Filter by priority
                </label>
                <select
                  id="priority-filter"
                  value={priority}
                  onChange={(e) => {
                    setPriority(e.target.value as Priority | "");
                    setPage(1);
                  }}
                >
                  <option value="">All priorities</option>
                  {Object.entries(priorityLabels).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {error && (
              <div role="alert" className="error-box">
                {error}
                <button onClick={() => setRefresh((n) => n + 1)}>Retry</button>
              </div>
            )}
            {loading ? (
              <div className="table-loading" role="status">
                <LoaderCircle className="spin" size={21} />
                <span>Gathering your tasks…</span>
              </div>
            ) : !error && !data?.tasks.length ? (
              <EmptyState
                filtered={filtered}
                onCreate={() => setEditor("new")}
                onReset={() => {
                  setSearch("");
                  setPriority("");
                  setStatus("");
                  setPage(1);
                }}
              />
            ) : (
              data && (
                <>
                  <div className="table-scroll">
                    <table className="task-table">
                      <thead>
                        <tr>
                          <th scope="col">
                            TASK NAME <ArrowDown size={12} />
                          </th>
                          <th scope="col">STATUS</th>
                          <th scope="col">PRIORITY</th>
                          <th scope="col">DUE DATE</th>
                          <th scope="col">
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.tasks.map((task) => (
                          <tr key={task.id}>
                            <td>
                              <div className="task-name-cell">
                                <button
                                  className={`complete-toggle ${task.status === "COMPLETED" ? "checked" : ""}`}
                                  aria-label={`${task.status === "COMPLETED" ? "Reopen" : "Complete"} ${task.title}`}
                                  disabled={busy}
                                  onClick={() => void toggle(task)}
                                >
                                  {task.status === "COMPLETED" && (
                                    <Check size={12} />
                                  )}
                                </button>
                                <button
                                  className="task-title"
                                  onClick={() => setDetail(task)}
                                >
                                  <strong
                                    className={
                                      task.status === "COMPLETED"
                                        ? "task-done"
                                        : ""
                                    }
                                  >
                                    {task.title}
                                  </strong>
                                  {task.description && (
                                    <span>{task.description}</span>
                                  )}
                                </button>
                              </div>
                            </td>
                            <td>
                              <span
                                className={`status-badge ${task.status.toLowerCase()}`}
                              >
                                <span />
                                {statusLabels[task.status]}
                              </span>
                            </td>
                            <td>
                              <span
                                className={`priority-badge ${task.priority.toLowerCase()}`}
                              >
                                {task.priority === "HIGH" ? (
                                  <ArrowUp size={14} />
                                ) : task.priority === "LOW" ? (
                                  <ArrowDownLeft size={14} />
                                ) : (
                                  <span className="priority-medium">=</span>
                                )}
                                {priorityLabels[task.priority]}
                              </span>
                            </td>
                            <td>
                              <span
                                className={`due-date ${task.dueDate && task.dueDate.slice(0, 10) < new Date().toLocaleDateString("en-CA") && task.status !== "COMPLETED" ? "overdue" : ""}`}
                              >
                                {task.dueDate ? (
                                  new Intl.DateTimeFormat("en", {
                                    month: "short",
                                    day: "numeric",
                                    timeZone: "UTC",
                                  }).format(new Date(task.dueDate))
                                ) : (
                                  <span className="muted">No date</span>
                                )}
                              </span>
                            </td>
                            <td className="actions-cell">
                              <div className="row-actions">
                                <button
                                  className="icon-button"
                                  aria-label={`Edit ${task.title}`}
                                  onClick={() => setEditor(task)}
                                >
                                  <Pencil size={15} />
                                </button>
                                <button
                                  className="icon-button"
                                  aria-label={`Delete ${task.title}`}
                                  onClick={() => setDeleting(task)}
                                >
                                  <Trash2 size={15} />
                                </button>
                                <button
                                  className="icon-button mobile-menu-button"
                                  aria-label={`Actions for ${task.title}`}
                                  aria-expanded={activeMenu === task.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenu(
                                      activeMenu === task.id ? null : task.id,
                                    );
                                  }}
                                >
                                  <MoreHorizontal size={18} />
                                </button>
                                {activeMenu === task.id && (
                                  <div className="row-menu">
                                    <button onClick={() => setEditor(task)}>
                                      <Pencil size={14} />
                                      Edit task
                                    </button>
                                    <button onClick={() => setDeleting(task)}>
                                      <Trash2 size={14} />
                                      Delete task
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="table-footer">
                    <span>
                      {data.total
                        ? `${(data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.total)} of ${data.total} tasks`
                        : "0 tasks"}
                    </span>
                    <div>
                      <button
                        className="icon-button"
                        aria-label="Previous page"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => p - 1)}
                      >
                        <ChevronLeft size={17} />
                      </button>
                      <span>
                        Page {page} of {Math.max(1, data.pages)}
                      </span>
                      <button
                        className="icon-button"
                        aria-label="Next page"
                        disabled={page >= data.pages}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        <ChevronRight size={17} />
                      </button>
                    </div>
                  </div>
                </>
              )
            )}
          </section>
          <footer className="workspace-footer">
            <span>
              <span className="footer-flower">✳</span> A little structure. A lot
              of possibility.
            </span>
            <span>
              Built for your next big thing <ArrowUpRight size={13} />
            </span>
          </footer>
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          <CircleCheck size={18} />
          {notice}
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {editor && (
        <TaskForm
          key={editor === "new" ? "new" : editor.id}
          task={editor === "new" ? undefined : editor}
          onSave={save}
          onClose={() => setEditor(null)}
        />
      )}
      {deleting && (
        <Modal
          title="Let this task go?"
          onClose={() => {
            if (!busy) setDeleting(null);
          }}
          busy={busy}
        >
          <p className="delete-description">
            “{deleting.title}” will be permanently deleted. This action cannot
            be undone.
          </p>
          {error && (
            <p role="alert" className="error-box">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              Keep task
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy ? "Deleting…" : "Delete task"}
              <Trash2 size={15} />
            </button>
          </div>
        </Modal>
      )}
      {detail && (
        <Modal title={detail.title} onClose={() => setDetail(null)}>
          <div className="detail-badges">
            <span className={`status-badge ${detail.status.toLowerCase()}`}>
              <span />
              {statusLabels[detail.status]}
            </span>
            <span className={`priority-badge ${detail.priority.toLowerCase()}`}>
              {priorityLabels[detail.priority]} priority
            </span>
          </div>
          <p className="detail-description">
            {detail.description || "No description added."}
          </p>
          <p className="detail-date">
            <CalendarDays size={16} />
            {detail.dueDate
              ? `Due ${detail.dueDate.slice(0, 10)}`
              : "No due date"}
          </p>
          <div className="modal-actions">
            <button
              className="button primary"
              onClick={() => {
                setEditor(detail);
                setDetail(null);
              }}
            >
              Edit task
              <ArrowRight size={16} />
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
