import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  parseMetadata: vi.fn(),
}));

vi.mock("@uswriting/exiftool", () => ({ parseMetadata: mocks.parseMetadata }));
vi.mock("@6over3/zeroperl-ts/zeroperl.wasm?url", () => ({ default: "/zeroperl.wasm" }));

import { extractExifMetadata } from "../exif";

describe("EXIF extraction", () => {
  beforeEach(() => {
    mocks.parseMetadata.mockReset();
  });

  it("normalizes an EXIF date with its original timezone and numeric GPS", async () => {
    mocks.parseMetadata.mockImplementation(async (_file, options) => ({
      success: true,
      data: options.transform(
        JSON.stringify([
          {
            DateTimeOriginal: "2026:08:02 20:34:56",
            OffsetTimeOriginal: "+08:00",
            GPSLatitude: 31.229167,
            GPSLongitude: 121.475,
          },
        ]),
      ),
      exitCode: 0,
    }));

    const result = await extractExifMetadata(new File(["image"], "IMG_0252.HEIC"));

    expect(result).toEqual({
      date: "2026-08-02T12:34:56.000Z",
      geo: { lat: 31.229167, lng: 121.475 },
    });
    expect(mocks.parseMetadata).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({ args: expect.arrayContaining(["-json", "-n"]) }),
    );
  });

  it("does not substitute another timestamp for a missing original date", async () => {
    mocks.parseMetadata.mockImplementation(async (_file, options) => ({
      success: true,
      data: options.transform(JSON.stringify([{ CreateDate: "2026:08:02 12:34:56" }])),
      exitCode: 0,
    }));

    const result = await extractExifMetadata(new File(["image"], "photo.jpg"));

    expect(result.date).toBeNull();
    expect(result.geo).toBeNull();
  });

  it("rejects invalid coordinates", async () => {
    mocks.parseMetadata.mockImplementation(async (_file, options) => ({
      success: true,
      data: options.transform(
        JSON.stringify([
          {
            GPSLatitude: 91,
            GPSLongitude: 121.475,
          },
        ]),
      ),
      exitCode: 0,
    }));

    const result = await extractExifMetadata(new File(["image"], "photo.jpg"));

    expect(result).toEqual({ date: null, geo: null });
  });

  it("rejects the zeroed GPS block a camera writes without a fix", async () => {
    mocks.parseMetadata.mockImplementation(async (_file, options) => ({
      success: true,
      data: options.transform(JSON.stringify([{ GPSLatitude: 0, GPSLongitude: 0 }])),
      exitCode: 0,
    }));

    const result = await extractExifMetadata(new File(["image"], "IMG_20260414.jpg"));

    expect(result.geo).toBeNull();
  });

  it("rejects unsuccessful ExifTool results", async () => {
    mocks.parseMetadata.mockResolvedValue({
      success: false,
      data: undefined,
      error: "Unknown file format",
      exitCode: 1,
    });

    await expect(extractExifMetadata(new File(["image"], "broken.heic"))).rejects.toThrow(
      "Unknown file format",
    );
  });
});
