import { 
  HistoryEntry, 
  HistoryOptions,
  HISTORY_STORAGE_KEY, 
  MAX_HISTORY_ENTRIES,
  SummaryFormat,
  TargetAudience,
  RewriteGoal
} from '../types/history';

/**
 * Checks if localStorage is available and accessible.
 * @returns {boolean} True if localStorage is available, false otherwise.
 */
const isLocalStorageAvailable = (): boolean => {
  try {
    // Check if window and localStorage exist
    if (typeof window === 'undefined' || !window.localStorage) {
      return false;
    }
    // Try to use localStorage to catch potential SecurityErrors
    const testKey = '__localStorageTest__';
    localStorage.setItem(testKey, testKey);
    localStorage.removeItem(testKey);
    return true;
  } catch (e) {
    // Log security errors or other access issues
    console.warn(`[historyUtils] localStorage is not available or accessible:`, e);
    return false;
  }
};

/**
 * Validates a history entry to ensure it has the required structure.
 * @param entry The entry to validate
 * @returns {boolean} True if the entry is valid, false otherwise
 */
const isValidHistoryEntry = (entry: unknown): entry is HistoryEntry => {
  if (!entry || typeof entry !== 'object') return false;
  
  const e = entry as Partial<HistoryEntry>;
  
  // Check required fields
  if (
    typeof e.id !== 'string' ||
    typeof e.timestamp !== 'number' ||
    typeof e.inputText !== 'string' ||
    typeof e.outputText !== 'string' ||
    typeof e.mode !== 'string' ||
    !['summarize', 'rewrite'].includes(e.mode) ||
    !e.options ||
    typeof e.options !== 'object'
  ) {
    return false;
  }

  const options = e.options as Partial<HistoryOptions>;

  // Validate common options
  if (
    !options.targetAudience ||
    !['general', 'simple', 'expert'].includes(options.targetAudience) ||
    !options.tone ||
    !['formal', 'casual', 'creative'].includes(options.tone) ||
    typeof options.summaryLengthLevel !== 'number' ||
    options.summaryLengthLevel < 1 ||
    options.summaryLengthLevel > 5
  ) {
    return false;
  }

  // Validate mode-specific options
  if (e.mode === 'summarize') {
    return !options.summaryFormat || ['paragraph', 'bullet-points'].includes(options.summaryFormat);
  } else {
    return !options.rewriteGoal || ['maintain-length', 'make-shorter'].includes(options.rewriteGoal);
  }
};

/**
 * Retrieves history entries from localStorage.
 * @returns {HistoryEntry[]} Array of history entries
 */
export const getHistoryFromLocalStorage = (): HistoryEntry[] => {
  if (!isLocalStorageAvailable()) {
    console.warn('[historyUtils] localStorage is not available');
    return [];
  }

  try {
    const historyJson = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!historyJson) return [];

    const history = JSON.parse(historyJson) as unknown[];
    return history.filter(isValidHistoryEntry);
  } catch (e) {
    console.error('[historyUtils] Error reading history from localStorage:', e);
    return [];
  }
};

/**
 * Saves a history entry to localStorage.
 * @param entry The history entry to save
 * @returns {boolean} True if the save was successful, false otherwise
 */
export const saveHistoryEntryToLocalStorage = (entry: HistoryEntry): boolean => {
  if (!isLocalStorageAvailable()) {
    console.warn('[historyUtils] localStorage is not available');
    return false;
  }

  try {
    const history = getHistoryFromLocalStorage();
    
    // Add new entry at the beginning
    history.unshift(entry);
    
    // Keep only the most recent entries
    const trimmedHistory = history.slice(0, MAX_HISTORY_ENTRIES);
    
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(trimmedHistory));
    return true;
  } catch (e) {
    if (e instanceof Error && e.name === 'QuotaExceededError') {
      console.warn('[historyUtils] localStorage quota exceeded');
      // Try to save by removing oldest entries
      try {
        const history = getHistoryFromLocalStorage();
        history.pop(); // Remove oldest entry
        history.unshift(entry);
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
        return true;
      } catch (retryError) {
        console.error('[historyUtils] Failed to save after quota exceeded:', retryError);
        return false;
      }
    }
    console.error('[historyUtils] Error saving to localStorage:', e);
    return false;
  }
};

/**
 * Clears all history entries from localStorage.
 * @returns {boolean} True if the clear was successful, false otherwise
 */
export const clearHistoryFromLocalStorage = (): boolean => {
  if (!isLocalStorageAvailable()) {
    console.warn('[historyUtils] localStorage is not available');
    return false;
  }

  try {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
    return true;
  } catch (e) {
    console.error('[historyUtils] Error clearing history from localStorage:', e);
    return false;
  }
}; 