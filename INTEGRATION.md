# Devic UI Integration Guide

This guide explains how to integrate the `@devicai/ui` library into your React application to add AI assistant chat capabilities.

## Prerequisites

- Node.js 20+
- React 17+ application
- Devic API key (obtain from Devic dashboard)

## Installation

```bash
npm install @devicai/ui
# or
yarn add @devicai/ui
# or
pnpm add @devicai/ui
```

## Basic Integration

### Step 1: Import Styles

Add the CSS import to your application entry point:

```tsx
// App.tsx or index.tsx
import '@devicai/ui/styles.css';
```

### Step 2: Wrap Your App with DevicProvider

```tsx
import { DevicProvider } from '@devicai/ui';

function App() {
  return (
    <DevicProvider
      apiKey="your-devic-api-key"
      baseUrl="https://api.devic.ai"  // Optional, defaults to this
    >
      <YourApp />
    </DevicProvider>
  );
}
```

### Step 3: Add ChatDrawer Component

```tsx
import { ChatDrawer } from '@devicai/ui';

function YourApp() {
  return (
    <div>
      {/* Your app content */}

      <ChatDrawer
        assistantId="your-assistant-identifier"
        options={{
          position: 'right',
          welcomeMessage: 'Hello! How can I help you today?',
          suggestedMessages: [
            'Help me get started',
            'What can you do?',
          ],
        }}
      />
    </div>
  );
}
```

## AICommandBar Component

The AICommandBar is a floating command bar (similar to Spotlight or Command Palette) for quick AI interactions. It provides a minimal input that expands to show results without the full drawer experience.

### Basic Usage

```tsx
import { AICommandBar } from '@devicai/ui';

function App() {
  return (
    <AICommandBar
      assistantId="your-assistant-identifier"
      options={{
        placeholder: 'Ask AI...',
      }}
      onResponse={({ message, toolCalls }) => {
        console.log('Response:', message.content?.message);
        console.log('Tools used:', toolCalls.length);
      }}
    />
  );
}
```

### Fixed Position with Keyboard Shortcut

Create a Spotlight-like experience:

```tsx
<AICommandBar
  assistantId="support-assistant"
  options={{
    position: 'fixed',
    fixedPlacement: { bottom: 20, right: 20 },
    shortcut: 'cmd+j',  // Toggle with Cmd+J (Mac) or Ctrl+J (Windows)
    showShortcutHint: true,
    placeholder: 'Ask anything...',
    width: 500,
    borderRadius: 12,
    boxShadow: '0 8px 30px rgba(0, 0, 0, 0.15)',
  }}
/>
```

### Integration with ChatDrawer

Open the ChatDrawer to continue the conversation after the command bar completes:

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
          placeholder: 'Quick question...',
        }}
      />

      <ChatDrawer
        ref={drawerRef}
        assistantId="my-assistant"
        options={{
          position: 'right',
          width: 400,
        }}
      />
    </>
  );
}
```

### Programmatic Control

Control the command bar via ref:

```tsx
import { useRef } from 'react';
import { AICommandBar, AICommandBarHandle } from '@devicai/ui';

function App() {
  const commandBarRef = useRef<AICommandBarHandle>(null);

  return (
    <>
      <button onClick={() => commandBarRef.current?.open()}>
        Open Command Bar
      </button>

      <button onClick={() => commandBarRef.current?.submit('What is the weather?')}>
        Ask About Weather
      </button>

      <AICommandBar
        ref={commandBarRef}
        assistantId="my-assistant"
        options={{
          position: 'fixed',
          fixedPlacement: { top: 100, left: '50%' },
        }}
        onResponse={({ message }) => {
          console.log('Got response:', message.content?.message);
        }}
      />
    </>
  );
}
```

### Theming

Customize the appearance:

```tsx
<AICommandBar
  assistantId="my-assistant"
  options={{
    // Colors
    color: '#6366f1',           // Primary/accent color
    backgroundColor: '#fffbeb', // Bar background
    textColor: '#92400e',       // Text color
    borderColor: '#fcd34d',     // Border color

    // Typography
    fontFamily: 'Inter, sans-serif',
    fontSize: 14,

    // Layout
    width: 450,
    maxWidth: '90vw',
    borderRadius: 16,
    padding: '14px 18px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',

    // Result card
    showResultCard: true,
    resultCardMaxHeight: 400,

    // Animation
    animationDuration: 200,
  }}
