import { extractZitadelRoles } from '../../server/oidc.js';

describe('ZITADEL role extraction', () => {
  it('accepts project-specific and standard project role claims', () => {
    expect(
      extractZitadelRoles(
        {
          'urn:zitadel:iam:org:project:project-1:roles': { 'platform:operator': { org: 'Creator Signal' } },
          'urn:zitadel:iam:org:project:roles': { viewer: {} },
        },
        'project-1',
      ),
    ).toEqual(['platform:operator', 'viewer']);
  });

  it('does not interpret arrays or strings as role maps', () => {
    expect(
      extractZitadelRoles(
        {
          'urn:zitadel:iam:org:project:project-1:roles': ['platform:operator'],
        },
        'project-1',
      ),
    ).toEqual([]);
  });
});
