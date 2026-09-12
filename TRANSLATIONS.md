# Translatable texts

Every text `@devicai/ui` renders itself, as it appears in the widget. Each
one is a key of the `translations` dictionary:

```tsx
<DevicProvider apiKey="…" translations={{ 'New chat': 'Nueva conversación' }}>
```

See [Translations](./README.md#translations) in the README for where the
dictionary can be set and how the layers merge. A few rules worth repeating
here:

- **Copy the key exactly** — same case, same punctuation, same `…` or `·`.
  An entry that does not match a key is simply never used.
- **Keep the `{placeholders}`** in your translation. They are filled after
  the lookup, so they may be reordered, but a dropped one loses its value.
- **Anything you leave out stays in English**, so translate as much or as
  little as you like.
- Texts you can already set through an option (`welcomeMessage`,
  `inputPlaceholder`, `title`, …) keep winning over the dictionary.

## Chat drawer — frame and header

- `+ Start a new chat`
- `A queued message was not sent — the text is back in the box.`
- `Apps in this chat`
- `Chat`
- `Close chat`
- `Connected apps`
- `Load more`
- `Loading more...`
- `Loading...`
- `New chat`
- `No conversations`
- `No credentials configured. Cannot transcribe audio.`
- `Open chat`
- `Remove reference`
- `Search conversations...`
- `The assistant is not taking messages while it works. Your message is back in the box.`
- `Waiting for subagent to complete`
- `Waiting for tool response`
- `Your message is back in the box.`
- `{count} queued messages were not sent — the text is back in the box.`

## Chat drawer — composer

- `1 message waiting — the assistant is giving you a moment to finish before it answers.`
- `1 message waiting — the assistant picks it up on its next turn.`
- `1 message waiting — the assistant picks it up when it comes back to this conversation.`
- `Attach file`
- `Audio recording is not supported in this browser`
- `Auto-sending… keep talking to cancel`
- `Cancel recording`
- `Confirm`
- `Could not start recording: {error}`
- `Could not transcribe the audio: {error}`
- `Drop files to attach`
- `Hands-free on`
- `Hands-free · waiting for reply`
- `Microphone permission denied`
- `PASTED`
- `Pause`
- `Queue this message for the assistant's next turn`
- `Record voice message`
- `Remove pasted text`
- `Resume`
- `Send message`
- `Stop hands-free`
- `Stop`
- `Tap to dictate · hold to start hands-free`
- `The assistant is answering…`
- `The assistant is still answering. Send anyway and your message joins its next turn.`
- `Transcribing…`
- `Type a message...`
- `unknown error`
- `Write while the assistant answers — it will be queued`
- `{count} lines`
- `{count} messages waiting — the assistant is giving you a moment to finish before it answers.`
- `{count} messages waiting — the assistant picks them up on its next turn.`
- `{count} messages waiting — the assistant picks them up when it comes back to this conversation.`

## Chat drawer — messages

- `1 entity`
- `1 fact`
- `1 message`
- `1 message is still in this conversation but no longer sent to the assistant`
- `Audio unavailable`
- `collapse`
- `Compacting context`
- `Completed`
- `Constraints`
- `Context compacted`
- `Decisions`
- `Dictated by voice`
- `Done`
- `expand`
- `Goal`
- `In progress`
- `Key data`
- `Notes`
- `Open questions`
- `PASTED`
- `Pause recording`
- `Pending`
- `Play recording`
- `Playback failed`
- `Preserved exactly`
- `Previous session context`
- `Processing...`
- `Queued`
- `Recalled memories`
- `since {date}`
- `Subagent`
- `Summary`
- `superseded`
- `Superseded by a later compaction, which merged this summary into itself. Kept for the record.`
- `The answer was stopped by the “{name}” guardrail.`
- `This is what the assistant reads in place of the messages above. The messages themselves are still here.`
- `This message was stopped by a guardrail.`
- `Unavailable`
- `Voice message`
- `Your message was stopped by the “{name}” guardrail.`
- `{before} → {after} tokens`
- `{count} entities`
- `{count} facts`
- `{count} lines`
- `{count} messages`
- `{count} messages are still in this conversation but no longer sent to the assistant`
- `{tokens} tokens`

## Chat drawer — usage and limits

- `API client not configured`
- `Cannot poll without client or chatUid`
- `Chat processing failed`
- `Cost`
- `every {window}`
- `Hide usage`
- `No usage limits`
- `per {window}`
- `Resets in 1 day.`
- `Resets in 1 hour.`
- `Resets in 1 minute.`
- `Resets in {count} days.`
- `Resets in {count} hours.`
- `Resets in {count} minutes.`
- `resets in {count}d`
- `resets in {count}h`
- `resets in {count}m`
- `resets now`
- `Show usage`
- `Tier: {tier}`
- `Tokens`
- `Usage`
- `Usage limit reached.`
- `You can try again now.`
- `Your usage`

## Message feedback

- `Add a comment (optional)...`
- `Bad response`
- `Cancel`
- `Close`
- `Copy to clipboard`
- `Good response`
- `Sending...`
- `Submit`
- `What could be improved?`
- `What did you like?`

## Connected apps and MCP servers

- `(optional)`
- `+ Add your own MCP`
- `1 tool available`
- `Add an MCP server`
- `Add this to your OAuth application, exactly as shown.`
- `and come back — then use Refresh.`
- `API key`
- `Apps in this chat`
- `Authentication`
- `Authorised redirect URI`
- `Cancel`
- `Client ID`
- `Client secret`
- `Close`
- `Connect`
- `Connect a server and its tools become available in this chat.`
- `Connect with`
- `Connect your apps`
- `Connect {app}`
- `Connect {server}`
- `Connected`
- `Connected apps`
- `Connected for everyone on this account`
- `connected {date}`
- `Connecting…`
- `Continue`
- `Copied`
- `Copy`
- `Disconnect`
- `Disconnect this account`
- `Disconnect {app}`
- `Explore connected apps`
- `Hide this`
- `Hide this. Your apps stay in the header.`
- `Loading apps…`
- `Manage connected apps`
- `Manage connected servers`
- `MCP servers`
- `Must be reachable over https on a public address.`
- `Name`
- `Needs attention`
- `Needs reconnection`
- `No apps available here yet.`
- `No apps match “{query}”.`
- `No credentials configured`
- `None`
- `Not connected`
- `Only you can see and use the accounts you connect here.`
- `Open the authorisation page`
- `Reconnect`
- `reconnect required`
- `Refresh`
- `Search connected apps`
- `Server URL`
- `Sign in (OAuth)`
- `Sign in with a different account. The one connected now is replaced.`
- `Switch account`
- `Switched off here, a server sits out your next message. It stays connected.`
- `Switched off here, an app sits out your next message. It stays connected.`
- `The server could not be reached.`
- `This server needs its own OAuth application. Register one with it and paste the details below.`
- `This server needs no credentials.`
- `This server was connected for the whole account.`
- `Use my own OAuth application`
- `Use {app} in this chat`
- `Use {server} in this chat`
- `Waiting for sign-in`
- `Waiting…`
- `What you want to call it`
- `Where do I find this?`
- `You can have 1 MCP server connected at a time.`
- `You can have {max} connected at a time.`
- `You can have {max} MCP servers connected at a time.`
- `You'll be sent to the server to finish authorising.`
- `You'll be sent to {app} to finish authorising.`
- `Your browser blocked the pop-up.`
- `Your credentials go straight to the app — only you can use this account.`
- `Your key goes straight to the server — only you can use it.`
- `{app} is not available yet — it still needs to be set up by the app's provider.`
- `{count} tools available`
- `{header} value`
- `{label} (loading)`
- `{label} ({connected}/{total} connected)`
- `{label} — {count} switched off`

## Thread state tag

- `Agent execution paused due to guardrail trigger`
- `Agent is waiting for approval to resume execution`
- `Agent is waiting for approval to resume execution.`
- `Agent is waiting for response`
- `Agent paused, will resume at a scheduled time`
- `Agent paused, will resume at {when} ({in})`
- `Agent's request:`
- `API key not configured.`
- `Approval rejected`
- `Approval was rejected`
- `Approve`
- `Cancel`
- `Complete`
- `Complete as:`
- `Complete Execution Manually`
- `Complete manually`
- `Completed`
- `Completed - Finish thread as successfully completed`
- `Confirm Manual Completion`
- `Continue with feedback`
- `Could not obtain the thread explanation.`
- `Explain thread...`
- `Failed`
- `Failed - Finish thread as failed or with errors`
- `Guardrail Triggered`
- `Handed off`
- `Handed off ({count})`
- `Manually finished thread`
- `Optional feedback for the agent...`
- `Pause`
- `Pause Thread`
- `Paused`
- `Processing`
- `Queued`
- `Reject and finish`
- `Resume`
- `Resume scheduled`
- `Resume Thread`
- `Review`
- `Review Agent Request`
- `Send`
- `Send message to thread`
- `Send message...`
- `Terminated`
- `Terminated - Finish thread as manually terminated`
- `The agent is still running. Your message will be considered on its next turn, right after the current tool response.`
- `This action will immediately terminate all ongoing processes. The execution cannot be resumed after completion.`
- `This will add your message and re-queue the thread so the agent runs again with it.`
- `Thread execution description of "{agent}"`
- `Type a message to continue the thread...`
- `Unknown`
- `Waiting for approval`
- `Waiting for response`
- `You are about to manually complete this agent's execution.`
- `You are about to pause this queued thread. It can be resumed later.`
- `You are about to resume this thread. It will go back to the queue and be processed when possible.`
- `Your feedback:`
- `{count} hours`
- `{count} minutes`

## Command bar

- `API client not configured. Please provide an API key.`
- `Ask AI...`
- `Cannot poll without client or chatUid`
- `Clear`
- `Command History`
- `Commands`
- `No history yet`
- `No response`
- `Processing failed`
- `Processing...`
- `Show command history`
- `to navigate,`
- `to select`
- `Tool calls`

## Generation button

- `API client not configured. Please provide an API key.`
- `Cancel`
- `Cannot poll without client or chatUid`
- `Close`
- `Describe what you want to generate...`
- `Generate with AI`
- `Generate`
- `Generating...`
- `Processing failed`
- `Processing...`
- `Prompt is required`

## Element wrapper

- `API client not configured. Please provide an API key.`
- `assistantId is required for inline behavior`
- `Cannot poll without client, chatUid or assistantId`
- `Cerrar`
- `Cuéntame más sobre: "{text}"`
- `Cuéntame más sobre: {label}`
- `Pensando…`
- `Preguntar a IA`
- `Processing failed`
- `Prompt is empty`

## Assistant memory dialog

Also settable one by one through `CoreMemoryModal`'s `labels` prop (and the
drawer's `coreMemoryLabels` option), which wins over the dictionary.

- `Assistant memory`
- `Close`
- `Loading memory…`
- `Memory is not enabled for this assistant.`
- `Nothing remembered yet. What the assistant learns and is told to keep will appear here.`
- `Pinned: always kept, never changed by the assistant`
- `Edit`
- `Remove`
- `Save`
- `Cancel`
- `Add`
- `+ Add memory`
- `Something the assistant should always remember…`
- `{count}/{max} entries · up to {chars} characters each`
- `persona`
- `instructions`
- `decisions`
- `profile`

## Texts built from a value

A few texts are looked up under a key only known at runtime. They translate
the same way; the keys are just not literals in the source.

- The usage bar's window units — `hour`, `day`, `week`, `month` — and their
  counted forms, `{count} hours`, `{count} days`, `{count} weeks`,
  `{count} months`.
- The usage bar's metric names: `tokens`, `cost`.
- The status an app's provider reports for a connected account, lowercased
  (`active`, `expired`, …), shown when it carries no connection date.

## A note on `AIElementWrapper`

Its defaults have been Spanish since it was added, so its keys are the
Spanish texts — `Preguntar a IA`, `Pensando…`, `Cerrar`,
`Cuéntame más sobre: {label}`. They are listed above under **Element
wrapper** and translate like any other, into English included.
# Live voice

| English key | Variables |
| --- | --- |
| `Voice mode` | — |
| `Talk to the assistant in real time.` | — |
| `Live · {time}` | time (`m:ss` elapsed) |
| `Connecting voice…` | — |
| `Restoring voice…` | — |
| `Closing voice…` | — |
| `Start voice` | — |
| `End voice` | — |
| `Cancel` | — |
| `Mute` | — |
| `Unmute` | — |
| `Enable audio` | — |
| `You` | — |
| `Assistant` | — |
| `Listening…` | — |
| `Voice sessions are recorded according to the assistant settings.` | — |
| `Voice requires microphone access on HTTPS or localhost.` | — |
| `Voice connection interrupted. Please start again.` | — |
| `Could not confirm the previous voice session closed.` | — |
| `Voice session failed.` | — |
| `Voice connection timed out.` | — |
| `Could not prepare the audio connection.` | — |
| `Voice status unavailable. Session stopped.` | — |
# Live prompter

- `Live voice conversation`
- `Your audio level`
- `Assistant audio level`
