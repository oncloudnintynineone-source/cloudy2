/**
 * Pure formatter that renders a Google Calendar event title from an
 * admin-defined template. Kept free of I/O so it can be unit-tested without a
 * database. People arrive pre-resolved (all three name styles filled in) so
 * the formatter only performs string substitution.
 */

export interface EventTitlePerson {
  /** Plain user name. */
  full: string;
  /** User shortname (acronym); callers fall back to the plain name when blank. */
  acronym: string;
  /** Fully qualified name via the display-name template. */
  fqn: string;
}

export interface EventTitleType {
  /** Event type name (renders bare `{type}`). */
  name: string;
  /** Event type shortname (acronym); callers fall back to the name when blank. */
  acronym: string;
}

export interface EventTitleInput {
  /** The raw description the user typed into the event form. */
  description: string;
  /** Event type name + shortname, or null when the event has none. */
  eventType: EventTitleType | null;
  /** Invited personnel, in form order. */
  people: EventTitlePerson[];
  /** Invited department names, in form order. */
  departments: string[];
  /** The event's location; "" when unset (out-of-camp events are always ""). */
  location: string;
}

type TemplateNode =
  | { kind: "text"; text: string }
  | { kind: "token"; raw: string; token: string; style: string | undefined }
  | { kind: "conditional"; children: TemplateNode[] };

// ---------------------------------------------------------------------------
// Token resolution (shared)
// ---------------------------------------------------------------------------

function resolveToken(
  token: string,
  style: string | undefined,
  raw: string,
  input: EventTitleInput,
): string {
  if (token === "description") {
    return input.description;
  }
  if (token === "type") {
    if (input.eventType === null) {
      return "";
    }
    if (style === undefined) {
      return input.eventType.name;
    }
    if (style === "acronym") {
      return input.eventType.acronym || input.eventType.name;
    }
    return raw;
  }
  if (token === "people") {
    const peopleByStyle = (s: "full" | "acronym" | "fqn"): string =>
      input.people.map((person) => person[s]).join(", ");
    if (style === undefined || style === "fqn") {
      return peopleByStyle("fqn");
    }
    if (style === "full") {
      return peopleByStyle("full");
    }
    if (style === "acronym") {
      return peopleByStyle("acronym");
    }
    return raw;
  }
  if (token === "departments") {
    return input.departments.join(", ");
  }
  if (token === "location") {
    return input.location;
  }
  return raw;
}

function isKnownToken(token: string, style: string | undefined): boolean {
  if (token === "description" || token === "departments" || token === "location") {
    return style === undefined;
  }
  if (token === "type") {
    return style === undefined || style === "acronym";
  }
  if (token === "people") {
    return style === undefined || style === "fqn" || style === "full" || style === "acronym";
  }
  return false;
}

function tokenResolvesEmpty(
  node: Extract<TemplateNode, { kind: "token" }>,
  input: EventTitleInput,
): boolean {
  const resolved = resolveToken(node.token, node.style, node.raw, input);
  // Unknown tokens render as literal (raw) -> non-empty, so group counts as having content.
  if (!isKnownToken(node.token, node.style)) {
    return false;
  }
  return resolved.trim() === "";
}

function subtreeHasToken(nodes: TemplateNode[]): boolean {
  for (const n of nodes) {
    if (n.kind === "token") return true;
    if (n.kind === "conditional" && subtreeHasToken(n.children)) return true;
  }
  return false;
}

function subtreeHasNonEmptyToken(nodes: TemplateNode[], input: EventTitleInput): boolean {
  for (const n of nodes) {
    if (n.kind === "token") {
      if (!tokenResolvesEmpty(n, input)) return true;
    } else if (n.kind === "conditional") {
      // For OR rule, if any token inside the conditional is non-empty, the whole
      // conditional counts as having content (even if outer will be hidden, inner
      // non-empty means outer has content).
      if (subtreeHasNonEmptyToken(n.children, input)) return true;
    }
  }
  return false;
}

