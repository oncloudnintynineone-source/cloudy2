import { describe, expect, it, vi } from "vitest";

import { activatable } from "./activatable";

function keyEvent(key: string, onRow = true) {
  // Same reference = focus sits on the row itself; distinct objects model
  // focus on an inner interactive child.
  const target = {};
  return {
    key,
    target: onRow ? target : { inner: true },
    currentTarget: target,
    preventDefault: vi.fn(),
  };
}

describe("activatable", () => {
  it("returns button semantics", () => {
    const props = activatable(() => {});
    expect(props.role).toBe("button");
    expect(props.tabIndex).toBe(0);
  });

  it.each(["Enter", " "])("activates on %s and prevents the default", (key) => {
    const onActivate = vi.fn();
    const props = activatable(onActivate);
    const event = keyEvent(key);
    props.onKeyDown(event as never);
    expect(onActivate).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it.each(["ArrowDown", "Escape", "a"])("ignores %s", (key) => {
    const onActivate = vi.fn();
    const props = activatable(onActivate);
    const event = keyEvent(key);
    props.onKeyDown(event as never);
    expect(onActivate).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("does not fire when an inner element holds focus", () => {
    const onActivate = vi.fn();
    const props = activatable(onActivate);
    props.onKeyDown(keyEvent("Enter", false) as never);
    expect(onActivate).not.toHaveBeenCalled();
  });});
