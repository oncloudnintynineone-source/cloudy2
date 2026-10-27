export function mark(name: string): void {
  if (typeof performance === "undefined" || typeof performance.mark !== "function") {
    return;
  }
  try {
    performance.mark(name);
  } catch {
    // Performance marks are diagnostic only.
  }
}

export function measure(name: string, start: string, end?: string): void {
  if (typeof performance === "undefined" || typeof performance.measure !== "function") {
    return;
  }
  try {
    performance.measure(name, start, end);
  } catch {
    // Missing marks (e.g. a soft navigation) are not an error.
  }
}
