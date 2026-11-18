import { useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Layers,
  LockKeyhole,
} from "lucide-react";
import { api, errorMessage } from "./api";
import { Brand } from "./components";
import type { User } from "./types";
export default function Auth({
  onAuthenticated,
}: {
  onAuthenticated: (user: User) => void;
}) {
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [visible, setVisible] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const body = {
        email: String(form.get("email")).trim(),
        password: String(form.get("password")),
        ...(register && { name: String(form.get("name")).trim() }),
      };
      const { user } = await api<{ user: User }>(
        `/auth/${register ? "register" : "login"}`,
        { method: "POST", body: JSON.stringify(body) },
      );
      onAuthenticated(user);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <Brand />
        <div className="story-content">
          <span className="pill">
            <span className="live-dot" /> A LITTLE CLARITY. A LOT OF
            POSSIBILITY.
          </span>
          <h1>
            Less mental clutter.
            <br />
            More <em>forward motion.</em>
          </h1>
          <p>
            Your ideas, deadlines, and next big things.
            <br />A thoughtful home for everything you want to do.
          </p>
          <div className="story-board" aria-hidden="true">
            <div className="story-board-top">
              <span>
                <Layers size={16} /> My workspace
              </span>
              <span>
                THIS WEEK <ArrowUpRight size={14} />
              </span>
            </div>
            <div className="story-task">
              <span className="story-check">
                <Check size={13} />
              </span>
              <span className="struck">Make a little space to think</span>
              <span className="mini-tag">Done</span>
            </div>
            <div className="story-task">
              <span className="story-circle" />
              <span>Bring the next idea to life</span>
              <span className="mini-tag amber">In progress</span>
            </div>
            <div className="story-task">
              <span className="story-circle" />
              <span>Build something that matters</span>
              <span className="mini-tag">To do</span>
            </div>
            <div className="story-progress">
              <span>Small steps. Real progress.</span>
              <span>Keep going ↗</span>
            </div>
          </div>
        </div>
        <div className="story-footer">
          <span>MAKE ROOM FOR PROGRESS.</span>
          <span>One task at a time.</span>
        </div>
      </section>
      <main className="auth-panel">
        <div className="auth-mobile-brand">
          <Brand />
        </div>
        <div className="auth-form-wrap">
          <span className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</span>
          <h2>{register ? "Find your flow." : "Welcome back."}</h2>
          <p className="auth-description">
            {register
              ? "A clear head starts with a clear plan. Let’s make yours."
              : "A fresh perspective on everything you have going on."}
          </p>
          <form onSubmit={submit} className="auth-form">
            {register && (
              <label>
                Full name
                <input
                  name="name"
                  autoComplete="name"
                  placeholder="Ambuj Kumar"
                  minLength={2}
                  maxLength={80}
                  required
                  disabled={busy}
                />
              </label>
            )}
            <label>
              Email address
              <input
                type="email"
                name="email"
                autoComplete="email"
                placeholder="you@example.com"
                maxLength={254}
                required
                disabled={busy}
              />
            </label>
            <label>
              Password
              <div className="password-input">
                <input
                  name="password"
                  aria-label="Password"
                  type={visible ? "text" : "password"}
                  autoComplete={register ? "new-password" : "current-password"}
                  placeholder={
                    register ? "At least 10 characters" : "Enter your password"
                  }
                  minLength={register ? 10 : 1}
                  maxLength={72}
                  required
                  disabled={busy}
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={visible ? "Hide password" : "Show password"}
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            {error && (
              <p role="alert" className="error-box">
                {error}
              </p>
            )}
            <button className="button primary auth-submit" disabled={busy}>
              {busy
                ? "One moment…"
                : register
                  ? "Create your workspace"
                  : "Sign in to your workspace"}
              <ArrowRight size={18} />
            </button>
          </form>
          <p className="auth-switch">
            {register ? "Already found your flow?" : "New around here?"}{" "}
            <button
              disabled={busy}
              onClick={() => {
                setRegister(!register);
                setError("");
              }}
            >
              {register ? "Sign in" : "Create an account"}{" "}
              <ArrowUpRight size={13} />
            </button>
          </p>
          <div className="auth-trust">
            <LockKeyhole size={14} />
            <span>Your workspace is personal. Your tasks stay yours.</span>
          </div>
        </div>
        <div className="auth-bottom">A calmer way to get things done.</div>
      </main>
    </div>
  );
}
