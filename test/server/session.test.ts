import { EncryptedSessionManager, MemorySessionStore, type AuthSession } from '../../server/session.js';

describe('EncryptedSessionManager', () => {
  it('stores encrypted sessions and verifies only authentic opaque cookies', async () => {
    const store = new MemorySessionStore();
    const sessions = new EncryptedSessionManager(store, 'a'.repeat(64));
    const id = sessions.createId();
    const session: AuthSession = {
      kind: 'auth',
      subject: 'operator-123',
      displayName: 'Operator',
      roles: ['platform:operator'],
      csrfToken: 'csrf-secret',
      accessToken: 'access-secret',
      idToken: 'identity-secret',
      expiresAt: Date.now() + 60_000,
      lastRoleCheckAt: Date.now(),
    };

    await sessions.put(id, session, 60);

    expect(store.valuesForTest().join('')).not.toContain('access-secret');
    expect(store.valuesForTest().join('')).not.toContain('identity-secret');
    expect(await sessions.get<AuthSession>(id, 'auth')).toEqual(session);
    const token = sessions.createToken(id);
    expect(sessions.verifyToken(token)).toBe(id);
    expect(sessions.verifyToken(`${token}tampered`)).toBeNull();
    expect(token).not.toContain('operator-123');
  });

  it('rejects expired or incorrectly typed records', async () => {
    const store = new MemorySessionStore();
    const sessions = new EncryptedSessionManager(store, 'b'.repeat(64));
    const id = sessions.createId();
    await sessions.put(
      id,
      {
        kind: 'login',
        state: 'state',
        nonce: 'nonce',
        codeVerifier: 'verifier',
        expiresAt: Date.now() + 60_000,
      },
      60,
    );

    expect(await sessions.get(id, 'auth')).toBeNull();
  });
});
