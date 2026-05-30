import { authService } from '../services/authService.js';

export function requireAuth(req, res, next) {
  const token = req.headers['x-auth-token'];
  const user = authService.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Требуется авторизация' });
  }
  req.user = user;
  next();
}