# @devicai/ui

React component library for integrating Devic AI assistants into your application.

## Features

- **ChatDrawer** - A ready-to-use chat drawer component
- **AICommandBar** - A spotlight-style command bar for quick AI interactions
- **AIGenerationButton** - A button for triggering AI generation with modal, tooltip, or direct modes
- **useDevicChat** - Hook for building custom chat UIs
- **Model Interface Protocol** - Support for client-side tool execution
- **Message Feedback** - Built-in thumbs up/down feedback with comments
- **CSS Variables** - Easy theming with CSS custom properties
- **TypeScript** - Full type definitions included
- **React 17+** - Compatible with React 17 and above
- **Minimal Dependencies** - Only React as a peer dependency

## Installation

```bash
npm install @devicai/ui
# or
yarn add @devicai/ui
# or
pnpm add @devicai/ui
```

## Quick Start

### Using ChatDrawer (Simplest)

```tsx
import { DevicProvider, ChatDrawer } from '@devicai/ui';
import '@devicai/ui/dist/esm/styles.css';

function App() {
  return (
    <DevicProvider apiKey="your-api-key">
      <ChatDrawer
        assistantId="my-assistant"
        options={{
          position: 'right',
          welcomeMessage: 'Hello! How can I help you?',
          suggestedMessages: ['Help me with...', 'Tell me about...'],
        }}
      />
    </DevicProvider>
  );
}
```

### Using the Hook (Custom UI)

```tsx
import { DevicProvider, useDevicChat } from '@devicai/ui';

function CustomChat() {
  const { messages, isLoading, sendMessage } = useDevicChat({
    assistantId: 'my-assistant',
  });

  return (
    <div>
      {messages.map((msg) => (
        <div key={msg.uid}>
          <strong>{msg.role}:</strong> {msg.content.message}
        </div>
      ))}
      {isLoading && <div>Thinking...</div>}
      <button onClick={() => sendMessage('Hello!')}>Send</button>
    </div>
  );
}

function App() {
  return (
    <DevicProvider apiKey="your-api-key">
      <CustomChat />
    </DevicProvider>
  );
}
```

## Components

### DevicProvider

Context provider for global configuration.

```tsx
<DevicProvider
  apiKey="devic-xxx"           // Required, unless you use getTenantSession
  baseUrl="https://api.devic.ai"
  tenantId="tenant-123"        // Optional global tenant
  tenantMetadata={{ ... }}     // Optional global metadata
>
  <App />
</DevicProvider>
```

#### Tenant sessions — proving who the end user is

With an API key alone, the tenant is whatever the page says it is. The key sits
in your bundle where anyone can read it, so anyone can say they are any of your
customers, and read that customer's conversations.

`getTenantSession` replaces that claim with a fact. Your backend — the only
place that knows who is logged in — mints the session, and the widget renews it
on its own before it expires:

```tsx
<DevicProvider
  getTenantSession={async () => {
    const r = await fetch('/api/devic-session', { credentials: 'include' });
    return r.json();                   // { token, expiresAt }
  }}
  onSessionExpired={() => location.reload()}
>
  <App />
</DevicProvider>
```

On your server, with a **server-side** API key (not the one in your bundle):

```ts
app.post('/api/devic-session', requireLogin, async (req, res) => {
  const r = await fetch('https://api.devic.ai/api/v1/tenant-sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.DEVIC_API_KEY}`,
      'Content-Type': 'application/json',
    },
    // From YOUR session, never from the request body.
    body: JSON.stringify({
      tenantId: req.user.organisationId,
      subtenantId: req.user.id,
      ttlSeconds: 3600,                // default; up to 12 h
    }),
  });
  res.json(await r.json());
});
```

A session is confined to what an end user does — chatting, their own
conversations, attachments, their own limits, their own connected apps — and
dies with the API key that minted it. It cannot create assistants, read your
costs or reach another tenant, whatever the page asks for.

**Without a renewal endpoint.** You do not have to expose one. Mint the session
inside your own login, give it `ttlSeconds` matching your session, and hand it
to the page:

```tsx
<DevicProvider
  getTenantSession={async () => readCookie('devic_session')}
  onSessionExpired={() => location.assign('/login')}
