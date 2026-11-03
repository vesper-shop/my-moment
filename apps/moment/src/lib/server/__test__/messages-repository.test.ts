import { describe, expect, it, vi } from "vite-plus/test";
import type { MessageRecord } from "~/types/messages";
import { updateMessage } from "../messages/repository";

describe("updateMessage", () => {
  it("returns null when no message belongs to the author", async () => {
    const run = vi.fn().mockResolvedValue({ meta: { changes: 0 } });
    const bind = vi.fn().mockReturnValue({ run });
    const prepare = vi.fn().mockReturnValue({ bind });
    const database = { prepare } as unknown as D1Database;

    await expect(
      updateMessage(database, "message-1", "author-1", "Updated", "owner-id"),
    ).resolves.toBeNull();

    expect(bind).toHaveBeenCalledWith("Updated", "message-1", "author-1");
    expect(prepare).toHaveBeenCalledOnce();
    expect(prepare.mock.calls[0]?.[0]).toContain('WHERE id = ? AND "authorId" = ?');
  });

  it("returns the updated message with viewer permissions", async () => {
    const updateRun = vi.fn().mockResolvedValue({ meta: { changes: 1 } });
    const updateBind = vi.fn().mockReturnValue({ run: updateRun });
    const row: MessageRecord = {
      id: "message-1",
      authorId: "author-1",
      parentId: null,
      content: "Updated",
      createdAt: "2026-08-03T00:00:00.000Z",
      authorName: "Author",
      authorImage: null,
    };
    const selectFirst = vi.fn().mockResolvedValue(row);
    const selectBind = vi.fn().mockReturnValue({ first: selectFirst });
    const prepare = vi
      .fn()
      .mockReturnValueOnce({ bind: updateBind })
      .mockReturnValueOnce({ bind: selectBind });
    const database = { prepare } as unknown as D1Database;

    await expect(
      updateMessage(database, "message-1", "author-1", "Updated", "owner-id"),
    ).resolves.toEqual({
      id: "message-1",
      parentId: null,
      content: "Updated",
      createdAt: row.createdAt,
      author: { name: "Author", image: null, isHost: false },
      canEdit: true,
      canDelete: true,
      replies: [],
    });
    expect(selectBind).toHaveBeenCalledWith("message-1");
  });
});
