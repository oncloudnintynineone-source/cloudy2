/**
 * Shared, pure token-template engine used wherever an admin template must
 * render text with conditional groups. It powers the event-title templates
 * (`formatEventTitle`) and the participant-notification content templates.
 *
 * Grammar (same across both surfaces):
 * - `{token}` / `{token:style}` substitute the resolver's value for that token
 *   (case-insensitive token names and styles).
 * - A resolver returning `null` means the token is **unknown** (or its style
 *   is unsupported): the raw `{...}` text is kept verbatim and it always
 *   counts as content for conditional groups.
 * - A resolver returning a string is the substitution; an empty/whitespace
 *   result counts as "no content".
 * - `<...>` is a **conditional group** (nestable): its inner content renders
 *   only when at least one token inside (OR) resolves to non-empty content.
 *   Unknown tokens count as content, so a group around them is kept. A group
 *   with no tokens at all is treated as literal `<...>` text.
 * - Escape `\< \> \{ \} \\` for literal characters; an unmatched `\` is
 *   literal; unmatched `<` / `>` are fail-soft (an unclosed group collapses
 *   back into literal text).
 *
 * Kept free of I/O so it can be unit-tested without a database.
 */

type TemplateNode =
  | { kind: "text"; text: string }
  | { kind: "token"; raw: string; token: string; style: string | undefined }
  | { kind: "conditional"; children: TemplateNode[] };

/**
 * Resolve one token to the text to substitute. Return `null` when the token
 * (or its style) is unknown — the engine then keeps the literal `{...}` as-is.
 */
export type TokenTemplateResolver = (
  token: string,
  style: string | undefined,
) => string | null;

function subtreeHasToken(nodes: TemplateNode[]): boolean {
  for (const n of nodes) {
    if (n.kind === "token") return true;
    if (n.kind === "conditional" && subtreeHasToken(n.children)) return true;
  }
  return false;
}

/** Whether a token node counts as content: unknown → always; known → non-empty. */
function tokenHasContent(
  node: Extract<TemplateNode, { kind: "token" }>,
  resolve: TokenTemplateResolver,
): boolean {
  const resolved = resolve(node.token, node.style);
  if (resolved === null) {
    return true;
  }
  return resolved.trim() !== "";
}

function subtreeHasContent(nodes: TemplateNode[], resolve: TokenTemplateResolver): boolean {
  for (const n of nodes) {
    if (n.kind === "token") {
      if (tokenHasContent(n, resolve)) return true;
    } else if (n.kind === "conditional") {
      // OR rule: if any token inside the conditional is non-empty, the whole
      // conditional counts as having content (even if the outer group will be
      // hidden, the inner non-empty value means the outer has content).
      if (subtreeHasContent(n.children, resolve)) return true;
    }
  }
  return false;
}

function renderNodes(nodes: TemplateNode[], resolve: TokenTemplateResolver): string {
  let out = "";
  for (const node of nodes) {
    if (node.kind === "text") {
      out += node.text;
    } else if (node.kind === "token") {
      const resolved = resolve(node.token, node.style);
      out += resolved === null ? node.raw : resolved;
    } else if (node.kind === "conditional") {
      // Zero-token groups are literal: preserve the brackets.
      if (!subtreeHasToken(node.children)) {
        out += `<${renderNodes(node.children, resolve)}>`;
      } else if (subtreeHasContent(node.children, resolve)) {
        out += renderNodes(node.children, resolve);
      } else {
        // Empty -> drop entirely.
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Parser: template string -> AST. Fail-soft on unmatched < >.
// Escapes: \< \> \{ \} \\ -> literal. A '\' not followed by one of those is literal '\'.
// ---------------------------------------------------------------------------

export function parseTokenTemplate(template: string): TemplateNode[] {
  // Stack of frames; each frame holds the nodes for that level.
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
      // Lone '\' is literal.
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
        // Push conditional into parent frame.
        stack[stack.length - 1].push({ kind: "conditional", children });
      } else {
        // Unmatched '>' at top level -> literal.
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
        // Treat any {...} as a token node (resolution passes through unknowns).
        flushText();
        const raw = template.slice(i, close + 1);
        pushNode({ kind: "token", raw, token, style });
        i = close + 1;
        continue;
      }
      // No closing } -> literal.
      textBuf += ch;
      i += 1;
      continue;
    }

    textBuf += ch;
    i += 1;
  }

  flushText();

  // Unmatched '<' remaining: collapse stack frames back into literals.
  // Each unclosed frame's content becomes literal "<" + rendered text of its children.
  while (stack.length > 1) {
    const children = stack.pop()!;
    const innerLiteral = nodesToLiteral(children);
    // Append as text to the parent frame.
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

/**
 * Render a template string through the resolver. The result is not trimmed —
 * callers decide (event titles and notification copy both trim).
 */
export function renderTokenTemplate(template: string, resolve: TokenTemplateResolver): string {
  const nodes = parseTokenTemplate(template);
  return renderNodes(nodes, resolve);
}
