import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const workspaceRoot = fileURLToPath(new URL('../../../../', import.meta.url));

function localApiKey() {
  if (process.env.DEVIC_LOCAL_API_KEY) return process.env.DEVIC_LOCAL_API_KEY;

  const envFile = readFileSync(`${workspaceRoot}.env`, 'utf8');
  const entry = envFile.match(/^DEVIC_LOCAL_API_KEY=(.*)$/m)?.[1]?.trim();
  if (!entry) return undefined;

  const quoted = (entry.startsWith('"') && entry.endsWith('"'))
    || (entry.startsWith("'") && entry.endsWith("'"));
  return quoted ? entry.slice(1, -1) : entry;
}

export default () => {
  const apiKey = localApiKey();

  if (!apiKey) {
    throw new Error('DEVIC_LOCAL_API_KEY is required to run the subagent playground.');
  }

  return {
    server: {
      proxy: {
        '/devic-api': {
          target: 'http://127.0.0.1:8033',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/devic-api/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyRequest) => {
              proxyRequest.setHeader('Authorization', `Bearer ${apiKey}`);
            });
          },
        },
      },
    },
  };
};
