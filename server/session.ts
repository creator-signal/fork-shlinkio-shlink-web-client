import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createClient, type RedisClientType } from 'redis';

export type LoginTransaction = {
  kind: 'login';
  state: string;
  nonce: string;
  codeVerifier: string;
  expiresAt: number;
};

export type AuthSession = {
  kind: 'auth';
  subject: string;
  displayName: string;
  roles: string[];
  csrfToken: string;
  accessToken: string;
  idToken: string;
  expiresAt: number;
  lastRoleCheckAt: number;
};

export type StoredSession = LoginTransaction | AuthSession;

export interface SessionStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
  ping(): Promise<void>;
  close(): Promise<void>;
}

export class RedisSessionStore implements SessionStore {
  public constructor(
    private readonly client: RedisClientType,
    private readonly prefix = 'creator-signal:shlink-web:session:',
  ) {}

  public static async connect(url: string): Promise<RedisSessionStore> {
    const client = createClient({ url });
    client.on('error', () => undefined);
    await client.connect();
    return new RedisSessionStore(client as RedisClientType);
  }

  public get(key: string) {
    return this.client.get(this.prefix + key);
  }

  public async set(key: string, value: string, ttlSeconds: number) {
    await this.client.set(this.prefix + key, value, { EX: ttlSeconds });
  }

  public async delete(key: string) {
    await this.client.del(this.prefix + key);
  }

  public async ping() {
    await this.client.ping();
  }

  public async close() {
    if (this.client.isOpen) {
      await this.client.close();
    }
  }
}

export class MemorySessionStore implements SessionStore {
  readonly #values = new Map<string, { value: string; expiresAt: number }>();

  public async get(key: string) {
    const record = this.#values.get(key);
    if (!record || record.expiresAt <= Date.now()) {
      this.#values.delete(key);
      return null;
    }
    return record.value;
  }

  public async set(key: string, value: string, ttlSeconds: number) {
    this.#values.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  public async delete(key: string) {
    this.#values.delete(key);
  }

  public async ping() {}

  public async close() {
    this.#values.clear();
  }

  public valuesForTest() {
    return [...this.#values.values()].map(({ value }) => value);
  }
}

const encode = (value: Buffer) => value.toString('base64url');
const decode = (value: string) => Buffer.from(value, 'base64url');

export class EncryptedSessionManager {
  readonly #encryptionKey: Buffer;
  readonly #signingKey: Buffer;

  public constructor(
    private readonly store: SessionStore,
    secret: string,
  ) {
    this.#encryptionKey = createHash('sha256').update('encryption\0').update(secret).digest();
    this.#signingKey = createHash('sha256').update('signing\0').update(secret).digest();
  }

  public createId() {
    return encode(randomBytes(32));
  }

  public createToken(id: string) {
    return `${id}.${encode(createHmac('sha256', this.#signingKey).update(id).digest())}`;
  }

  public verifyToken(token: string | undefined): string | null {
    if (!token) {
      return null;
    }
    const [id, signature, extra] = token.split('.');
    if (!id || !signature || extra) {
      return null;
    }

    const expected = createHmac('sha256', this.#signingKey).update(id).digest();
    const provided = decode(signature);
    return provided.length === expected.length && timingSafeEqual(provided, expected) ? id : null;
  }

  public async put(id: string, value: StoredSession, ttlSeconds: number) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.#encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    const envelope = [encode(iv), encode(cipher.getAuthTag()), encode(encrypted)].join('.');
    await this.store.set(id, envelope, ttlSeconds);
  }

  public async get<T extends StoredSession>(id: string, kind: T['kind']): Promise<T | null> {
    const envelope = await this.store.get(id);
    if (!envelope) {
      return null;
    }

    try {
      const [iv, tag, encrypted, extra] = envelope.split('.');
      if (!iv || !tag || !encrypted || extra) {
        return null;
      }
      const decipher = createDecipheriv('aes-256-gcm', this.#encryptionKey, decode(iv));
      decipher.setAuthTag(decode(tag));
      const json = Buffer.concat([decipher.update(decode(encrypted)), decipher.final()]).toString('utf8');
      const session = JSON.parse(json) as T;
      return session.kind === kind && session.expiresAt > Date.now() ? session : null;
    } catch {
      return null;
    }
  }

  public delete(id: string) {
    return this.store.delete(id);
  }

  public ping() {
    return this.store.ping();
  }

  public close() {
    return this.store.close();
  }
}
