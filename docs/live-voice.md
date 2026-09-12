# Live voice (unreleased)

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

The default widget follows Active Chat, in the drawer's own clothes. Idle, it is a card just above the composer: microphone, "Voice mode", an *included minutes* tag, the recording policy and Start. Once a call starts it takes the composer's place — the same input area and the same rounded surface as the text box, the usage/limit/queue banners above it — with a fixed-height transcript that slides upward and fades, two full-width audio history waves below it (user grey, assistant accent) and a control row where Send normally sits: the live status with elapsed time, a mute toggle and a red End voice button (Cancel while connecting). No empty composer area remains below it. Input-replacement tools retain their input widget; inline tools stay in the timeline. Dictation cannot hold the microphone at the same time. CSS variables `--devic-voice-user-color` and `--devic-voice-assistant-color` customize the waves, `--devic-voice-end-color` and `--devic-voice-connected-color` the End button and the live dot, `--devic-voice-label-width` the speaker labels (76px) and `--devic-voice-prompter-height` the transcript (84px). Reduced-motion and the standard translations dictionary are supported. `LiveVoicePrompter` is also exported for custom layouts and only analyses existing streams, without acquiring a microphone.

For a custom UI use `useDevicChat({ ..., liveVoice: { enabled: true } }).voice`, also supplied as `CustomPromptBoxProps.voice`. It exposes `start()`, `stop()`, `mute(boolean)`, `play()`, `active`, `state`, `seconds`, `transcript`, media streams and errors. `useDevicLiveVoice` is separately exported for headless transport use; pass a `DevicApiClient`, assistantId, chatUid, enabled flag and context. The standalone hook does not render or observe chat history: use `useDevicChat` when client tools or conversation rendering are needed.

## Lifecycle and context

- Explicit opt-in; no microphone prompt, media allocation or transport import before Start.
- Drawer close, unmount, change of assistant/chat/credentials or client context stops voice. Keep the provider mounted with the same credentials during a token refresh. On logout unmount it or clear its authentication source; a closure that silently changes account is not an observable identity boundary.
- Context is snapshotted per transport: metadata, tags, client schemas, enabled backend tools and disabled integrations. Changing these ends the current voice session; start again to use the new context. No silent replay of earlier user turns or tool actions.
- Reconnect at most three times, only after confirming the old server session closed. An ambiguous creation timeout is not automatically retried. The server remains authoritative for concurrency, quota and duration.
- One observer per mounted chat hook, not a separate voice event/history pipeline. Do not mount two interactive hooks for the same chat: each is an independent client capable of responding to tools.
- Audio playback rejection offers an Enable audio button. HTTPS/localhost and microphone permission are required. Full spoken audio is not guaranteed to be moderated before playback; the normal backend guardrails still govern delegated assistant work.

## Recordings and loading

Voice recordings are fetched only when requested, and audio only on Play. Downloads use authenticated fetch and temporary blob URLs, revoked on replacement/navigation/unmount. The server's recording policy is shown before starting. Neither audio nor transcript is persisted in browser storage. No voice samples, OpenAI SDK or 900 KB MP3 bundle is added to the package.

`DevicApiClient` exports `createLiveSession`, `getLiveSessionStatus`, `closeLiveSession`, `getLiveRecordings`, `getLiveRecordingAudio` and `getLiveVoiceUsage`. Recording lists are arrays with offset/limit pagination. Chat usage is not a monthly account balance; do not infer monthly remaining minutes from it or bill the user using internal audio costs.

## Required server changes

Requires SuntropyAI Live Voice production plus `feat/live-voice-client-context` (the start endpoint accepts tools/metadata/tags and filters). Public gateway consumers additionally require api-gateway PRs #16 and #17 for private audio and tenant-session routes. Older assistants without the capability keep the Start button disabled. Do not enable the widget against an older server expecting client tools to be retained.

No version bump or npm publication is part of this implementation. Build/test locally and review the backend and library PRs together before release.
