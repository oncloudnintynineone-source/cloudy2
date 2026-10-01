-- Clear the KAH breach dedup log: rows recorded before the away-window key
-- change are scoped to the saved event's window, not the breach's away window,
-- so they are no longer meaningful. The table is dedup-only (notification
-- history lives in the audit log), so clearing is safe; a currently-breached
-- group simply re-notifies once on its next overseas mutation.
DELETE FROM "kah_breach_notifications";
