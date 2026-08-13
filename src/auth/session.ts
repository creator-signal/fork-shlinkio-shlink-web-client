export type BrowserSession = {
  user: { displayName: string };
  csrfToken: string;
  server: { id: string; name: string; version: string; autoConnect: true };
};

let csrfToken = '';

export const setBrowserSession = (session: BrowserSession) => {
  csrfToken = session.csrfToken;
};

export const getCsrfToken = () => csrfToken;

export const logout = async () => {
  const response = await fetch('/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
    },
    body: '{}',
  });
  if (!response.ok) {
    throw new Error('Logout failed');
  }
  const { logoutUrl } = (await response.json()) as { logoutUrl: string };
  window.location.assign(logoutUrl);
};