/>
```

### Hiding Result Card

For custom result handling, disable the built-in result card:

```tsx
<AICommandBar
  assistantId="my-assistant"
  options={{
    showResultCard: false,  // Don't show built-in result UI
  }}
  onResponse={({ chatUid, message, toolCalls }) => {
    // Handle result in your own UI
    setMyCustomResult({
      text: message.content?.message,
      tools: toolCalls,
    });
  }}
/>
```

### With Model Interface Tools

Use client-side tools with the command bar:

```tsx
<AICommandBar
  assistantId="my-assistant"
  modelInterfaceTools={[
    {
      toolName: 'get_current_time',
      schema: {
        type: 'function',
        function: {
          name: 'get_current_time',
          description: 'Get the current time',
          parameters: { type: 'object', properties: {} },
        },
      },
      callback: async () => new Date().toLocaleTimeString(),
    },
  ]}
  onToolCall={(toolName, params) => {
    console.log(`Tool executed: ${toolName}`);
  }}
/>
```

### Command History

The command bar automatically stores your prompt history in localStorage. Use arrow keys to navigate:

- **Arrow Up**: Navigate to previous commands
- **Arrow Down**: Navigate to more recent commands
- **Escape**: Exit history navigation

History is enabled by default (opt-out). To disable:

```tsx
<AICommandBar
  assistantId="my-assistant"
  options={{
    enableHistory: false,  // Disable history
  }}
/>
```

Configure history behavior:

```tsx
<AICommandBar
  assistantId="my-assistant"
  options={{
    enableHistory: true,            // default: true
    maxHistoryItems: 100,           // default: 50
    historyStorageKey: 'my-app-ai-history',  // default: 'devic-command-bar-history'
  }}
/>
```

### Commands System

Define predefined commands that users can trigger with `/keyword`:

```tsx
<AICommandBar
  assistantId="my-assistant"
  options={{
    commands: [
      {
        keyword: 'help',
        description: 'Get help with using this assistant',
        message: 'What can you help me with? List your capabilities.',
      },
      {
        keyword: 'clear',
        description: 'Clear the current conversation',
        message: 'Please forget our previous conversation and start fresh.',
      },
      {
        keyword: 'support',
        description: 'Contact support',
        message: 'I need to speak with a human support agent.',
        icon: <SupportIcon />,  // Optional custom icon
      },
    ],
    showHistoryCommand: true,  // Shows built-in /history command (default: true)
  }}
/>
```

When the user types `/`, a dropdown appears with available commands:
- **Arrow Up/Down**: Navigate commands
- **Enter**: Execute selected command
- **Tab**: Autocomplete command keyword
- **Escape**: Close command dropdown

The built-in `/history` command shows the prompt history in a dropdown for quick reuse.

### Custom Tool Icons and Renderers

Customize how tool calls are displayed in the result card:

```tsx
<AICommandBar
  assistantId="my-assistant"
  options={{
    // Custom icons for specific tools
    toolIcons: {
      search_database: <DatabaseIcon />,
      send_email: <MailIcon />,
      get_weather: <CloudIcon />,
    },

    // Custom renderers for specific tools (replaces entire tool line)
    toolRenderers: {
      get_weather: (input, output) => (
        <div className="weather-result">
          <span>{output.temperature}F in {input.city}</span>
        </div>
      ),
      search_database: (input, output) => (
        <div className="search-result">
          Found {output.count} results for "{input.query}"
        </div>
      ),
    },

    // Custom message shown while processing (before tools run)
    processingMessage: 'Thinking',
  }}
