import type { AuthToolkit } from 'general/AuthToolkit/index';
import { container, TYPES } from 'general/inversify.config';

describe('Генерация хешей и объектов авторизации', () => {
  const testPassword = 'testPassword';
  process.env.JWT_TOKEN_SECRET = 'secret';
  process.env.JWT_TOKEN_TTL_IN_SECOND = '300';
  process.env.REFRESH_TOKEN_TTL_IN_SECOND = '3000';

  const auth = container.get<AuthToolkit>(TYPES.AuthToolkit);

  describe('Хеширование паролей', () => {
    test('Пользовательский пароль успешно хешируется', async () => {
      const result = await auth.getHash(testPassword);
      expect(result.hash).not.toBeUndefined();
      expect(result.salt).not.toBeUndefined();
    });
    test('Правильный переданный пароль успешно сравнивается с хешем', async () => {
      const hashedInfo = await auth.getHash(testPassword);
      const result = await auth.compare(testPassword, hashedInfo);
      expect(result).toBeTruthy();
    });
    test('Генерация пароля', async () => {
      const result = await auth.genPassword(8);
      expect(result).toMatch(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[$%#&@*])[a-zA-Z$#%&@*\d]{8,}$/);
    });
  });
});
