import React, { createContext, useCallback, useContext, useState } from 'react';

interface PhotoNavigationContextValue {
  resetKey: number;
  triggerReset: () => void;
}

const PhotoNavigationContext = createContext<PhotoNavigationContextValue>({
  resetKey: 0,
  triggerReset: () => {},
});

export function PhotoNavigationProvider({ children }: { children: React.ReactNode }) {
  const [resetKey, setResetKey] = useState(0);
  const triggerReset = useCallback(() => setResetKey(k => k + 1), []);

  return (
    <PhotoNavigationContext.Provider value={{ resetKey, triggerReset }}>
      {children}
    </PhotoNavigationContext.Provider>
  );
}

export function usePhotoNavigation() {
  return useContext(PhotoNavigationContext);
}
