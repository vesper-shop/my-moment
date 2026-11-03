export const GATEWAY_PROVIDER_ID = "you-find-me";
export const GATEWAY_OWNER_SUBJECT = "owner";

export async function findOwnerId(db: D1Database): Promise<string | null> {
  const row = await db
    .prepare(`SELECT "userId" AS userId FROM account WHERE "providerId" = ? AND "accountId" = ?`)
    .bind(GATEWAY_PROVIDER_ID, GATEWAY_OWNER_SUBJECT)
    .first<{ userId: string }>();
  return row ? row.userId : null;
}
