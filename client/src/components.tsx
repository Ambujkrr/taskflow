import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { X, Plus, ArrowUpRight, CircleCheck, Check } from "lucide-react";
import {
  priorityLabels,
  statusLabels,
  type Task,
  type TaskInput,
} from "./types";
export function Brand() {
  return (
    <a className="brand" href="/" aria-label="TaskFlow home">
      <span className="brand-mark">
        <Check size={21} strokeWidth={3} />
      </span>
      TaskFlow<span className="brand-dot">.</span>
    </a>
  );
}
export function Modal({
  title,
  children,
  onClose,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = "";
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="modal-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) closeRef.current();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="modal-inner">
        <div className="modal-heading">
          <div>
            <span className="eyebrow">YOUR WORKSPACE</span>
            <h2 id="modal-title">{title}</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close dialog"
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
export function TaskForm({
  task,
  onSave,
  onClose,
}: {
  task?: Task;
  onSave: (input: TaskInput) => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await onSave({
        title: String(form.get("title")).trim(),
        description: String(form.get("description")).trim(),
        status: form.get("status") as TaskInput["status"],
        priority: form.get("priority") as TaskInput["priority"],
        dueDate: String(form.get("dueDate")) || null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save task");
      setBusy(false);
    }
  }
  return (
    <Modal
      title={task ? "Edit task" : "Make your next move."}
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={submit} className="task-form">
        <label>
          Task title
          <input
            name="title"
            autoFocus
            required
            maxLength={160}
            defaultValue={task?.title}
            placeholder="What would you like to get done?"
          />
        </label>
        <label>
          Description <span className="optional">optional</span>
          <textarea
            name="description"
            rows={4}
            maxLength={3000}
            defaultValue={task?.description}
            placeholder="Add a little context…"
          />
        </label>
        <div className="form-grid">
          <label>
            Status
            <select
              aria-label="Status"
              name="status"
              defaultValue={task?.status ?? "TODO"}
            >
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select
              aria-label="Priority"
              name="priority"
              defaultValue={task?.priority ?? "MEDIUM"}
            >
              {Object.entries(priorityLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Due date <span className="optional">optional</span>
          <input
            type="date"
            name="dueDate"
            defaultValue={task?.dueDate?.slice(0, 10)}
          />
        </label>
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : task ? "Save changes" : "Create task"}
            <Plus size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function EmptyState({
  filtered,
  onCreate,
  onReset,
}: {
  filtered: boolean;
  onCreate: () => void;
  onReset: () => void;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <CircleCheck size={30} />
      </span>
      <h3>
        {filtered
          ? "No tasks match just yet."
          : "Good things start with a task."}
      </h3>
      <p>
        {filtered
          ? "Try a different search or give your filters a fresh start."
          : "Clear your head. Add your first task and take it one step at a time."}
      </p>
      <button
        className="button secondary"
        onClick={filtered ? onReset : onCreate}
      >
        {filtered ? "Clear filters" : "Create your first task"}
        <ArrowUpRight size={16} />
      </button>
    </div>
  );
}
