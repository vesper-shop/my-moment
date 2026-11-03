import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createPhoto, isObjectInUse } from "../photos/repository";
import { createPhotoFromR2 } from "../photos/service";
import { photoCreateSchema } from "../photos/schema";

vi.mock("../photos/repository", () => ({
  createPhoto: vi.fn(),
  deletePhoto: vi.fn(),
  getPhoto: vi.fn(),
  isObjectInUse: vi.fn(),
  listPhotos: vi.fn(),
  updatePhoto: vi.fn(),
}));

describe("createPhotoFromR2", () => {
  const input = photoCreateSchema.parse({
    r2Key: "img/image9.png",
    thumbnailR2Key: "img/thumbnails/image9.jpg",
    title: "Reused",
    width: 1,
    height: 1,
  });

  function bindings() {
    const first = vi.fn().mockResolvedValue({ id: "owner-1" });
    const d1 = { prepare: () => ({ bind: () => ({ first }) }) } as unknown as D1Database;
    const bucket = { head: vi.fn().mockResolvedValue({ size: 10 }) } as unknown as R2Bucket;
    return { d1, bucket };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses objects that already belong to another photo", async () => {
    vi.mocked(isObjectInUse).mockResolvedValue(true);
    const { d1, bucket } = bindings();

    await expect(createPhotoFromR2(d1, bucket, "owner-1", input)).rejects.toMatchObject({
      code: "R2_OBJECT_IN_USE",
      httpStatus: 409,
    });
    expect(createPhoto).not.toHaveBeenCalled();
  });
});

describe("photoCreateSchema", () => {
  it.each(["img/haul/cover.jpg", "img/wishlist/a.png", "img/anime/a.png", "img/../x.png"])(
    "rejects %s",
    (key) => {
      expect(
        photoCreateSchema.safeParse({
          r2Key: key,
          thumbnailR2Key: "img/thumbnails/a.jpg",
          title: "x",
          width: 1,
          height: 1,
        }).success,
      ).toBe(false);
    },
  );
});
