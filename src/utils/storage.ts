// Local persistent storage utility using IndexedDB
export function saveState(key: string, value: any) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function loadState(key: string) {
  const value = localStorage.getItem(key);
  return value ? JSON.parse(value) : null;
}

export function clearState(key: string) {
  localStorage.removeItem(key);
}
