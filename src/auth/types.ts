import type React from 'react';

export interface AccessGateProps {
  /** O app (`AppContent`): só é montado com pessoa entrada e papel conhecido. */
  app: React.ReactNode;
}
