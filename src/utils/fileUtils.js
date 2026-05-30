import fs from 'fs/promises';
import path from 'path';
import { config } from '../config/index.js';

export async function savePhotoFile(photoBuffer, cameraId, isFire) {
  const dir = config.uploadsDir;
  await fs.mkdir(dir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeId = cameraId.replace(/[:\/]/g, '_');
  const prefix = isFire ? 'FIRE_' : 'photo_';
  const filename = `${prefix}${safeId}_${timestamp}.jpg`;
  const filepath = path.join(dir, filename);
  await fs.writeFile(filepath, photoBuffer);
  console.log(`📸 Сохранено: ${filename} (${photoBuffer.length} байт)`);
  return filename;
}