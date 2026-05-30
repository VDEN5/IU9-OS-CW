import { systemRepository } from '../database/repositories/systemRepository.js';

export const systemService = {
  getCameraModels: () => systemRepository.getCameraModels(),
  getCameraTypes: () => systemRepository.getCameraTypes(),
  getAddresses: () => systemRepository.getAddresses(),
  getDepartments: () => systemRepository.getDepartments(),
};