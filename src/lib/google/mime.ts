/**
 * Pure builder for the RFC 822 text email sent through the Gmail API's
 * `messages.send` (`raw` field). Kept free of I/O so it can be unit-tested
 * without a database or Google credentials.
 */

export interface TextEmailInput {
  to: string[];
  subject: string;
  body: string;
}

/**
 * RFC 2047 encoded-word for the Subject header. Non-ASCII titles (event
 * summaries are user text) must not appear raw in headers; the base64 payload
 * is split into chunks short enough for one encoded-word per header line,
 * continued with CRLF + space.
 */
function encodeSubject(subject: string): string {
  const base64 = Buffer.from(subject, "utf8").toString("base64");
  const chunks = base64.match(/.{1,48}/g) ?? [];
  return chunks.map((chunk, i) => `${i > 0 ? "\r\n " : ""}=?UTF-8?B?${chunk}?=`).join("");
}

/** The full MIME message as base64url, ready for `messages.send`. */
export function buildTextEmail(input: TextEmailInput): string {
  const recipients = input.to.filter((address) => address.trim()).map((a) => a.trim());
  const message =
    `To: ${recipients.join(", ")}\r\n` +
    `Subject: ${encodeSubject(input.subject)}\r\n` +
    `Content-Type: text/plain; charset="UTF-8"\r\n` +
    `MIME-Version: 1.0\r\n` +
    `\r\n` +
    input.body.replace(/\r\n?|\n/g, "\r\n");
  return Buffer.from(message, "utf8").toString("base64url");
}
