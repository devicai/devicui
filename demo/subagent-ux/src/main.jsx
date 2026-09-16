import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  AgentThreadState,
  HandoffSubagentWidget,
  SubagentResultCard,
} from '../../../dist/esm/index.js';
import '../../../dist/esm/styles.css';
import './playground.css';

const now = Date.now();
const agents = [
  { id: 'agent-research', name: 'Analista', thread: 'thread-research' },
  { id: 'agent-critic', name: 'Crítico', thread: 'thread-critic' },
];

const result = (agent, status, text) => ({
  uid: `result-${agent.id}`,
  role: 'user',
  source: 'subagent',
  synthetic: true,
  eventType: 'subagent_result',
  timestamp: now,
  subagent: {
    threadId: agent.thread,
    agentId: agent.id,
    agentName: agent.name,
    executionMode: 'async',
  },
  content: {
    message: '[Async subagent result]',
    data: { status, result: text },
  },
});

function App() {
  return (
    <main className="playground">
      <header className="hero">
        <span className="eyebrow">DEVIC UI · LOCAL UX LAB</span>
        <h1>Subagentes asíncronos</h1>
        <p>Estados deterministas para revisar jerarquía, nombres, progreso y resultados sin esperar al scheduler.</p>
      </header>

      <section>
        <div className="section-title"><span>01</span><h2>En progreso, en paralelo</h2></div>
        <div className="execution-grid">
          {agents.map((agent, index) => (
            <HandoffSubagentWidget
              key={agent.id}
              subThreadId={agent.thread}
              agentHint={{ _id: agent.id, name: agent.name }}
              threadHint={{
                _id: agent.thread,
                agentId: agent.id,
                name: agent.name,
                state: index ? AgentThreadState.QUEUED : AgentThreadState.PROCESSING,
                tasks: index ? [] : [
                  { completed: true, name: 'Revisar contexto' },
                  { completed: false, name: 'Validar respuesta' },
                ],
              }}
            />
          ))}
        </div>
      </section>

      <section>
        <div className="section-title"><span>02</span><h2>Resultados incorporados al hilo</h2></div>
        <div className="results-stack">
          <SubagentResultCard message={result(agents[0], 'completed', 'He verificado la continuidad del contexto. **Las MIT siguen disponibles** tras reanudar la ejecución.')} />
          <SubagentResultCard message={result(agents[1], 'failed', 'No pude completar la comprobación: el recurso de prueba no estaba disponible.')} />
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
