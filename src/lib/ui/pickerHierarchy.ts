/**
 * Shared horizontal indent (px) applied per nesting level wherever a picker or
 * department filter mirrors the department tree (sections, department rows and
 * chip filters). One constant keeps every surface visually consistent.
 */
export const HIERARCHY_INDENT = 18;

/** Left offset (px) for the given tree depth (undefined = top level). */
export function hierarchyIndent(depth: number | undefined): number {
  return (depth ?? 0) * HIERARCHY_INDENT;
}
