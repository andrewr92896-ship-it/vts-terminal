import { Editor } from './Editor';
import { Files } from './Files';
import { ViewSite } from './ViewSite';
import { Settings } from './Settings';

/**
 * The Site Editor workspace — vitalistradingsystems.com, edited from here.
 *
 * Founder-level only (auth/access.ts), one lazy chunk (Portal.tsx). The three
 * screens are the portfolio admin's three, brought across: the editor, the
 * site as it will look, and the uploads the site can link to.
 */
export function SiteWorkspace({ screen }: { screen: string; onNavigate?: (key: string) => void }) {
  switch (screen) {
    case 'site_editor':
      return <Editor />;
    case 'site_view':
      return <ViewSite />;
    case 'site_files':
      return <Files />;
    case 'site_settings':
      return <Settings />;
    default:
      return null;
  }
}
