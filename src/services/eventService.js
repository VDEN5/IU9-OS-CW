import { eventRepository } from '../database/repositories/eventRepository.js';

const EVENT_TYPES = {
  fire: { ru: '🔥 ПОЖАР', severity: 10 },
  connection: { ru: '✅ ПОДКЛЮЧЕНИЕ', severity: 1 },
  disconnection: { ru: '❌ ОТКЛЮЧЕНИЕ', severity: 2 },
  message: { ru: '💬 СООБЩЕНИЕ', severity: 0 },
  photo_request: { ru: '📸 ЗАПРОС ФОТО', severity: 3 },
  photo_upload: { ru: '📸 ПОЛУЧЕНО ФОТО', severity: 3 },
  system: { ru: '⚙️ СИСТЕМА', severity: 5 },
};

export const eventService = {
  async saveEvent(cameraId, eventType, options = {}) {
    const typeInfo = EVENT_TYPES[eventType] || { severity: 0 };
    return eventRepository.save(cameraId, eventType, {
      ...options,
      severity: typeInfo.severity,
    });
  },

  async getHistory({ limit = 100, offset = 0, cameraId, eventType, isFire }) {
    return eventRepository.getHistory({ limit, offset, cameraId, eventType, isFire });
  },

  async deleteEvent(eventId, currentUser) {
    const events = await eventRepository.getHistory({ limit: 1, offset: 0, cameraId: null });
    const event = events.find(e => e.id == eventId);
    if (!event) return { success: false, error: 'Событие не найдено' };

    if (!event.camera_id) {
      if (currentUser.login !== 'admin' && !currentUser.position?.includes('Admin')) {
        return { success: false, error: 'Нет прав на удаление системного события' };
      }
    } else {
      const cameraDeptTin = await eventRepository.getCameraDepartmentTin(event.camera_id);
      if (currentUser.department_tin !== cameraDeptTin) {
        return { success: false, error: 'Нет прав на удаление этого события' };
      }
    }
    const deleted = await eventRepository.deleteById(eventId);
    return { success: deleted, error: deleted ? null : 'Событие не найдено' };
  },
};