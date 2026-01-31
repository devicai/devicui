# Agent Guide for Devic UI

This document provides context for AI coding agents working on the `@devicai/ui` library.

## Project Overview

**@devicai/ui** is a React component library for integrating Devic AI assistants into web applications. It provides ready-to-use chat components and hooks for building custom chat interfaces.

- **Package:** `@devicai/ui` on npm
- **Repository:** https://github.com/devicai/devicui
- **Node:** Requires Node.js 20+
- **React:** Compatible with React 17+

## Project Structure

```
devic-ui/
├── src/
│   ├── index.ts                     # Main exports - ALL public APIs must be exported here
│   ├── api/
│   │   ├── client.ts                # DevicApiClient - HTTP client using native fetch
│   │   └── types.ts                 # API types and interfaces
│   ├── provider/
│   │   ├── DevicProvider.tsx        # React context provider for global config
│   │   ├── DevicContext.ts          # Context definition and hooks
│   │   ├── types.ts                 # Provider-specific types
│   │   └── index.ts                 # Provider exports
│   ├── hooks/
│   │   ├── useDevicChat.ts          # Main chat hook - manages messages, polling, tools
│   │   ├── usePolling.ts            # Real-time polling for async responses
│   │   ├── useModelInterface.ts     # Client-side tool execution (Model Interface Protocol)
│   │   └── index.ts                 # Hooks exports
│   ├── components/
│   │   ├── ChatDrawer/
│   │   │   ├── ChatDrawer.tsx       # Main drawer component
│   │   │   ├── ChatDrawer.types.ts  # Component prop types
│   │   │   ├── ChatMessages.tsx     # Message list display
│   │   │   ├── ChatInput.tsx        # Input with file upload support
│   │   │   ├── ToolTimeline.tsx     # Tool execution progress display
│   │   │   ├── styles.css           # CSS with CSS Variables for theming
│   │   │   └── index.ts             # Component exports
│   │   ├── AICommandBar/
│   │   │   ├── AICommandBar.tsx     # Command bar component
│   │   │   ├── AICommandBar.types.ts # Component prop types
│   │   │   ├── AICommandBar.css     # Component styles
│   │   │   ├── useAICommandBar.ts   # Hook for command bar logic
│   │   │   └── index.ts             # Component exports
│   │   ├── AIGenerationButton/
│   │   │   ├── AIGenerationButton.tsx      # Generation button component
│   │   │   ├── AIGenerationButton.types.ts # Component prop types
│   │   │   ├── AIGenerationButton.css      # Component styles
│   │   │   ├── useAIGenerationButton.ts    # Hook for generation logic
│   │   │   └── index.ts             # Component exports
│   │   ├── Feedback/
│   │   │   ├── MessageActions.tsx   # Thumbs up/down feedback buttons
│   │   │   ├── FeedbackModal.tsx    # Feedback comment modal
│   │   │   ├── Feedback.types.ts    # Feedback-related types
│   │   │   ├── Feedback.css         # Feedback component styles
│   │   │   └── index.ts             # Component exports
│   │   └── AutocompleteInput/       # WIP - not ready for public use
│   │       └── ...
│   └── utils/
│       └── index.ts                 # Utility functions
├── dist/                            # Build output (git-ignored)
│   ├── esm/                         # ES Modules build + TypeScript declarations
│   └── cjs/                         # CommonJS build
├── package.json
├── tsconfig.json
├── rollup.config.js                 # Build configuration
├── README.md                        # User documentation
├── INTEGRATION.md                   # Detailed integration guide
└── AGENT.md                         # This file
```

## Key Concepts

### 1. DevicProvider
Global context provider that holds API configuration. Components can work with or without it (standalone mode with props).

```tsx
<DevicProvider apiKey="xxx" baseUrl="https://api.devic.ai">
  <App />
</DevicProvider>
```

### 2. ChatDrawer
Ready-to-use chat drawer component. Internally uses `useDevicChat` hook. Supports two display modes:
- **drawer**: Overlay panel with floating trigger button (default)
- **inline**: Embedded in page layout, always visible

### 3. AICommandBar
A floating command bar (similar to Spotlight/Command Palette) for quick AI interactions. Features:
- Keyboard shortcut activation (e.g., `cmd+k`)
- Command history with arrow key navigation
- Slash commands (`/help`, `/history`)
- Tool execution progress display
- Result card with feedback
- Integration with ChatDrawer for handoff

```tsx
<AICommandBar
  assistantId="my-assistant"
  options={{
    shortcut: 'cmd+k',
    placeholder: 'Ask AI...',
    position: 'fixed',
    fixedPlacement: { bottom: 20, right: 20 },
  }}
  onResponse={({ message }) => console.log(message.content)}
/>
```

### 4. AIGenerationButton
A button component for triggering AI generation with three interaction modes:
- **direct**: Sends predefined prompt immediately on click
- **modal**: Opens a modal for user to enter prompt
- **tooltip**: Shows inline tooltip input for quick prompt entry

