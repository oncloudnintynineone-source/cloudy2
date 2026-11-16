# Message edit and branch

Edits a message in a DSH Chat conversation and continues from it in a new branch.

## What it does

Every user message row in Chat gains two controls under the bubble, beside its clock:

- **Copy message** — copies the message text.
- **Edit message** — opens an editor with the message text.

Saving an edit:

1. forks the Session from the prefix that ends immediately before the edited message,
2. sends the edited text into the new Session, and
3. opens that Session, so the branch continues from your edited message.

The original conversation keeps its full history and is never rewritten: the source Session log stays append-only, so nothing is lost if an edit turns out to be wrong.

## Using it

1. Hover a user message in Chat.
2. Press the pencil button (**Edit message**).
3. Change the text, then press **Edit & branch**. `Cmd/Ctrl+Enter` saves; `Escape` cancels.

The new Session's title is the source title with an incremented number.

## Limitations

- Attachments and extra content blocks of the original message are not carried into the branch; the edited text is sent on its own.
- The first message of a Session cannot be edited, because there is no history before it to branch from.
- Only user messages are editable; assistant replies are not.
- Turning the plugin off restores the built-in message row, including its own **Branch** action on completed turns.
