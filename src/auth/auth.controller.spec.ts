import { Test } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let service: jest.Mocked<AuthService>;

  beforeEach(async () => {
    service = {
      registerCustomer: jest.fn(),
      login: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn(),
      requestPasswordReset: jest.fn(),
      resetPassword: jest.fn(),
      getMe: jest.fn(),
    } as unknown as jest.Mocked<AuthService>;

    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: service }],
    }).compile();

    controller = module.get(AuthController);
  });

  it('POST /auth/signup delegates to registerCustomer', async () => {
    const dto = {
      phone: '01001234567',
      password: 'P@ssw0rd123',
      fullName: 'Tarek',
    };
    const expected = { user: { id: 'u1' }, accessToken: 'a', refreshToken: 'r' };
    service.registerCustomer.mockResolvedValue(expected);
    await expect(controller.signup(dto)).resolves.toBe(expected);
  });

  it('POST /auth/login delegates with phone + password', async () => {
    const expected = { user: { id: 'u1' }, accessToken: 'a', refreshToken: 'r' };
    service.login.mockResolvedValue(expected);
    await expect(
      controller.login({ phone: '01001234567', password: 'P@ssw0rd123' }),
    ).resolves.toBe(expected);
  });

  it('POST /auth/refresh delegates', async () => {
    const expected = { accessToken: 'a', refreshToken: 'r' };
    service.refresh.mockResolvedValue(expected);
    await expect(controller.refresh({ refreshToken: 'r' })).resolves.toBe(expected);
  });

  it('POST /auth/logout delegates and returns a message', async () => {
    service.logout.mockResolvedValue();
    await expect(controller.logout({ refreshToken: 'r' })).resolves.toEqual({
      message: 'Logged out',
    });
  });

  it('POST /auth/verify-user delegates to requestPasswordReset', async () => {
    service.requestPasswordReset.mockResolvedValue({ resetToken: 'tok' });
    await expect(
      controller.verifyUser({ phone: '01001234567' }),
    ).resolves.toEqual({ resetToken: 'tok' });
  });

  it('POST /auth/reset-password delegates and returns a message', async () => {
    service.resetPassword.mockResolvedValue();
    await expect(
      controller.resetPassword({ token: 't', newPassword: 'NewPass123' }),
    ).resolves.toEqual({ message: 'Password reset' });
  });

  it('GET /auth/me delegates with the AuthenticatedUser', async () => {
    const user = { id: 'u1', phone: '01001234567' } as never;
    service.getMe.mockResolvedValue({ id: 'u1' } as never);
    await expect(controller.me(user)).resolves.toEqual({ id: 'u1' });
  });
});
