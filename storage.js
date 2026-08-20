(function initializeStorageAdapter(global) {
  function createStorageAdapter(storage, onFailure = () => {}) {
    const reportedOperations = new Set();

    function reportOnce(operation, key, error) {
      const reportKey = `${operation}:${key}`;
      if (reportedOperations.has(reportKey)) return;
      reportedOperations.add(reportKey);
      onFailure({ operation, key, error });
    }

    return Object.freeze({
      get(key, fallback = null) {
        try {
          const value = storage.getItem(key);
          return value === null ? fallback : value;
        } catch (error) {
          reportOnce('read', key, error);
          return fallback;
        }
      },

      getJSON(key, fallback) {
        const value = this.get(key);
        if (value === null) return fallback;
        try {
          return JSON.parse(value);
        } catch (error) {
          reportOnce('parse', key, error);
          return fallback;
        }
      },

      set(key, value) {
        try {
          storage.setItem(key, value);
          return true;
        } catch (error) {
          reportOnce('write', key, error);
          return false;
        }
      },

      remove(key) {
        try {
          storage.removeItem(key);
          return true;
        } catch (error) {
          reportOnce('remove', key, error);
          return false;
        }
      }
    });
  }

  global.createStorageAdapter = createStorageAdapter;
  global.STORAGE = createStorageAdapter(global.localStorage, detail => {
    if (typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function') {
      global.dispatchEvent(new global.CustomEvent('storageerror', { detail }));
    }
  });
})(globalThis);