```tsx
// Direct mode - immediate generation
<AIGenerationButton
  assistantId="my-assistant"
  options={{
    mode: 'direct',
    prompt: 'Generate a summary',
    label: 'Summarize',
  }}
  onResponse={({ message }) => setResult(message.content.message)}
/>

// Modal mode - user inputs prompt
<AIGenerationButton
  assistantId="my-assistant"
  options={{
    mode: 'modal',
    modalTitle: 'Generate Content',
  }}
  onResponse={handleGeneration}
/>

// Tooltip mode - inline input
<AIGenerationButton
  assistantId="my-assistant"
  options={{
    mode: 'tooltip',
    tooltipPlacement: 'bottom',
  }}
  onResponse={handleGeneration}
/>
```

### 5. useDevicChat Hook
Core hook that manages:
- Message state
- Async message sending with polling
- Model Interface Protocol (client-side tools)
- Error handling

### 6. Model Interface Protocol
Allows the AI assistant to call client-side functions. Tools are defined with OpenAI function-calling schema format.

```tsx
const tools: ModelInterfaceTool[] = [{
  toolName: 'get_location',
  schema: {
    type: 'function',
    function: {
      name: 'get_location',
      description: 'Get user location',
      parameters: { type: 'object', properties: {} }
    }
  },
  callback: async () => ({ lat: 40.7, lng: -74.0 })
}];
```

### 7. API Client
Uses native `fetch` - no external HTTP libraries. Communicates with:
- `POST /api/v1/assistants/:id/messages?async=true` - Send message
- `GET /api/v1/assistants/:id/chats/:chatUid/realtime` - Poll for response
- `POST /api/v1/assistants/:id/chats/:chatUid/tool-response` - Submit tool results

## Development Commands

```bash
npm install          # Install dependencies
npm run build        # Build ESM and CJS bundles
npm run dev          # Watch mode for development
npm run typecheck    # Run TypeScript type checking
npm run clean        # Remove dist folder
npm run yalc:publish # Build and publish to yalc for local testing
```

## Making Changes

### Adding a New Component

1. Create component in `src/components/NewComponent/`
2. Create types file `NewComponent.types.ts`
3. Create `index.ts` that exports the component
4. Export from `src/index.ts`
5. Add CSS to component's `styles.css` using CSS Variables

### Adding a New Hook

1. Create hook in `src/hooks/useNewHook.ts`
2. Export types and hook from `src/hooks/index.ts`
3. Export from `src/index.ts`

### Modifying API Types

1. Update types in `src/api/types.ts`
2. Update `DevicApiClient` in `src/api/client.ts` if needed
3. Ensure backwards compatibility

### Styling Guidelines

- Use CSS Variables for all colors, spacing, and theming
- Prefix all classes with `devic-` to avoid conflicts
- Variables are defined in `ChatDrawer/styles.css`:
  ```css
  --devic-primary: #1890ff;
  --devic-bg: #ffffff;
  --devic-text: #333333;
  --devic-border: #e8e8e8;
  /* etc. */
  ```

## Build System

- **Rollup** bundles the library
- **ESM build:** `dist/esm/` - For modern bundlers, includes `.d.ts` files
- **CJS build:** `dist/cjs/` - For Node.js/CommonJS environments
- **CSS:** Extracted to `dist/esm/styles.css`

## Testing Changes Locally

Use yalc to test in a consuming project:

```bash
# In devic-ui
npm run build && yalc publish

# In your test app
yalc add @devicai/ui
npm install

# After making changes
npm run yalc:publish  # Pushes to all linked projects
```

## Publishing

Publishing happens automatically via GitHub Actions when a release is created. To publish manually:

```bash
npm version patch  # or minor, major
git push && git push --tags
# Then create a release on GitHub, or:
npm publish --access public --otp=YOUR_2FA_CODE
```

## Important Notes

1. **No external dependencies** - Only React as peer dependency. Use native APIs (fetch, etc.)
2. **React 17+ compatibility** - Don't use React 18-only features
3. **TypeScript strict mode** - All code must pass strict type checking
4. **Export everything public** - All public APIs must be exported from `src/index.ts`
5. **CSS Variables for theming** - Never hardcode colors
6. **Backwards compatibility** - Don't break existing APIs without major version bump

## Related Backend API

The library communicates with the Devic Public API. Relevant backend files:
- `src/public-api/v1/controllers/public-assistants-v1.controller.ts`
- `src/public-api/v1/services/public-assistants-v1.service.ts`
- `src/public-api/v1/dtos/assistants.dto.ts`

Key endpoints:
- `POST /api/v1/assistants/:identifier/messages` - Process message
- `GET /api/v1/assistants/:identifier/chats/:chatUid/realtime` - Get realtime history
- `POST /api/v1/assistants/:identifier/chats/:chatUid/tool-response` - Submit tool responses
