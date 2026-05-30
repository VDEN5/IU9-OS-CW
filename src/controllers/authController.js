import { authService } from '../services/authService.js';
import { eventService } from '../services/eventService.js';

export const authController = {
  async login(req, res) {
    const { login, password } = req.body;
    const result = await authService.login(login, password);
    if (result) {
      await eventService.saveEvent('system', 'system', {
        message: `Пользователь ${result.user.name} вошел в систему`,
      });
      res.json({ success: true, user: result.user, token: result.token });
    } else {
      res.status(401).json({ success: false, error: 'Неверный логин или пароль' });
    }
  },

  checkSession(req, res) {
    const token = req.headers['x-auth-token'];
    const user = authService.getUserByToken(token);
    if (user) {
      res.json({ success: true, user: { name: user.name, position: user.position } });
    } else {
      res.json({ success: false });
    }
  },

  async logout(req, res) {
    const token = req.headers['x-auth-token'];
    const user = authService.logout(token);
    if (user) {
      await eventService.saveEvent('system', 'system', {
        message: `Пользователь ${user.name} вышел из системы`,
      });
    }
    res.json({ success: true });
  },
};