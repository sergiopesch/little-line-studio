// Closing the picker or selecting another language invalidates older requests.
export function createLatestLanguageRequest() {
  let version = 0;
  return {
    cancel() { version++; },
    async run(load, { onStart, onSuccess, onError }) {
      const current = ++version;
      onStart();
      try {
        const value = await load();
        if (current !== version) return false;
        onSuccess(value);
        return true;
      } catch (error) {
        if (current !== version) return false;
        onError(error);
        return false;
      }
    },
  };
}
