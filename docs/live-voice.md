# Live voice (0.61.0)

Live voice reuses `useDevicChat`'s existing authenticated SSE, snapshot reconciliation, tool timeline, client-tool callbacks and interactive widgets. WebRTC is only the audio transport. This is not the existing Whisper dictation / hands-free loop.

```tsx
<DevicProvider getTenantSession={getSessionFromYourBackend}>
  <ChatDrawer
    assistantId="support"
    modelInterfaceTools={tools}
    options={{ liveVoice: { enabled: true } }}
  />
</DevicProvider>
```

The assistant must also have `liveVoice.enabled: true` on the server. No OpenAI key is supplied by the host. Audio consumes the account's included voice minutes, not an additional customer model charge. Normal assistant inference retains its usual usage limits. Voice-quota errors do not disable text input.

Start works without sending text first. The server's chatUid is adopted immediately and `onChatCreated` fires once. SSE remains open between completed voice turns without keeping the chat in a loading state. It also follows client-tool gates and subagent handoffs. Ending voice stops the microphone but does not cancel an already accepted assistant execution.

The default widget follows Active Chat, in the drawer's own clothes. With voice available the composer gains a *Start voice* button next to Send — a waveform, so it does not read as the dictation mic — disabled while the assistant is busy, a widget is pending or a limit is hit. On a new conversation only (no chat yet) an invitation card also sits above the composer: microphone, "Voice mode", the recording policy, Start and a close control; closing it is remembered per assistant in localStorage (`devic-ui:voice-invitation-hidden:<assistantId>`; `showVoiceInvitation(assistantId)` is exported to undo it). Once the conversation exists the card is gone, the composer button stays, and a running call keeps its box whatever the chat. `options.liveVoice.invitation` replaces the card with your own component — it receives `start`, `canStart`, `dismiss`, `recordSessions` and `error` (`LiveVoiceInvitationProps`) — or, as `false`, removes it and leaves only the composer button. Once a call starts it takes the composer's place — the same input area and the same rounded surface as the text box, the usage/limit/queue banners above it — with a fixed-height transcript that slides upward and fades, two full-width audio history waves below it (user grey, assistant accent) and a control row where Send normally sits: the live status with elapsed time, a mute toggle and a red End voice button (Cancel while connecting). No empty composer area remains below it. Input-replacement tools retain their input widget; inline tools stay in the timeline. Dictation cannot hold the microphone at the same time. CSS variables `--devic-voice-user-color` and `--devic-voice-assistant-color` customize the waves, `--devic-voice-end-color` and `--devic-voice-connected-color` the End button and the live dot, `--devic-voice-label-width` the speaker labels (76px) and `--devic-voice-prompter-height` the transcript (84px). Reduced-motion and the standard translations dictionary are supported. `LiveVoicePrompter` is also exported for custom layouts and only analyses existing streams, without acquiring a microphone.

For a custom UI use `useDevicChat({ ..., liveVoice: { enabled: true } }).voice`, also supplied as `CustomPromptBoxProps.voice`. It exposes `start()`, `stop()`, `mute(boolean)`, `play()`, `active`, `state`, `seconds`, `transcript`, media streams and errors. `useDevicLiveVoice` is separately exported for headless transport use; pass a `DevicApiClient`, assistantId, chatUid, enabled flag and context. The standalone hook does not render or observe chat history: use `useDevicChat` when client tools or conversation rendering are needed.

## The voice bubble (0.63.0)

`LiveVoiceBubble` is the call without the chat: a round button that calls one assistant and opens a small call screen beside it. It is meant for a page that has no drawer open — a product page, a help centre, a kiosk — or that keeps the drawer for later.

```tsx
<DevicProvider apiKey="devic-xxx">
  <ChatDrawer assistantId="support" options={{ liveVoice: { enabled: true } }} />
  <LiveVoiceBubble assistantId="support" placement="floating" side="right" theme={{ color: '#4661b1' }} />
</DevicProvider>
```

