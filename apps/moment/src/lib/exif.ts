import zeroperlWasmUrl from "@6over3/zeroperl-ts/zeroperl.wasm?url";

export interface ExtractedExifMetadata {
  date: string | null;
  geo: { lat: number; lng: number } | null;
}

interface ExifToolTags {
  DateTimeOriginal?: string;
  OffsetTimeOriginal?: string;
  GPSLatitude?: number;
  GPSLongitude?: number;
}

export async function extractExifMetadata(file: File): Promise<ExtractedExifMetadata> {
  const { parseMetadata } = await import("@uswriting/exiftool");
  const result = await parseMetadata<ExifToolTags[]>(file, {
    args: [
      "-json",
      "-n",
      "-DateTimeOriginal",
      "-OffsetTimeOriginal",
      "-GPSLatitude",
      "-GPSLongitude",
    ],
    fetch: () => globalThis.fetch(zeroperlWasmUrl),
    transform: (output) => JSON.parse(output) as ExifToolTags[],
  });

  if (!result.success) throw new Error(result.error);

  const tags = result.data[0];
  let date: string | null = null;
  if (tags?.DateTimeOriginal) {
    const value = tags.DateTimeOriginal.replace(/^(\d{4}):(\d{2}):(\d{2})[ T]/, "$1-$2-$3T");
    const parsed = new Date(`${value}${tags.OffsetTimeOriginal ?? ""}`);
    if (!Number.isNaN(parsed.getTime())) date = parsed.toISOString();
  }

  const lat = tags?.GPSLatitude;
  const lng = tags?.GPSLongitude;
  const geo =
    typeof lat === "number" &&
    lat >= -90 &&
    lat <= 90 &&
    typeof lng === "number" &&
    lng >= -180 &&
    lng <= 180 &&
    (lat !== 0 || lng !== 0)
      ? { lat, lng }
      : null;

  return { date, geo };
}
