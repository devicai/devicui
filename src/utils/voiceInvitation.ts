/**
 * Whether the person closed the voice invitation for an assistant. Kept in
 * localStorage, per assistant, so it stays closed across conversations and
 * page loads; storage that is missing, full or blocked counts as "not hidden".
 */
const key = (assistantId: string) => `devic-ui:voice-invitation-hidden:${assistantId}`;

export function isVoiceInvitationHidden(assistantId: string): boolean {
  try { return typeof localStorage !== 'undefined' && localStorage.getItem(key(assistantId)) === '1'; }
  catch { return false; }
}

export function hideVoiceInvitation(assistantId: string): void {
  try { localStorage.setItem(key(assistantId), '1'); } catch { /* Private mode or quota: the card comes back next load. */ }
}

export function showVoiceInvitation(assistantId: string): void {
  try { localStorage.removeItem(key(assistantId)); } catch { /* Nothing to undo. */ }
}