/>
```

### AICommandBar Options Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `position` | `'inline' \| 'fixed'` | `'inline'` | Positioning mode |
| `fixedPlacement` | `{ top?, right?, bottom?, left? }` | `{}` | Position when fixed |
| `shortcut` | `string` | - | Keyboard shortcut (e.g., `'cmd+j'`) |
| `showShortcutHint` | `boolean` | `true` | Show shortcut in bar |
| `placeholder` | `string` | `'Ask AI...'` | Input placeholder |
| `icon` | `ReactNode` | Sparkles icon | Custom left icon |
| `width` | `number \| string` | `400` | Bar width |
| `maxWidth` | `number \| string` | `'100%'` | Maximum width |
| `zIndex` | `number` | `9999` | Z-index for fixed mode |
| `showResultCard` | `boolean` | `true` | Show result card on completion |
| `resultCardMaxHeight` | `number \| string` | `300` | Max height of result card |
| `color` | `string` | `'#3b82f6'` | Primary/accent color |
| `backgroundColor` | `string` | `'#ffffff'` | Background color |
| `textColor` | `string` | `'#1f2937'` | Text color |
| `borderColor` | `string` | `'#e5e7eb'` | Border color |
| `borderRadius` | `number \| string` | `12` | Border radius |
| `fontFamily` | `string` | System fonts | Font family |
| `fontSize` | `number \| string` | `14` | Font size |
| `padding` | `number \| string` | `'12px 16px'` | Inner padding |
| `boxShadow` | `string` | Subtle shadow | Box shadow |
| `animationDuration` | `number` | `200` | Animation duration (ms) |
| `toolRenderers` | `Record<string, (input, output) => ReactNode>` | - | Custom tool renderers |
| `toolIcons` | `Record<string, ReactNode>` | - | Custom tool icons |
| `processingMessage` | `string` | `'Processing...'` | Message shown while processing |
| `enableHistory` | `boolean` | `true` | Enable command history (opt-out) |
| `maxHistoryItems` | `number` | `50` | Maximum history items to store |
| `historyStorageKey` | `string` | `'devic-command-bar-history'` | localStorage key for history |
| `commands` | `AICommandBarCommand[]` | - | Predefined commands (see Commands System) |
| `showHistoryCommand` | `boolean` | `true` | Show built-in /history command |

## Multi-Tenant Integration

For SaaS applications with multiple tenants:

```tsx
<DevicProvider
  apiKey="your-api-key"
  tenantId="global-tenant-id"
  tenantMetadata={{ organizationId: 'org-123' }}
>
  <ChatDrawer
    assistantId="support-assistant"
    tenantId="specific-tenant-override"  // Overrides provider
    tenantMetadata={{
      userId: 'user-456',
      plan: 'enterprise'
    }}
  />
</DevicProvider>
```

## Client-Side Tools (Model Interface Protocol)

Enable the assistant to call functions in your application:

```tsx
import { ChatDrawer, ModelInterfaceTool } from '@devicai/ui';

// Define client-side tools
const tools: ModelInterfaceTool[] = [
  {
    toolName: 'get_user_location',
    schema: {
      type: 'function',
      function: {
        name: 'get_user_location',
        description: 'Get the current user geographic location',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    },
    callback: async () => {
      return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          }),
          (err) => reject(new Error(err.message))
        );
      });
    },
  },
  {
    toolName: 'get_current_page',
    schema: {
      type: 'function',
      function: {
        name: 'get_current_page',
        description: 'Get the current page URL and title',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    },
    callback: async () => ({
      url: window.location.href,
      title: document.title,
      pathname: window.location.pathname,
    }),
  },
  {
    toolName: 'navigate_to_page',
    schema: {
      type: 'function',
      function: {
        name: 'navigate_to_page',
        description: 'Navigate the user to a specific page',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'The path to navigate to',
            },
          },
          required: ['path'],
        },
      },
    },
    callback: async ({ path }) => {
      window.location.href = path;
      return { success: true, navigatedTo: path };
    },
  },
];

function App() {
  return (
    <ChatDrawer
      assistantId="my-assistant"
      modelInterfaceTools={tools}
      onToolCall={(toolName, params) => {
        console.log(`Tool called: ${toolName}`, params);
      }}
    />
  );
}
```

## Custom Chat UI with Hooks

Build a completely custom chat interface:

```tsx
import { useDevicChat } from '@devicai/ui';

