/**
 * The boilerplate tail every admin create/update/delete shares: audit the write,
 * then invalidate the config cache and revalidate the affected paths.
 *
 * The entity-specific work (validation, normalization, DB write, audit payload
 * shape) stays at the call site — this helper never serializes rows, so audit
 * `details` remain byte-identical to the hand-written version.
 */

import { actorFromSession, type AuditAction, type SessionActorLike } from "@/lib/audit/build";
import { logAction } from "@/lib/audit/log";

import { applyWriteEffects, type WriteEffect, type WriteEffectName } from "./effects";

export interface AdminWriteInput {
  session: SessionActorLike;
  action: AuditAction;
  entityType: string;
  entityId: string;
  entityName: string;
  method: string;
  details?: unknown;
  /** Named effect preset for the write. */
  effect: WriteEffectName;
  /** One-off cache keys/paths added to the preset (deduped). */
  extraEffect?: Partial<WriteEffect>;
}

export interface AdminWriteDeps {
  log: typeof logAction;
  apply: typeof applyWriteEffects;
}

const REAL_DEPS: AdminWriteDeps = { log: logAction, apply: applyWriteEffects };

/**
 * Audit + effect tail. Call it after the DB write succeeds and before returning
 * `{ ok: true }`. Side effects are injectable so the order is unit-tested.
 */
export async function commitAdminWrite(
  input: AdminWriteInput,
  deps: AdminWriteDeps = REAL_DEPS,
): Promise<void> {
  await deps.log({
    ...actorFromSession(input.session),
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    entityName: input.entityName,
    method: input.method,
    details: input.details,
  });
  deps.apply(input.effect, input.extraEffect);
}
