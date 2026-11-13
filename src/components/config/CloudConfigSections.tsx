import React from 'react';
import { DevicesSection } from './DevicesSection';
import { PhotoSpaceSection } from './PhotoSpaceSection';
import { RecoverySection } from './RecoverySection';
import { UsersSection } from './UsersSection';

// Seções da Config que só existem no modo nuvem (só o Dono). A `ConfigPage` carrega este arquivo por `import()` preguiçoso,
// então o bundle do modo arquivo não puxa `src/auth` nem o supabase-js.

const CloudConfigSections: React.FC = () => (
  <>
    <UsersSection />
    <DevicesSection />
    <PhotoSpaceSection />
    <RecoverySection />
  </>
);

export default CloudConfigSections;
