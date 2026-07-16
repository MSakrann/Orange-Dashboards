import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommentSection } from "@/components/admin/comments/comment-section";
import { CommentMutationError } from "@/lib/data/comment-mutations";

const comment = {
  id: "comment-a",
  author: "Avery",
  text: "Initial update",
  createdAt: "2026-07-15T10:00:00Z",
  updatedAt: "2026-07-15T10:00:00Z",
};

describe("CommentSection", () => {
  it("lets public viewers read comments without mutation controls", () => {
    render(<CommentSection itemId="item-a" label="Project comments" comments={[comment]} />);
    expect(screen.getByText("Initial update")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add comment/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit comment/i })).not.toBeInTheDocument();
  });

  it("validates admin create fields and prevents double submit", async () => {
    const user = userEvent.setup();
    let resolveCreate!: () => void;
    const onCreate = vi.fn((id: string, input: unknown) => {
      void id;
      void input;
      return new Promise<void>((resolve) => {
        resolveCreate = resolve;
      });
    });
    const onRefresh = vi.fn().mockResolvedValue([]);
    render(
      <CommentSection
        itemId="item-a"
        label="Project comments"
        comments={[]}
        admin
        onCreate={onCreate}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onRefresh={onRefresh}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add comment" }));
    await user.click(screen.getByRole("button", { name: "Post comment" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Author is required");

    await user.type(screen.getByLabelText("Author"), "Avery");
    await user.type(screen.getByLabelText("Comment"), "New update");
    await user.dblClick(screen.getByRole("button", { name: "Post comment" }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0][0]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(screen.getByRole("button", { name: "Saving" })).toBeDisabled();
    resolveCreate();
  });

  it("exposes matching comment text limits", async () => {
    const user = userEvent.setup();
    render(
      <CommentSection
        itemId="item-a"
        label="Project comments"
        comments={[]}
        admin
        onCreate={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Add comment" }));
    expect(screen.getByLabelText("Author")).toHaveAttribute("maxlength", "200");
    expect(screen.getByLabelText("Comment")).toHaveAttribute("maxlength", "10000");
  });

  it("supports edit and confirmed plain x delete with rollback and retry", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const onDelete = vi.fn().mockRejectedValueOnce(new Error("delete unavailable"))
      .mockResolvedValueOnce(undefined);
    const onRefresh = vi.fn().mockResolvedValue([comment]);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <CommentSection
        itemId="item-a"
        label="Subtask comments"
        comments={[comment]}
        admin
        onCreate={vi.fn()}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onRefresh={onRefresh}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit comment by Avery" }));
    const form = screen.getByRole("form", { name: "Edit comment" });
    await user.clear(within(form).getByLabelText("Comment"));
    await user.type(within(form).getByLabelText("Comment"), "Edited update");
    await user.click(within(form).getByRole("button", { name: "Save comment" }));
    expect(onUpdate).toHaveBeenCalledWith(comment, {
      authorName: "Avery",
      body: "Edited update",
    });

    await user.click(screen.getByRole("button", { name: "Delete comment by Avery" }));
    expect(window.confirm).toHaveBeenCalled();
    expect(await screen.findByText("Initial update")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("delete unavailable");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onDelete).toHaveBeenCalledTimes(2);
  });

  it("never replays a committed create when only refresh failed", async () => {
    const user = userEvent.setup();
    const saved = { ...comment, id: "11111111-1111-4111-8111-111111111111", text: "Saved" };
    const onCreate = vi.fn().mockResolvedValue(saved);
    const onRefresh = vi.fn()
      .mockRejectedValueOnce(new Error("refresh unavailable"))
      .mockResolvedValueOnce([saved]);
    render(
      <CommentSection
        itemId="item-a"
        label="Project comments"
        comments={[]}
        admin
        onCreate={onCreate}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onRefresh={onRefresh}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add comment" }));
    await user.type(screen.getByLabelText("Author"), "Avery");
    await user.type(screen.getByLabelText("Comment"), "Saved");
    await user.click(screen.getByRole("button", { name: "Post comment" }));

    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/saved.*could not refresh/i);
    await user.click(screen.getByRole("button", { name: "Retry refresh" }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledTimes(2);
  });

  it("refetches before semantic retry and reuses the create UUID", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn()
      .mockRejectedValueOnce(new Error("outcome unknown"))
      .mockResolvedValueOnce(undefined);
    const onRefresh = vi.fn().mockResolvedValue([]);
    render(
      <CommentSection
        itemId="item-a"
        label="Project comments"
        comments={[]}
        admin
        onCreate={onCreate}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onRefresh={onRefresh}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add comment" }));
    await user.type(screen.getByLabelText("Author"), "Avery");
    await user.type(screen.getByLabelText("Comment"), "Retry me");
    await user.click(screen.getByRole("button", { name: "Post comment" }));
    await screen.findByRole("button", { name: "Retry" });
    const firstId = onCreate.mock.calls[0][0];

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRefresh.mock.invocationCallOrder[1]).toBeLessThan(
      onCreate.mock.invocationCallOrder[1],
    );
    expect(onCreate.mock.calls[1][0]).toBe(firstId);
  });

  it("detects an already-applied create before offering mutation replay", async () => {
    const user = userEvent.setup();
    let createdId = "";
    const onCreate = vi.fn((id: string) => {
      createdId = id;
      return Promise.reject(new Error("response lost"));
    });
    const onRefresh = vi.fn(async () => [{
      ...comment,
      id: createdId,
      text: "Already saved",
    }]);
    render(
      <CommentSection
        itemId="item-a"
        label="Project comments"
        comments={[]}
        admin
        onCreate={onCreate}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onRefresh={onRefresh}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add comment" }));
    await user.type(screen.getByLabelText("Author"), "Avery");
    await user.type(screen.getByLabelText("Comment"), "Already saved");
    await user.click(screen.getByRole("button", { name: "Post comment" }));

    expect(await screen.findByText("Already saved")).toBeInTheDocument();
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("converges to the newest prop snapshot queued while busy", async () => {
    const user = userEvent.setup();
    let rejectCreate!: (error: Error) => void;
    const onCreate = vi.fn(() => new Promise<void>((_, reject) => {
      rejectCreate = reject;
    }));
    const onRefresh = vi.fn().mockRejectedValue(new Error("offline"));
    const { rerender } = render(
      <CommentSection
        itemId="item-a"
        label="Project comments"
        comments={[]}
        admin
        onCreate={onCreate}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onRefresh={onRefresh}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Add comment" }));
    await user.type(screen.getByLabelText("Author"), "Avery");
    await user.type(screen.getByLabelText("Comment"), "Pending");
    await user.click(screen.getByRole("button", { name: "Post comment" }));

    rerender(
      <CommentSection
        itemId="item-a"
        label="Project comments"
        comments={[{ ...comment, text: "Newest realtime value" }]}
        admin
        onCreate={onCreate}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onRefresh={onRefresh}
      />,
    );
    rejectCreate(new Error("save failed"));

    expect(await screen.findByText("Newest realtime value")).toBeInTheDocument();
  });

  it("lets a successful authoritative refetch supersede an older queued snapshot", async () => {
    const user = userEvent.setup();
    let rejectCreate!: (error: Error) => void;
    const onCreate = vi.fn(() => new Promise<void>((_, reject) => {
      rejectCreate = reject;
    }));
    const authoritative = [{ ...comment, text: "Authoritative result" }];
    const onRefresh = vi.fn().mockResolvedValue(authoritative);
    const { rerender } = render(
      <CommentSection
        itemId="item-a"
        label="Project comments"
        comments={[]}
        admin
        onCreate={onCreate}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onRefresh={onRefresh}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Add comment" }));
    await user.type(screen.getByLabelText("Author"), "Avery");
    await user.type(screen.getByLabelText("Comment"), "Pending");
    await user.click(screen.getByRole("button", { name: "Post comment" }));
    rerender(
      <CommentSection
        itemId="item-a"
        label="Project comments"
        comments={[{ ...comment, text: "Older queued value" }]}
        admin
        onCreate={onCreate}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onRefresh={onRefresh}
      />,
    );
    rejectCreate(new Error("save failed"));

    expect(await screen.findByText("Authoritative result")).toBeInTheDocument();
    expect(screen.queryByText("Older queued value")).not.toBeInTheDocument();
  });

  it("treats stale edits as non-retryable and requires re-editing refreshed values", async () => {
    const user = userEvent.setup();
    const refreshed = [{ ...comment, text: "Changed remotely", updatedAt: "new-version" }];
    const onUpdate = vi.fn().mockRejectedValue(
      new CommentMutationError("This comment changed by someone else.", true),
    );
    const onRefresh = vi.fn().mockResolvedValue(refreshed);
    render(
      <CommentSection
        itemId="item-a"
        label="Project comments"
        comments={[comment]}
        admin
        onCreate={vi.fn()}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
        onRefresh={onRefresh}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Edit comment by Avery" }));
    await user.clear(screen.getByLabelText("Comment"));
    await user.type(screen.getByLabelText("Comment"), "My stale edit");
    await user.click(screen.getByRole("button", { name: "Save comment" }));

    expect(await screen.findByText("Changed remotely")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/changed.*review.*edit/i);
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("requires a fresh confirmation after a stale comment delete", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    confirm.mockClear();
    const refreshed = [{ ...comment, text: "Changed before delete", updatedAt: "new-version" }];
    const onDelete = vi.fn().mockRejectedValue(
      new CommentMutationError("This comment changed by someone else.", true),
    );
    render(
      <CommentSection
        itemId="item-a"
        label="Project comments"
        comments={[comment]}
        admin
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={onDelete}
        onRefresh={vi.fn().mockResolvedValue(refreshed)}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete comment by Avery" }));

    expect(await screen.findByText("Changed before delete")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledTimes(1);
  });
});
