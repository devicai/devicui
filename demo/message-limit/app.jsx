import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ChatDrawer, DevicProvider } from '../../dist/esm/index.js';
import '../../dist/esm/styles.css';
import './demo.css';

const assistantId = 'gold_dog_venezuela';
const translations = {
  'New chat': 'Nueva conversación',
  'Type a message...': 'Escribe un mensaje...',
  'Send message': 'Enviar mensaje',
  'Message limit reached for this chat': 'Límite de mensajes alcanzado',
  'This conversation has reached its message limit. Start a new chat to continue.':
    'Esta conversación ha alcanzado su límite. Abre otra para continuar.',
  'Start a new chat': 'Abrir nueva conversación',
};

function App() {
  const [credential, setCredential] = useState('');
  const [draft, setDraft] = useState('');
  const [environment, setEnvironment] = useState('prod');
  const [customNotice, setCustomNotice] = useState(false);

  function connect(event) {
    event.preventDefault();
    if (draft.trim()) setCredential(draft.trim());
    setDraft('');
  }

  return (
    <main>
      <aside className="intro">
        <span className="eyebrow">DEVIC UI · DEMO LOCAL</span>
        <h1>Límite de mensajes</h1>
        <p>Prueba el aviso del drawer con <strong>{assistantId}</strong>. El asistente tiene un límite de cinco mensajes.</p>
        <div className="steps">
          <span>1. Conecta tu API key.</span>
          <span>2. Envía mensajes hasta alcanzar el límite.</span>
          <span>3. Usa «Abrir nueva conversación» para continuar.</span>
        </div>

        {!credential ? (
          <form onSubmit={connect} className="connect-form">
            <label htmlFor="environment">Entorno</label>
            <select id="environment" value={environment} onChange={(event) => setEnvironment(event.target.value)}>
              <option value="prod">Producción</option>
              <option value="dev">DEV</option>
            </select>
            <label htmlFor="api-key">API key</label>
            <input id="api-key" type="password" autoComplete="off" required value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="devic-…" />
            <button type="submit">Conectar</button>
            <small>La clave permanece en la memoria de esta pestaña. Se envía solo al proxy local y al API del entorno elegido.</small>
          </form>
        ) : (
          <div className="connected">
            <span>Conectado a {environment === 'prod' ? 'Producción' : 'DEV'}</span>
            <button type="button" onClick={() => setCredential('')}>Cambiar clave</button>
          </div>
        )}

        {credential && (
          <label className="toggle">
            <input type="checkbox" checked={customNotice} onChange={(event) => setCustomNotice(event.target.checked)} />
            Probar componente de aviso personalizado
          </label>
        )}
      </aside>

      <section className="chat-panel">
        {credential ? (
          <DevicProvider apiKey={credential} baseUrl={`${location.origin}/api/${environment}`} translations={translations} streaming>
            <ChatDrawer
              key={environment}
              mode="inline"
              assistantId={assistantId}
              options={{
                title: 'gold_dog_venezuela',
                welcomeMessage: 'Escribe para probar el límite de esta conversación.',
                width: '100%',
                style: { height: '100%', minHeight: 0 },
                borderRadius: 18,
                color: '#5d58cf',
                messageLimitRenderer: customNotice ? ({ onNewChat }) => (
                  <div className="custom-notice" role="status">
                    <strong>Has llegado al límite de esta conversación.</strong>
                    <p>Abre una nueva para seguir hablando con el asistente.</p>
                    <button type="button" onClick={onNewChat}>Abrir nueva conversación</button>
                  </div>
                ) : undefined,
              }}
            />
          </DevicProvider>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">✦</div>
            <h2>Tu chat aparecerá aquí</h2>
            <p>Introduce la clave de prueba para conectar esta demo con el asistente.</p>
          </div>
        )}
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
