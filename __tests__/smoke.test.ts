/**
 * Smoke Test - Verify Jest Setup
 *
 * This test verifies that the Jest testing framework is properly configured
 * and can run basic tests successfully.
 */

describe('Jest Setup', () => {
  it('should run tests successfully', () => {
    expect(true).toBe(true);
  });

  it('should have access to Node environment', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });

  it('should have Jest secret configured', () => {
    expect(process.env.JWT_SECRET).toBeDefined();
    expect(process.env.JWT_SECRET).toBe('test-jwt-secret-placeholder');
  });

  it('should have DATABASE_URL configured', () => {
    expect(process.env.DATABASE_URL).toBeDefined();
    expect(process.env.DATABASE_URL).toBe('file:./test.db');
  });
});

describe('Test Utilities', () => {
  it('should import test helpers successfully', async () => {
    const helpers = await import('./integration/helpers');

    expect(helpers.prismaMock).toBeDefined();
    expect(helpers.createMockUser).toBeDefined();
    expect(helpers.createAuthenticatedRequest).toBeDefined();
  });

  it('should create mock user with defaults', async () => {
    const { createMockUser } = await import('./integration/helpers');

    const user = createMockUser();

    expect(user.id).toBe('user_test123');
    expect(user.emailOrUsername).toBe('test@example.com');
    expect(user.name).toBe('Test User');
  });

  it('should create mock user with overrides', async () => {
    const { createMockUser } = await import('./integration/helpers');

    const user = createMockUser({
      id: 'custom_id',
      name: 'Custom User',
    });

    expect(user.id).toBe('custom_id');
    expect(user.name).toBe('Custom User');
    expect(user.emailOrUsername).toBe('test@example.com'); // default
  });

  it('should create authenticated request', async () => {
    const { createAuthenticatedRequest } = await import('./integration/helpers');

    const request = createAuthenticatedRequest(
      'GET',
      'http://localhost/api/test'
    );

    expect(request.method).toBe('GET');
    expect(request.url).toBe('http://localhost/api/test');

    // Check that auth cookie is set
    const cookieHeader = request.headers.get('cookie');
    expect(cookieHeader).toContain('auth_token=');
  });

  it('should create unauthenticated request', async () => {
    const { createUnauthenticatedRequest } = await import('./integration/helpers');

    const request = createUnauthenticatedRequest(
      'POST',
      'http://localhost/api/auth/login',
      { email: 'test@example.com', password: 'password' }
    );

    expect(request.method).toBe('POST');
    expect(request.headers.get('content-type')).toBe('application/json');

    // Should not have auth cookie
    const cookieHeader = request.headers.get('cookie');
    expect(cookieHeader).toBeNull();
  });
});
