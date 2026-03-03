// Polyfill for window.storage which seems to be from a custom environment
if (!window.storage) {
  window.storage = {
    get: (key) => {
      const v = localStorage.getItem(key);
      return Promise.resolve(v ? { value: v } : null);
    },
    set: (key, val) => {
      localStorage.setItem(key, val);
      return Promise.resolve();
    }
  };
}