>
```

Simpler, and the trade is only the window if a token is stolen — the same one
your own session cookie already accepts. What matters is untouched: a stolen
session still cannot act as another tenant or reach beyond an end user. The
cookie has to be readable by JavaScript, so it is exposed to XSS; injecting the
token into the page at render time carries the same risk without sending it on
every request to your own domain.

Do set `onSessionExpired` in this mode. There is nothing to renew from, so
without it the widget just stops answering — at the exact moment the user's own
login has expired too.

You can also require sessions: an assistant with `identityMode: 'signed'`
refuses unsigned callers outright for connected apps.

### ChatDrawer

A complete chat drawer component.

```tsx
<ChatDrawer
  assistantId="my-assistant"
  chatUid="optional-existing-chat"
  options={{
    position: 'right',           // 'left' | 'right'
    width: 400,
    defaultOpen: false,
    color: '#1890ff',            // Primary color
    welcomeMessage: 'Hello!',
    suggestedMessages: ['Help me...'],
    enableFileUploads: true,
    allowedFileTypes: { images: true, documents: true },
    inputPlaceholder: 'Type a message...',
    title: 'Chat Assistant',
    showToolTimeline: true,
  }}
  enabledTools={['tool1', 'tool2']}
  modelInterfaceTools={[
    {
      toolName: 'get_user_location',
      schema: {
        type: 'function',
        function: {
          name: 'get_user_location',
          description: 'Get user current location',
          parameters: { type: 'object', properties: {} }
        }
      },
      callback: async () => {
        const pos = await getCurrentPosition();
        return { lat: pos.coords.latitude, lng: pos.coords.longitude };
      }
    }
  ]}
  tenantId="specific-tenant"     // Override provider
  tenantMetadata={{ userId: '123' }}
  apiKey="override-key"          // Override provider

  // Callbacks
  onMessageSent={(message) => {}}
  onMessageReceived={(message) => {}}
  onToolCall={(toolName, params) => {}}
  onError={(error) => {}}
  onChatCreated={(chatUid) => {}}
  onOpen={() => {}}
  onClose={() => {}}

  // Controlled mode
  isOpen={true}
/>
```

#### Long-term memory

For assistants with memory enabled, the drawer shows a collapsible
**"Recalled memories"** strip next to the message that brought long-term
memories into the conversation — including while the assistant is still
processing its first response (streamed in through the realtime poll).

```tsx
<ChatDrawer
  assistantId="my-assistant"
  options={{
    showRecalledMemories: true,          // default
    // Replace the built-in strip with your own node:
    recalledMemoriesRenderer: ({ records, isLoading }) => (
      <MyMemoryChip facts={records.flatMap((r) => r.facts ?? [])} />
    ),
    // Brain button in the header opening the CoreMemoryModal:
    showCoreMemoryButton: true,
  }}
/>
```

The recall records are also available from the hook:
`useDevicChat().recalledMemories`.

### CoreMemoryModal

Modal showing — and letting the end user edit — the **core memory** of an
assistant for a tenant/subtenant combination: the standing entries (persona,
instructions, decisions, profile) the assistant always keeps in context
there. Use it standalone (any trigger you like) or via the drawer's
`showCoreMemoryButton` option.

```tsx
const [open, setOpen] = useState(false);

<CoreMemoryModal
  isOpen={open}
  onClose={() => setOpen(false)}
  assistantId="my-assistant"
  tenantId="acme-corp"        // falls back to the provider's
  subtenantId="user-123"      // falls back to the provider's
  editable={true}             // false for a read-only view
