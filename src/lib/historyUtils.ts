import type { HistoryEntry } from '@/types/history';

export const HISTORY_STORAGE_KEY = 'rewritex_history';

export function saveHistoryEntryToLocalStorage(entry: HistoryEntry): void {
  try {
    const existingHistory = loadHistoryFromLocalStorage();
    const updatedHistory = [entry, ...existingHistory];
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updatedHistory));
  } catch (error) {
    console.error('Error saving history entry:', error);
  }
}

export function loadHistoryFromLocalStorage(): HistoryEntry[] {
  try {
    const history = localStorage.getItem(HISTORY_STORAGE_KEY);
    return history ? JSON.parse(history) : [];
  } catch (error) {
    console.error('Error loading history:', error);
    return [];
  }
}

export function deleteHistoryEntry(id: string): void {
  try {
    const existingHistory = loadHistoryFromLocalStorage();
    const updatedHistory = existingHistory.filter(entry => entry.id !== id);
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updatedHistory));
  } catch (error) {
    console.error('Error deleting history entry:', error);
  }
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
  } catch (error) {
    console.error('Error clearing history:', error);
  }
} 