function renderNodes(nodes: TemplateNode[], input: EventTitleInput): string {
  let out = "";
  for (const node of nodes) {
    if (node.kind === "text") {
      out += node.text;
    } else if (node.kind === "token") {
      out += resolveToken(node.token, node.style, node.raw, input);
    } else if (node.kind === "conditional") {
      // Zero-token groups are literal: preserve brackets.
      if (!subtreeHasToken(node.children)) {
        out += `<${renderNodes(node.children, input)}>`;
      } else if (subtreeHasNonEmptyToken(node.children, input)) {
        out += renderNodes(node.children, input);
      } else {
        // empty -> drop entirely
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Parser: template string -> AST. Fail-soft on unmatched < >.
// Escapes: \< \> \{ \} \\ -> literal. A '\' not followed by one of those is literal '\'.
// ---------------------------------------------------------------------------

export function parseEventTitleTemplate(template: string): TemplateNode[] {
  // Stack of frames, each frame has nodes for that level
  const stack: TemplateNode[][] = [[]];

  const pushNode = (node: TemplateNode) => {
    stack[stack.length - 1].push(node);
  };

  let i = 0;
  let textBuf = "";

  const flushText = () => {
    if (textBuf) {
      pushNode({ kind: "text", text: textBuf });
      textBuf = "";
    }
  };

  while (i < template.length) {
    const ch = template[i];

    // Escape handling
    if (ch === "\\" && i + 1 < template.length) {
      const next = template[i + 1];
      if (next === "<" || next === ">" || next === "{" || next === "}" || next === "\\") {
        textBuf += next;
        i += 2;
        continue;
      }
      // lone '\' is literal
      textBuf += ch;
      i += 1;
      continue;
    }

    if (ch === "<") {
      flushText();
      stack.push([]);
      i += 1;
      continue;
    }

    if (ch === ">") {
      if (stack.length > 1) {
        flushText();
        const children = stack.pop()!;
        // push conditional into parent frame
        stack[stack.length - 1].push({ kind: "conditional", children });
      } else {
        // unmatched '>' at top level -> literal
        textBuf += ">";
      }
      i += 1;
      continue;
    }

    if (ch === "{") {
      const close = template.indexOf("}", i + 1);
      if (close !== -1) {
        const rawContent = template.slice(i + 1, close);
        const colonIdx = rawContent.indexOf(":");
        let rawToken: string;
        let rawStyle: string | undefined;
        if (colonIdx === -1) {
          rawToken = rawContent;
          rawStyle = undefined;
        } else {
          rawToken = rawContent.slice(0, colonIdx);
          rawStyle = rawContent.slice(colonIdx + 1);
        }
        const token = rawToken.trim().toLowerCase();
        const style = rawStyle?.trim().toLowerCase();
        // Decide whether this looks like a token: only treat as token if rawContent
        // contains at least one char; empty braces "{}" -> literal
        // We treat any {...} as token node (resolve will passthrough unknown)
        flushText();
        const raw = template.slice(i, close + 1);
        pushNode({ kind: "token", raw, token, style });
        i = close + 1;
        continue;
      }
      // no closing } -> literal
      textBuf += ch;
      i += 1;
      continue;
    }

    textBuf += ch;
    i += 1;
  }

  flushText();

  // Unmatched '<' remaining: collapse stack frames back into literals
  // Each unclosed frame's content should become literal "<" + rendered text of its children
  while (stack.length > 1) {
    const children = stack.pop()!;
    const innerLiteral = nodesToLiteral(children);
    // append as text to parent frame
    stack[stack.length - 1].push({ kind: "text", text: `<${innerLiteral}` });
  }

  return stack[0];
}

function nodesToLiteral(nodes: TemplateNode[]): string {
  let s = "";
  for (const n of nodes) {
    if (n.kind === "text") s += n.text;
    else if (n.kind === "token") s += n.raw;
    else if (n.kind === "conditional") s += `<${nodesToLiteral(n.children)}>`;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Warning helper (non-blocking): unmatched < or > after accounting for escapes
// ---------------------------------------------------------------------------

export function getEventTitleTemplateWarnings(template: string): string[] {
  const warnings: string[] = [];
  let depth = 0;
  let i = 0;
  while (i < template.length) {
    const ch = template[i];
    if (ch === "\\" && i + 1 < template.length) {
      const next = template[i + 1];
      if (next === "<" || next === ">" || next === "{" || next === "}" || next === "\\") {
        i += 2;
        continue;
      }
    }
    if (ch === "<") {
      // Look ahead to see if this '<' contains a token before its matching '>'
      // We warn for any unmatched regardless of zero-token rule, to keep simple.
      depth += 1;
    } else if (ch === ">") {
      if (depth > 0) {
        depth -= 1;
      } else {
        warnings.push("Unmatched '>' — escape as \\> for a literal '>'");
        // only warn once per template for this kind
        break;
      }
    }
    i += 1;
  }
  if (depth > 0) {
    warnings.push("Unmatched '<' — escape as \\< for a literal '<' or close with '>'");
  }
  return warnings;
}

/**
 * Substitute every `{...}` token in the template (case-insensitive):
 * `{description}`, `{type}` / `{type:acronym}`, `{departments}`, `{location}`,
 * and `{people}` / `{people:full}` / `{people:acronym}` / `{people:fqn}` (bare
 * `{people}` is the FQN style). List tokens are joined with `", "`; empty
 * lists/absent values resolve to an empty string, unknown tokens and unknown
 * styles are left as literal text, and the final result is trimmed.
 *
 * Conditional groups `<...>` (nestable, escape with `\`) render their inner
 * content only when at least one token inside (OR) resolves to non-empty.
 * Groups with no tokens at all are treated as literal `<...>` text.
 */
export function formatEventTitle(input: EventTitleInput, template: string): string {
  const nodes = parseEventTitleTemplate(template);
  return renderNodes(nodes, input).trim();
}
