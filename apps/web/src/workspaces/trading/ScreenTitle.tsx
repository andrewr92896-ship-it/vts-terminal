import { EditableText } from '../../copy/SiteCopy';

// The section title for a Trading screen header. Every Trading screen rendered
// its title with the exact same inline <h2> style; this keeps that one
// definition in a single place. The `id` stays per-screen so admins can reword
// each title live (see EditableText / Admin ▸ Site Wording).
export function ScreenTitle({ id, children }: { id: string; children: string }) {
  return (
    <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>
      <EditableText id={id}>{children}</EditableText>
    </h2>
  );
}
