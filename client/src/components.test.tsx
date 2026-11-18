import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmptyState, TaskForm } from "./components";
import Auth from "./Auth";
import { api } from "./api";
vi.mock("./api", () => ({
  api: vi.fn(),
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : "Error"),
}));
describe("task form", () => {
  it("submits real entered values and normalized optional date", async () => {
    const user = userEvent.setup(),
      save = vi.fn().mockResolvedValue(undefined);
    render(<TaskForm onSave={save} onClose={vi.fn()} />);
    await user.type(screen.getByLabelText("Task title"), "Prepare application");
    await user.type(screen.getByLabelText(/Description/), "Review the project");
    await user.selectOptions(screen.getByLabelText("Priority"), "HIGH");
    await user.click(screen.getByRole("button", { name: "Create task" }));
    expect(save).toHaveBeenCalledWith({
      title: "Prepare application",
      description: "Review the project",
      status: "TODO",
      priority: "HIGH",
      dueDate: null,
    });
  });
  it("retains form input and shows a server error when saving fails", async () => {
    const user = userEvent.setup();
    render(
      <TaskForm
        onSave={vi.fn().mockRejectedValue(new Error("Server unavailable"))}
        onClose={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText("Task title"), "Keep my work");
    await user.click(screen.getByRole("button", { name: "Create task" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Server unavailable",
    );
    expect(screen.getByLabelText("Task title")).toHaveValue("Keep my work");
  });
});
describe("empty states and authentication", () => {
  it("offers clear filters when results are empty", async () => {
    const reset = vi.fn();
    render(<EmptyState filtered onCreate={vi.fn()} onReset={reset} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Clear filters" }),
    );
    expect(reset).toHaveBeenCalledOnce();
  });
  it("submits credentials and passes the returned account to the app", async () => {
    const account = { id: "1", name: "Ambuj", email: "ambuj@example.com" },
      done = vi.fn();
    vi.mocked(api).mockResolvedValue({ user: account });
    const user = userEvent.setup();
    render(<Auth onAuthenticated={done} />);
    await user.type(
      screen.getByLabelText("Email address"),
      "ambuj@example.com",
    );
    await user.type(screen.getByLabelText("Password"), "secret123456");
    await user.click(
      screen.getByRole("button", { name: "Sign in to your workspace" }),
    );
    await waitFor(() => expect(done).toHaveBeenCalledWith(account));
    expect(api).toHaveBeenCalledWith("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: "ambuj@example.com",
        password: "secret123456",
      }),
    });
  });
});
