// Auto-save and recovery logic
import { saveState, loadState } from '../utils/storage';

export function autoSave(key: string, data: any, interval = 5000) {
  setInterval(() => {
    saveState(key, data());
  }, interval);
}

export function recoverState(key: string) {
  return loadState(key);
}