- **Idle**: the bubble alone, `--devic-primary` with a phone icon. It only renders once the assistant is known to have `liveVoice.enabled`; for one that does not, nothing is rendered.
- **Pressed**: the call starts at once — the press is the microphone gesture — and the panel opens next to the bubble (`panelSide`), 340 px wide: avatar and name, the live status (`Calling…`, `Live · m:ss`, the *Still there?* countdown with *I'm here*), the `LiveVoicePrompter` with the last six turns and both waves, and the controls centred as a phone lays them out: mute, a red hang-up button. Pressing the bubble again tucks the panel away; the call goes on, the bubble pulses green and the elapsed time sits in a chip beside it.
- **Ended** — by hang-up, the server's silence timeout, a hard stop or a failure: the header says `Call ended · m:ss` (or `Call failed`, with the error), the transcript stays readable and the controls become *Open in chat* and *Close*. *Open in chat* loads the conversation in the `ChatDrawer` registered on the provider (`DrawerRegistration.setChatUid`, new in 0.63.0; `openDrawer(chatUid)` and `hasDrawer` on the context) and opens it; `onOpenInChat` replaces that. Either way the bubble forgets the conversation: the next call is a new one. After a failure a green *Call again* button appears too.
- **Placement**: `floating` (fixed, `side` and `offset`) or `inline` (in flow; the panel is absolutely positioned next to it). `size` sets the diameter. A ref exposes `start()`, `stop()`, `expand()`, `collapse()`.
- **What it is not**: it does not observe chat history or run client tools (`modelInterfaceTools`); it uses `useDevicLiveVoice` directly. Two bubbles for the same assistant are two calls. It carries the drawer's CSS variables on its own root, with `theme` applied inline, so it themes without a drawer on the page.

## Silence and a dead microphone

A silent call is billed like a spoken one, so the server ends it once nobody has spoken for the assistant's `liveVoice.idleTimeoutSeconds` (180 s by default; 0 turns it off). The start response carries that value and the library shows a countdown in the call box for the last 30 s (or half the window when it is short) with an *I'm here* button; pressing it, or anyone speaking, restarts the clock here and on the server (`getLiveSessionStatus(…, true)` → `?touch=1`). A call the server ended this way reports `endReason: 'idle'` on `voice`, and the invitation card says so. Independently, the library watches the microphone once connected: an ended track, a system mute or 15 s of exact digital silence while not muted ends the call with *No microphone signal* — a call nobody can speak into should not stay open on the meter. Headless hosts get `stillHere()`, `idleTimeoutSeconds`, `idleEndsAt` and `endReason` on `useDevicChat().voice` / `useDevicLiveVoice()`.

## Lifecycle and context

- Explicit opt-in; no microphone prompt, media allocation or transport import before Start.
- Drawer close, unmount, change of assistant/chat/credentials or client context stops voice. Keep the provider mounted with the same credentials during a token refresh. On logout unmount it or clear its authentication source; a closure that silently changes account is not an observable identity boundary.
- Context is snapshotted per transport: metadata, tags, client schemas, enabled backend tools and disabled integrations. Changing these ends the current voice session; start again to use the new context. No silent replay of earlier user turns or tool actions.
- Reconnect at most three times, only after confirming the old server session closed. An ambiguous creation timeout is not automatically retried. The server remains authoritative for concurrency, quota and duration.
- One observer per mounted chat hook, not a separate voice event/history pipeline. Do not mount two interactive hooks for the same chat: each is an independent client capable of responding to tools.
- Audio playback rejection offers an Enable audio button. HTTPS/localhost and microphone permission are required. Full spoken audio is not guaranteed to be moderated before playback; the normal backend guardrails still govern delegated assistant work.

## Recordings and loading

The default widget does not list recordings (0.61.2); a host that wants them calls `getLiveRecordings` and `getLiveRecordingAudio` (a Blob for a temporary object URL) itself. The server's recording policy is shown before starting. Neither audio nor transcript is persisted in browser storage. No voice samples, OpenAI SDK or 900 KB MP3 bundle is added to the package.

`DevicApiClient` exports `createLiveSession`, `getLiveSessionStatus`, `closeLiveSession`, `getLiveRecordings`, `getLiveRecordingAudio` and `getLiveVoiceUsage`. Recording lists are arrays with offset/limit pagination. Chat usage is not a monthly account balance; do not infer monthly remaining minutes from it or bill the user using internal audio costs.

## Required server changes

Requires SuntropyAI Live Voice production plus the client-context change (SuntropyAI PR #467: the start endpoint accepts tools/metadata/tags and filters) and, for public gateway consumers, api-gateway PRs #16 and #17 (private audio and tenant-session routes). All three were merged on 2026-09-12. For an assistant whose configuration says voice is off, the card is not rendered at all (0.61.1); while the assistant is still unknown, Start stays disabled. Do not enable the widget against an older server expecting client tools to be retained.

Published as 0.61.0; the bubble in 0.63.0.