function CustomChat() {
  const {
    messages,
    isLoading,
    status,
    error,
    sendMessage,
    clearChat,
  } = useDevicChat({
    assistantId: 'my-assistant',
    onMessageReceived: (message) => {
      console.log('New message:', message);
    },
    onError: (error) => {
      console.error('Chat error:', error);
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const message = formData.get('message') as string;
    if (message.trim()) {
      sendMessage(message);
      e.currentTarget.reset();
    }
  };

  return (
    <div className="custom-chat">
      <div className="messages">
        {messages.map((msg) => (
          <div key={msg.uid} className={`message ${msg.role}`}>
            <strong>{msg.role}:</strong>
            <p>{msg.content.message}</p>
          </div>
        ))}
        {isLoading && <div className="loading">Thinking...</div>}
        {error && <div className="error">{error.message}</div>}
      </div>

      <form onSubmit={handleSubmit}>
        <input
          name="message"
          placeholder="Type a message..."
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading}>
          Send
        </button>
      </form>

      <button onClick={clearChat}>Clear Chat</button>
    </div>
  );
}
```

## File Uploads

Enable file attachments in chat:

```tsx
<ChatDrawer
  assistantId="document-assistant"
  options={{
    enableFileUploads: true,
    allowedFileTypes: {
      images: true,
      documents: true,
      audio: false,
      video: false,
    },
    maxFileSize: 10 * 1024 * 1024, // 10MB
  }}
/>
```

## Theming

### Using CSS Variables

Override the default theme by setting CSS variables:

```css
/* your-styles.css */
:root {
  --devic-primary: #6366f1;        /* Primary color */
  --devic-primary-hover: #4f46e5;  /* Primary hover */
  --devic-primary-light: #eef2ff;  /* Light primary background */
  --devic-bg: #ffffff;             /* Background */
  --devic-bg-secondary: #f8fafc;   /* Secondary background */
  --devic-text: #1e293b;           /* Text color */
  --devic-text-secondary: #64748b; /* Secondary text */
  --devic-text-muted: #94a3b8;     /* Muted text */
  --devic-border: #e2e8f0;         /* Border color */
  --devic-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
  --devic-radius: 12px;            /* Border radius */
  --devic-radius-sm: 6px;
  --devic-radius-lg: 20px;
}
```

### Using the color Option

Quick color customization:

```tsx
<ChatDrawer
  assistantId="my-assistant"
  options={{
    color: '#6366f1', // Sets primary color
  }}
/>
```

## Controlled Mode

Control the drawer state externally:

```tsx
function App() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button onClick={() => setIsOpen(true)}>
        Open Chat
      </button>

      <ChatDrawer
        assistantId="my-assistant"
        isOpen={isOpen}
        onOpen={() => setIsOpen(true)}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}
```

### Using the ChatDrawer Ref Handle

For more control, use the ref handle:

```tsx
import { useRef } from 'react';
import { ChatDrawer, ChatDrawerHandle } from '@devicai/ui';

function App() {
  const drawerRef = useRef<ChatDrawerHandle>(null);

  return (
    <>
      <button onClick={() => drawerRef.current?.open()}>
        Open Chat
      </button>

      <button onClick={() => drawerRef.current?.toggle()}>
        Toggle Chat
      </button>

      <button onClick={() => {
        // Load a specific conversation and open
        drawerRef.current?.setChatUid('existing-chat-uid');
        drawerRef.current?.open();
      }}>
        Resume Previous Chat
      </button>

      <button onClick={() => {
        // Send a message programmatically
        drawerRef.current?.sendMessage('Hello, I need help!');
      }}>
        Send Greeting
      </button>

      <ChatDrawer
        ref={drawerRef}
        assistantId="my-assistant"
      />
    </>
  );
}
```

## Continuing Existing Conversations

Load and continue a previous chat:

```tsx
function App() {
  // Get chatUid from URL, localStorage, or your backend
  const existingChatUid = 'previous-chat-uid';

  return (
    <ChatDrawer
      assistantId="my-assistant"
      chatUid={existingChatUid}
      onChatCreated={(newChatUid) => {
        // Save the new chat UID for future reference
        localStorage.setItem('lastChatUid', newChatUid);
      }}
    />
  );
}
```

## Event Callbacks

Handle various chat events:

```tsx
<ChatDrawer
  assistantId="my-assistant"
  onMessageSent={(message) => {
    // Track user messages
    analytics.track('chat_message_sent', {
      messageLength: message.content.message?.length,
    });
  }}
  onMessageReceived={(message) => {
    // Track assistant responses
    analytics.track('chat_message_received', {
      hasToolCalls: !!message.tool_calls?.length,
    });
  }}
  onToolCall={(toolName, params) => {
    // Track tool usage
    analytics.track('chat_tool_called', { toolName });
  }}
  onError={(error) => {
    // Report errors
    errorReporting.capture(error);
  }}
  onChatCreated={(chatUid) => {
    // Store chat reference
    saveChatReference(chatUid);
  }}
  onOpen={() => {
    // Track drawer open
    analytics.track('chat_opened');
  }}
  onClose={() => {
    // Track drawer close
    analytics.track('chat_closed');
  }}
