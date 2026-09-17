import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  ChatDrawer,
  ChatMessages,
  DevicProvider,
  SubagentActivityTray,
  SubagentResultCard,
} from '../../../dist/esm/index.js';
import '../../../dist/esm/styles.css';
import './playground.css';

const now = Date.now();
const assistantId = '02833776-0e30-4b7e-8586-664c1ac446a1';
const apiBaseUrl = '/devic-api';
const playgroundCredential = 'local-playground-proxy';
const parallelPrompt = 'Lanza los dos subagentes disponibles en paralelo y en modo asíncrono. Continúa tu ejecución mientras trabajan, indica qué agente has lanzado y espera a incorporar sus dos resultados al hilo.';
const agents = [
  { id: 'agent-research', name: 'Analista', thread: 'thread-research' },
  { id: 'agent-critic', name: 'Crítico', thread: 'thread-critic' },
];

const compactActivityMessages = [
  {
    uid: 'compact-user',
    role: 'user',
    timestamp: now,
    content: { message: 'Lanza ambos agentes en paralelo.' },
  },
  {
    uid: 'compact-launch',
    role: 'assistant',
    timestamp: now + 1,
    content: {},
    tool_calls: agents.map((agent) => ({
      id: `compact-call-${agent.id}`,
      type: 'function',
      function: { name: 'hand_off_subagent', arguments: JSON.stringify({ agentId: agent.id, executionMode: 'async' }) },
    })),
  },
  ...agents.map((agent, index) => ({
    uid: `compact-tool-${agent.id}`,
    role: 'tool',
    timestamp: now + 2 + index,
    tool_call_id: `compact-call-${agent.id}`,
    content: {
      data: {
        subThreadId: agent.thread,
        executionMode: 'async',
        asynchronous: true,
        agent: { id: agent.id, name: agent.name },
      },
    },
  })),
  {
    uid: 'compact-result-agent-research',
    role: 'user',
    source: 'subagent',
    synthetic: true,
    eventType: 'subagent_result',
    timestamp: now + 4,
    subagent: {
      threadId: agents[0].thread,
      agentId: agents[0].id,
      agentName: agents[0].name,
      executionMode: 'async',
    },
    content: { data: { status: 'completed', result: 'Análisis completado.' } },
  },
];

const deterministicHandoffMessages = compactActivityMessages.slice(1, 4);

const parallelResults = {
  uid: 'parallel-results',
  role: 'user',
  source: 'subagent',
  synthetic: true,
  eventType: 'subagent_results',
  timestamp: now,
  content: {
    data: {
      subagentResults: [
        {
          subagent: { threadId: agents[0].thread, agentId: agents[0].id, agentName: agents[0].name, executionMode: 'async' },
          status: 'completed',
          result: 'He verificado la continuidad del contexto. **Las MIT siguen disponibles** tras reanudar la ejecución y el turno mantiene las herramientas inyectadas originalmente.',
        },
        {
          subagent: { threadId: agents[1].thread, agentId: agents[1].id, agentName: agents[1].name, executionMode: 'async' },
          status: 'failed',
          error: 'No pude completar la comprobación: el recurso de prueba no estaba disponible.',
        },
      ],
    },
  },
};

function App() {
  return (
    <main className="playground">
      <header className="hero">
        <span className="eyebrow">DEVIC UI · LOCAL UX LAB</span>
        <h1>Subagentes asíncronos</h1>
        <p>Un chat conectado al asistente local para probar dos subagentes en paralelo, más estados deterministas para comparar la UI sin esperar al scheduler.</p>
      </header>

      <section>
        <div className="section-title"><span>01</span><h2>Chat real · ejecución en paralelo</h2></div>
        <div className="live-lab">
          <aside className="live-guide">
            <span className="live-badge"><i /> Backend local</span>
            <h3>Async Coordinator</h3>
            <p>El mensaje sugerido pide lanzar al Analista y al Crítico sin bloquear el turno principal.</p>
            <ol>
              <li>Envía el mensaje sugerido.</li>
              <li>Comprueba que ambos aparecen dentro de un único widget compacto.</li>
              <li>Déjalo abierto: el chat usa SSE y debe incorporar cada resultado sin recargar.</li>
            </ol>
            <code>{assistantId}</code>
          </aside>
          <div className="live-chat-shell">
            <DevicProvider
              apiKey={playgroundCredential}
              baseUrl={apiBaseUrl}
              streaming
            >
              <ChatDrawer
                mode="inline"
                assistantId={assistantId}
                streaming
                tags={['local-playground', 'async-subagents']}
                options={{
                  width: '100%',
                  borderRadius: 14,
                  title: 'Async Coordinator',
                  welcomeMessage: 'Prueba la ejecución paralela de los dos subagentes locales.',
                  suggestedMessages: [{
                    content: <>↗ Lanzar Analista + Crítico en paralelo</>,
                    message: parallelPrompt,
                  }],
                  inputPlaceholder: 'Pide una ejecución asíncrona en paralelo…',
                  showToolTimeline: true,
                  showFeedback: false,
                  showIntegrationsButton: false,
                  messageQueue: true,
                  persistConversation: false,
                  backgroundColor: '#18181b',
                  secondaryBackgroundColor: '#202024',
                  textColor: '#f5f3ff',
                  borderColor: '#34343a',
                  userBubbleColor: '#6d4be8',
                  userBubbleTextColor: '#ffffff',
                  assistantBubbleColor: '#25242a',
                  assistantBubbleTextColor: '#f5f3ff',
                  sendButtonColor: '#8b6df6',
                }}
              />
            </DevicProvider>
          </div>
        </div>
      </section>

      <section>
        <div className="section-title"><span>02</span><h2>Bandeja compacta sobre el prompt</h2></div>
        <div className="compact-preview">
          <SubagentActivityTray messages={compactActivityMessages} />
          <div className="compact-prompt">
            <span>Escribe mientras los subagentes trabajan…</span>
            <button type="button" aria-label="Enviar">➤</button>
          </div>
        </div>
      </section>

      <section>
        <div className="section-title"><span>03</span><h2>Estados deterministas en paralelo</h2></div>
        <div className="execution-grid">
          <DevicProvider apiKey={playgroundCredential} baseUrl={apiBaseUrl} streaming>
            <ChatMessages
              messages={deterministicHandoffMessages}
              allMessages={deterministicHandoffMessages}
              isLoading={false}
              showFeedback={false}
            />
          </DevicProvider>
        </div>
      </section>

      <section>
        <div className="section-title"><span>04</span><h2>Resultados incorporados al hilo</h2></div>
        <div className="results-stack">
          <SubagentResultCard message={parallelResults} />
        </div>
      </section>

      <footer>
        <span>El protocolo conserva <code>role: user</code>.</span>
        <span>La UI discrimina por <code>source: subagent</code> y <code>synthetic: true</code>.</span>
      </footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
