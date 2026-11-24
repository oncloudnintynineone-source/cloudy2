import { describe, expect, it } from "vitest";

import { EXTERNAL_LINK_PROPS, isHttpUrl, shortenUrl } from "./externalLink";

describe("isHttpUrl", () => {
  it("accepts only http(s)", () => {
    expect(isHttpUrl("https://x.com/a")).toBe(true);
    expect(isHttpUrl("http://x.com")).toBe(true);
  });

  it("rejects every other scheme and non-URLs", () => {
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("JavaScript:alert(1)")).toBe(false);
    expect(isHttpUrl("data:text/html,x")).toBe(false);
    expect(isHttpUrl("vbscript:msgbox(1)")).toBe(false);
    expect(isHttpUrl("file:///etc/passwd")).toBe(false);
    expect(isHttpUrl("blob:https://x.com/uuid")).toBe(false);
    expect(isHttpUrl("not a url")).toBe(false);
    expect(isHttpUrl("")).toBe(false);
  });
});

describe("shortenUrl", () => {
  it("drops the scheme and a trailing slash", () => {
    expect(shortenUrl("https://x.com/")).toBe("x.com");
    expect(shortenUrl("https://x.com/a#b")).toBe("x.com/a#b");
  });

  it("strips bidi and zero-width controls", () => {
    expect(shortenUrl("https://x.com/a\u202Eevil")).toBe("x.com/aevil");
    expect(shortenUrl("https://x.co\u200Bm/a")).toBe("x.com/a");
  });

  it("ellipsises long URLs", () => {
    const short = shortenUrl(`https://x.com/${"a".repeat(60)}`);
    expect(short).toHaveLength(48);
    expect(short.endsWith("…")).toBe(true);
  });
});

describe("EXTERNAL_LINK_PROPS", () => {
  it("opens away from the app and never leaks the opener", () => {
    expect(EXTERNAL_LINK_PROPS).toEqual({ target: "_blank", rel: "noopener noreferrer" });
  });
});