/>
```

## API Client Direct Usage

For advanced use cases, use the API client directly:

```tsx
import { DevicApiClient } from '@devicai/ui';

const client = new DevicApiClient({
  apiKey: 'your-api-key',
  baseUrl: 'https://api.devic.ai',
});

// List available assistants
const assistants = await client.getAssistants();

// Send a message (async mode)
const { chatUid } = await client.sendMessageAsync('assistant-id', {
  message: 'Hello!',
  tenantId: 'tenant-123',
  metadata: { source: 'web-app' },
});

// Poll for response
const checkResponse = async () => {
  const result = await client.getRealtimeHistory('assistant-id', chatUid);

  if (result.status === 'completed') {
    return result.chatHistory;
  } else if (result.status === 'error') {
    throw new Error('Processing failed');
  }

  // Continue polling
  await new Promise(r => setTimeout(r, 1000));
  return checkResponse();
};

const messages = await checkResponse();
```

## Server-Side Rendering (SSR)

The library is SSR-compatible. Ensure you only render the ChatDrawer on the client:

```tsx
// Next.js example
import dynamic from 'next/dynamic';

const ChatDrawer = dynamic(
  () => import('@devicai/ui').then(mod => mod.ChatDrawer),
  { ssr: false }
);

function Page() {
  return (
    <div>
      <h1>My Page</h1>
      <ChatDrawer assistantId="my-assistant" />
    </div>
  );
}
```

## TypeScript Support

All types are exported for TypeScript users:

```tsx
import type {
  // Messages and API
  ChatMessage,
  RealtimeChatHistory,
  AssistantSpecialization,

  // ChatDrawer
  ChatDrawerProps,
  ChatDrawerOptions,
  ChatDrawerHandle,

  // AICommandBar
  AICommandBarProps,
  AICommandBarOptions,
  AICommandBarHandle,
  CommandBarResult,
  ToolCallSummary,

  // Model Interface
  ModelInterfaceTool,
  ModelInterfaceToolSchema,

  // Hooks
  UseDevicChatOptions,
  UseDevicChatResult,
} from '@devicai/ui';

// ChatDrawer types
const drawerOptions: ChatDrawerOptions = {
  position: 'right',
  width: 400,
  welcomeMessage: 'Hello!',
};

// AICommandBar types
const commandBarOptions: AICommandBarOptions = {
  position: 'fixed',
  shortcut: 'cmd+k',
  placeholder: 'Ask AI...',
};

const handleResponse = (result: CommandBarResult) => {
  console.log('Chat UID:', result.chatUid);
  console.log('Message:', result.message.content?.message);
  console.log('Tool calls:', result.toolCalls.length);
};

const handleMessage = (message: ChatMessage) => {
  console.log(message.content?.message);
};
```

## Troubleshooting

### Chat not loading

1. Verify your API key is correct
2. Check the browser console for errors
3. Ensure the assistant identifier exists

### Styles not applied

1. Make sure you imported the CSS: `import '@devicai/ui/styles.css'`
2. Check for CSS conflicts with your application styles
3. Try increasing specificity or using CSS variables

### Tools not being called

1. Verify the tool schema matches OpenAI function calling format
2. Check that `toolName` matches `function.name` in schema
3. Ensure the assistant has been configured to use client-side tools

### File uploads not working

1. Enable file uploads in options: `enableFileUploads: true`
2. Check allowed file types configuration
3. Verify file size is within limits

## Support

For issues and feature requests, visit the [GitHub repository](https://github.com/devic-ai/devic-ui).
