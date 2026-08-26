import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { kahGroupMembers, kahGroups, users } from "@/db/schema";

/** A KAH group with its resolved member list (id + display name). */
export interface KahGroupWithMembers {
  id: string;
  name: string;
  minPercentage: number;
  members: { id: string; name: string }[];
}

/**
 * All groups in name order with their members (member names for display).
 * The small tables make one pair of queries cheaper than a join+aggregate.
 */
export async function listKahGroupsWithMembers(): Promise<KahGroupWithMembers[]> {
  const [groupRows, memberRows] = await Promise.all([
    db.select().from(kahGroups).orderBy(asc(kahGroups.name)),
    db
      .select({
        groupId: kahGroupMembers.groupId,
        userId: users.id,
        userName: users.name,
      })
      .from(kahGroupMembers)
      .innerJoin(users, eq(users.id, kahGroupMembers.userId))
      .orderBy(asc(users.name)),
  ]);

  const byId = new Map<string, KahGroupWithMembers>(
    groupRows.map((row) => [
      row.id,
      { id: row.id, name: row.name, minPercentage: row.minPercentage, members: [] },
    ]),
  );
  for (const member of memberRows) {
    byId.get(member.groupId)?.members.push({ id: member.userId, name: member.userName });
  }
  return [...byId.values()];
}
