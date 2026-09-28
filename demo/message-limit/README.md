# Local message limit demo

Run `npm run build && npm run demo:message-limit` from the `devic-ui` repository, then open `http://127.0.0.1:5185`.

The page renders the local library build and connects to `gold_dog_venezuela`. Enter the assistant's API key in the page. It stays in tab memory and passes through a loopback-only proxy to the selected Devic API environment. The proxy accepts only GET and POST requests under this assistant's public API path; it does not store or print the key.

The default notice is translated into Spanish. Enable **Probar componente de aviso personalizado** to try `messageLimitRenderer` with the same new-conversation action.
