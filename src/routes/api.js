import express from 'express';
import { authController } from '../controllers/authController.js';
import { eventController } from '../controllers/eventController.js';
import { cameraController } from '../controllers/cameraController.js';
import { systemController } from '../controllers/systemController.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Авторизация
router.post('/login', authController.login);
router.get('/check-session', authController.checkSession);
router.post('/logout', authController.logout);

// События
router.get('/events', eventController.getEvents);
router.delete('/events/:id', requireAuth, eventController.deleteEvent);

// Камеры (информационные)
router.get('/camera-models', cameraController.getModels);
router.get('/camera-types', cameraController.getTypes);
router.get('/camera-stats', cameraController.getStats);

// Справочники
router.get('/addresses', systemController.getAddresses);
router.get('/departments', systemController.getDepartments);

export default router;