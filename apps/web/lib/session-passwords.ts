// Guardado em globalThis (não só no escopo do módulo) porque o Next.js pode
// recarregar/reavaliar cada route handler separadamente em dev; sem isso, o
// Map perderia o estado entre uma rota e outra.
const globalForPasswords = globalThis as unknown as {
  __tovenoSessionPasswords?: Map<string, string>;
};

const passwords =
  globalForPasswords.__tovenoSessionPasswords ??
  (globalForPasswords.__tovenoSessionPasswords = new Map<string, string>());

export function setSessionPassword(sessionId: string, password: string) {
  passwords.set(sessionId, password);
}

export function clearSessionPassword(sessionId: string) {
  passwords.delete(sessionId);
}

export function isSessionPrivate(sessionId: string): boolean {
  return passwords.has(sessionId);
}

export function verifySessionPassword(sessionId: string, password: string | undefined): boolean {
  const stored = passwords.get(sessionId);

  if (stored === undefined) {
    return true;
  }

  return password === stored;
}