/>
```

Backed by the public memory API (`GET/POST/PATCH/DELETE
/api/v1/memory/assistants/:identifier/core`); the API key must allow
`/api/v1/memory/*` (included in the devic-ui key preset).

### IntegrationsModal

Modal where the **end user** connects their **own** third-party accounts —
the apps you enabled for tenants of the assistant, each with the accounts
*that* tenant has connected. Never the workspace-wide accounts you connected
as an admin, and never another tenant's.

In the drawer it is opened from a stack of the apps' own logos in the header,
which **appears on its own** when the assistant offers apps to its tenants and
stays out of the way — no button, no request — when it does not:

```tsx
<ChatDrawer
  assistantId="my-assistant"
  tenantId="acme-corp"
  subtenantId="user-123"
  options={{
    // showIntegrationsButton defaults to true and only shows the control when
    // there is something behind it. Set it to false to keep it out entirely.
    showIntegrationsButton: false,
    integrationsLabel: 'Connected apps',
    maxIntegrationLogos: 6,   // rest are counted in a +N box; fewer if the
                              // header is narrow
  }}
/>
```

Connected apps come first in the stack and unconnected ones are dimmed, so it
doubles as the status.

Because a row of small logos is discoverable only once you know what it is, a
strip above the composer says it in words — with the same logos, and a close
button. Closing it animates towards the header, so what was dismissed is
understood to still be there, and the dismissal is remembered per assistant and
tenant/subtenant: the same end user is never told twice, the next one still is.

```tsx
options={{
  showIntegrationsHint: true,          // default
  integrationsHintLabel: 'Connect your apps',
  // Unset, it reads "Connect your apps" and becomes "Explore connected apps"
  // once the end user has connected one.
}}
```

Or standalone, with your own trigger:

```tsx
<IntegrationsModal
  isOpen={open}
  onClose={() => setOpen(false)}
  assistantId="my-assistant"
  tenantId="acme-corp"        // falls back to the provider's
  subtenantId="user-123"      // falls back to the provider's
  onChange={(apps) => console.log(apps.filter((a) => a.connected))}
/>
```

Requires the assistant (or its environment) to enable tenant integrations and
list the apps on offer — nothing outside that list is connectable — and the
API key to allow `/api/v1/tenant-integrations/*` (included in the devic-ui key
preset).

The apps are shown as a searchable grid of cards; connecting opens the
provider's consent screen in a pop-up and refreshes as soon as it closes. If the
browser blocks the pop-up, the authorisation URL is offered as a link instead.

**One account per app.** A tenant that connects an app again is switching
account, not adding one: the previous account is retired server-side. Two
accounts for the same app would be indistinguishable — the run has to pick one,
and the end user cannot see which.

To put the same stack somewhere else, or to know whether an assistant offers
anything at all before rendering your own control, use the pieces directly. The
listing is loaded once and shared, so the launcher and the modal never ask for
it twice:

```tsx
const apps = useIntegrations({ assistantId, tenantId, enabled: true });

{apps.offered && <MyButton count={apps.integrations.length} />}
<IntegrationsLauncher state={apps} onClick={open} dark />
<IntegrationsModal isOpen={isOpen} onClose={close} state={apps} {...scope} />
```

Opened from the drawer it inherits the drawer's colours and font. Standalone,
pass them yourself with `theme` (same names as the drawer's style options) —
both dialogs render through a portal, so nothing cascades into them on its own:

```tsx
<IntegrationsModal
  ...
  theme={{ backgroundColor: '#1a1a1a', textColor: '#e6e6e6', color: '#e8833a',
           secondaryBackgroundColor: '#0f0f0f', borderColor: '#333' }}
/>
```

### AICommandBar

A floating command bar (similar to Spotlight/Command Palette) for quick AI interactions.

```tsx
import { AICommandBar } from '@devicai/ui';

<AICommandBar
  assistantId="my-assistant"
  options={{
    shortcut: 'cmd+k',           // Keyboard shortcut to open
    placeholder: 'Ask AI...',
    position: 'fixed',           // 'inline' | 'fixed'
    fixedPlacement: { bottom: 20, right: 20 },
    showResultCard: true,        // Show response in a card
    showShortcutHint: true,      // Show shortcut badge

    // Commands (slash commands)
    commands: [
      {
        keyword: 'summarize',
        description: 'Summarize content',
        message: 'Please summarize this page.',
        icon: <SummarizeIcon />,
      },
    ],

    // History
    enableHistory: true,
    maxHistoryItems: 50,

    // Theming
    backgroundColor: '#ffffff',
    textColor: '#1f2937',
    borderColor: '#e5e7eb',
    borderRadius: 12,
  }}

  // Callbacks
  onResponse={({ message, toolCalls, chatUid }) => {}}
  onSubmit={(message) => {}}
  onToolCall={(toolName, params) => {}}
  onError={(error) => {}}
  onOpen={() => {}}
  onClose={() => {}}

  // Integration with ChatDrawer
  onExecute="openDrawer"         // 'callback' | 'openDrawer'
  chatDrawerRef={drawerRef}      // Required when onExecute="openDrawer"

  // Controlled mode
  isVisible={true}
  onVisibilityChange={(visible) => {}}
/>
```

#### AICommandBar with ChatDrawer Integration

```tsx
import { useRef } from 'react';
import { AICommandBar, ChatDrawer, ChatDrawerHandle } from '@devicai/ui';

function App() {
  const drawerRef = useRef<ChatDrawerHandle>(null);

  return (
    <>
      <AICommandBar
        assistantId="my-assistant"
        onExecute="openDrawer"
        chatDrawerRef={drawerRef}
        options={{
          shortcut: 'cmd+k',
          showResultCard: false,
        }}
      />
      <ChatDrawer ref={drawerRef} assistantId="my-assistant" />
    </>
  );
}
```

#### AICommandBar Handle (ref methods)

```tsx
const commandBarRef = useRef<AICommandBarHandle>(null);

// Methods available via ref
commandBarRef.current?.open();
commandBarRef.current?.close();
commandBarRef.current?.toggle();
commandBarRef.current?.focus();
commandBarRef.current?.submit('Hello!');
commandBarRef.current?.reset();
```

### AIGenerationButton

A button component for triggering AI generation with three interaction modes: direct, modal, or tooltip.

```tsx
import { AIGenerationButton } from '@devicai/ui';

// Modal mode (default) - opens a modal for user input
<AIGenerationButton
  assistantId="my-assistant"
  options={{
    mode: 'modal',
    modalTitle: 'Generate with AI',
    modalDescription: 'Describe what you want to generate.',
    placeholder: 'E.g., Create a product description...',
    confirmText: 'Generate',
    cancelText: 'Cancel',
  }}
  onResponse={({ message, toolCalls }) => {
    console.log('Generated:', message.content.message);
  }}
/>

// Direct mode - sends predefined prompt immediately
<AIGenerationButton
  assistantId="my-assistant"
  options={{
    mode: 'direct',
    prompt: 'Generate a summary of this content',
    label: 'Summarize',
    loadingLabel: 'Summarizing...',
  }}
  onResponse={({ message }) => setSummary(message.content.message)}
/>

// Tooltip mode - shows inline input
<AIGenerationButton
  assistantId="my-assistant"
  options={{
    mode: 'tooltip',
    tooltipPlacement: 'bottom',  // 'top' | 'bottom' | 'left' | 'right'
    tooltipWidth: 350,
  }}
  onResponse={handleGeneration}
/>
```

#### AIGenerationButton Options

```tsx
<AIGenerationButton
  assistantId="my-assistant"
  options={{
    // Mode
    mode: 'modal',               // 'direct' | 'modal' | 'tooltip'
    prompt: 'Predefined prompt', // Required for direct mode

    // Labels
    label: 'Generate with AI',
    loadingLabel: 'Generating...',
    placeholder: 'Describe what you want...',
    modalTitle: 'Generate with AI',
    modalDescription: 'Optional description',
    confirmText: 'Generate',
    cancelText: 'Cancel',

    // Button styling
    variant: 'primary',          // 'primary' | 'secondary' | 'outline' | 'ghost'
    size: 'medium',              // 'small' | 'medium' | 'large'
    icon: <CustomIcon />,        // Custom icon
    hideIcon: false,
    hideLabel: false,            // Icon-only button

    // Tooltip options
    tooltipPlacement: 'top',
    tooltipWidth: 300,

    // Tool call display
    toolRenderers: {
      search_docs: (input, output) => (
        <div>Found {output.count} results</div>
      ),
    },
    toolIcons: {
      search_docs: <SearchIcon />,
    },
    processingMessage: 'Processing...',

    // Theming
    color: '#3b82f6',
    backgroundColor: '#ffffff',
    textColor: '#1f2937',
    borderColor: '#e5e7eb',
    borderRadius: 8,
    zIndex: 10000,
  }}

  // Callbacks
  onResponse={({ message, toolCalls, chatUid }) => {}}
  onBeforeSend={(prompt) => modifiedPrompt}  // Modify prompt before sending
  onError={(error) => {}}
  onStart={() => {}}
  onOpen={() => {}}
  onClose={() => {}}

  // Other props
  modelInterfaceTools={[...]}
  tenantId="tenant-123"
  tenantMetadata={{ userId: '456' }}
  disabled={false}
/>
```

#### AIGenerationButton Handle (ref methods)

```tsx
const buttonRef = useRef<AIGenerationButtonHandle>(null);

// Trigger generation programmatically
const result = await buttonRef.current?.generate('Custom prompt');

// Open/close modal or tooltip
buttonRef.current?.open();
buttonRef.current?.close();
buttonRef.current?.reset();

// Check processing state
if (buttonRef.current?.isProcessing) { ... }
```

## Hooks

### useDevicChat

Main hook for chat functionality.

```tsx
const {
  messages,      // ChatMessage[]
  chatUid,       // string | null
  isLoading,     // boolean
  status,        // 'idle' | 'processing' | 'completed' | 'error'
  error,         // Error | null
  sendMessage,   // (message: string, options?: { files?: ChatFile[] }) => Promise<void>
  clearChat,     // () => void
  loadChat,      // (chatUid: string) => Promise<void>
} = useDevicChat({
  assistantId: 'my-assistant',
  chatUid: 'optional-existing-chat',
  apiKey: 'override-key',
  baseUrl: 'https://api.devic.ai',
  tenantId: 'tenant-123',
  tenantMetadata: { userId: '456' },
  enabledTools: ['tool1', 'tool2'],
  modelInterfaceTools: [...],
  pollingInterval: 1000,
  onMessageSent: (message) => {},
  onMessageReceived: (message) => {},
  onToolCall: (toolName, params) => {},
  onError: (error) => {},
  onChatCreated: (chatUid) => {},
});
```

### useAICommandBar

Hook for building custom command bar UIs.

```tsx
import { useAICommandBar } from '@devicai/ui';

const {
  isVisible,           // boolean
  open,                // () => void
  close,               // () => void
  toggle,              // () => void
  inputValue,          // string
  setInputValue,       // (value: string) => void
  inputRef,            // RefObject<HTMLInputElement>
  focus,               // () => void
  isProcessing,        // boolean
  currentToolSummary,  // string | null
  toolCalls,           // ToolCallSummary[]
  result,              // CommandBarResult | null
  error,               // Error | null
  history,             // string[]
  showingHistory,      // boolean
  showingCommands,     // boolean
  filteredCommands,    // AICommandBarCommand[]
  submit,              // (message?: string) => Promise<void>
  reset,               // () => void
  handleKeyDown,       // (e: KeyboardEvent) => void
} = useAICommandBar({
  assistantId: 'my-assistant',
  options: { shortcut: 'cmd+k' },
  onResponse: (result) => {},
  onError: (error) => {},
});
```

### useAIGenerationButton

Hook for building custom generation button UIs.

```tsx
import { useAIGenerationButton } from '@devicai/ui';

const {
  isOpen,              // boolean - modal/tooltip open state
  isProcessing,        // boolean
  inputValue,          // string
  setInputValue,       // (value: string) => void
  error,               // Error | null
  result,              // GenerationResult | null
  toolCalls,           // ToolCallSummary[]
  currentToolSummary,  // string | null
  inputRef,            // RefObject<HTMLTextAreaElement>
  open,                // () => void
  close,               // () => void
  generate,            // (prompt?: string) => Promise<GenerationResult | null>
  reset,               // () => void
  handleKeyDown,       // (e: KeyboardEvent) => void
} = useAIGenerationButton({
  assistantId: 'my-assistant',
  options: { mode: 'modal' },
  onResponse: (result) => {},
  onBeforeSend: (prompt) => prompt,
  onError: (error) => {},
  onStart: () => {},
});
```

### useModelInterface

Hook for implementing the Model Interface Protocol.

```tsx
const {
  toolSchemas,           // Tool schemas to send to API
  isClientTool,          // (name: string) => boolean
  handleToolCalls,       // (toolCalls: ToolCall[]) => Promise<ToolCallResponse[]>
  extractPendingToolCalls, // (messages: ChatMessage[]) => ToolCall[]
} = useModelInterface({
  tools: [
    {
      toolName: 'get_user_location',
      schema: {
        type: 'function',
        function: {
          name: 'get_user_location',
          description: 'Get user location',
          parameters: { type: 'object', properties: {} }
        }
      },
      callback: async () => ({ lat: 40.7, lng: -74.0 })
    }
  ],
  onToolExecute: (toolName, params) => {},
  onToolComplete: (toolName, result) => {},
  onToolError: (toolName, error) => {},
});
```

### usePolling

Hook for polling real-time chat history.

```tsx
const {
  data,       // RealtimeChatHistory | null
  isPolling,  // boolean
  error,      // Error | null
  start,      // () => void
  stop,       // () => void
  refetch,    // () => Promise<void>
} = usePolling(
  chatUid,
  async () => client.getRealtimeHistory(assistantId, chatUid),
  {
    interval: 1000,
    enabled: true,
    stopStatuses: ['completed', 'error'],
    onUpdate: (data) => {},
    onStop: (data) => {},
    onError: (error) => {},
  }
);
```

## API Client

Use the API client directly for advanced use cases.

```tsx
import { DevicApiClient } from '@devicai/ui';

const client = new DevicApiClient({
  apiKey: 'your-api-key',
  baseUrl: 'https://api.devic.ai',
});

// Get assistants
const assistants = await client.getAssistants();

// Send message (async mode)
const { chatUid } = await client.sendMessageAsync('my-assistant', {
  message: 'Hello!',
  tenantId: 'tenant-123',
});

// Poll for results
const result = await client.getRealtimeHistory('my-assistant', chatUid);

// Send tool responses
await client.sendToolResponses('my-assistant', chatUid, [
  { tool_call_id: 'call_123', content: { result: 'data' }, role: 'tool' }
]);
```

## Theming

Customize appearance with CSS variables:

```css
.devic-chat-drawer {
  --devic-primary: #1890ff;
  --devic-primary-hover: #40a9ff;
  --devic-primary-light: #e6f7ff;
  --devic-bg: #ffffff;
  --devic-bg-secondary: #f5f5f5;
  --devic-text: #333333;
  --devic-text-secondary: #666666;
  --devic-text-muted: #999999;
  --devic-border: #e8e8e8;
  --devic-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  --devic-radius: 8px;
  --devic-radius-sm: 4px;
  --devic-radius-lg: 16px;
}
```

Or use the `color` option in ChatDrawer:

```tsx
<ChatDrawer
  options={{ color: '#ff4081' }}
/>
```

## Model Interface Protocol

The Model Interface Protocol allows you to define client-side tools that the assistant can call during a conversation.

```tsx
const locationTool: ModelInterfaceTool = {
  toolName: 'get_user_location',
  schema: {
    type: 'function',
    function: {
      name: 'get_user_location',
      description: 'Get the user current geographic location',
      parameters: {
        type: 'object',
        properties: {},
      }
    }
  },
  callback: async () => {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }),
        (err) => reject(err)
      );
    });
  }
};

<ChatDrawer
  assistantId="my-assistant"
  modelInterfaceTools={[locationTool]}
/>
```

## TypeScript

All types are exported:

```tsx
import type {
  // Chat types
  ChatMessage,
  ChatFile,
  ChatDrawerOptions,
  ChatDrawerHandle,

  // AICommandBar types
  AICommandBarOptions,
  AICommandBarHandle,
  AICommandBarCommand,
  CommandBarResult,
  ToolCallSummary,

  // AIGenerationButton types
  AIGenerationButtonOptions,
  AIGenerationButtonHandle,
  AIGenerationButtonMode,
  GenerationResult,

  // Tool types
  ModelInterfaceTool,
  ModelInterfaceToolSchema,
  ToolCall,
  ToolCallResponse,

  // API types
  RealtimeChatHistory,

  // Hook types
  UseDevicChatOptions,
} from '@devicai/ui';
```

## License

MIT
