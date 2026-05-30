import { eventService } from '../services/eventService.js';
import { authService } from '../services/authService.js';

export const eventController = {
  async getEvents(req, res) {
    const { limit = 100, cameraId, type, fire } = req.query;
    const isFire = fire === 'true' ? true : (fire === 'false' ? false : null);
    const events = await eventService.getHistory({
      limit: parseInt(limit),
      cameraId,
      eventType: type,
      isFire,
    });
    res.json({ success: true, events });
  },

  async deleteEvent(req, res) {
    const token = req.headers['x-auth-token'];
    const user = authService.getUserByToken(token);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Не авторизован' });
    }
    const eventId = parseInt(req.params.id);
    if (isNaN(eventId)) {
      return res.status(400).json({ success: false, error: 'Неверный ID' });
    }
    const result = await eventService.deleteEvent(eventId, user);
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(403).json({ success: false, error: result.error });
    }
  },
};