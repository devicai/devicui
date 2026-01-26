# @devic/ui

React component library for integrating Devic AI assistants into your application.

## Features

- **ChatDrawer** - A ready-to-use chat drawer component
- **useDevicChat** - Hook for building custom chat UIs
- **Model Interface Protocol** - Support for client-side tool execution
- **CSS Variables** - Easy theming with CSS custom properties
- **TypeScript** - Full type definitions included
- **React 17+** - Compatible with React 17 and above
- **Minimal Dependencies** - Only React as a peer dependency

## Installation

```bash
npm install @devic/ui
# or
yarn add @devic/ui
# or
pnpm add @devic/ui
```

## Quick Start

### Using ChatDrawer (Simplest)

```tsx
import { DevicProvider, ChatDrawer } from '@devic/ui';
import '@devic/ui/dist/esm/styles.css';

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
import { DevicProvider, useDevicChat } from '@devic/ui';

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
  apiKey="devic-xxx"           // Required
  baseUrl="https://api.devic.ai"
  tenantId="tenant-123"        // Optional global tenant
  tenantMetadata={{ ... }}     // Optional global metadata
>
  <App />
</DevicProvider>
```

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
import { DevicApiClient } from '@devic/ui';

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
  ChatMessage,
  ChatFile,
  ModelInterfaceTool,
  ModelInterfaceToolSchema,
  ToolCall,
  ToolCallResponse,
  RealtimeChatHistory,
  ChatDrawerOptions,
  UseDevicChatOptions,
} from '@devic/ui';
```

## License

MIT
