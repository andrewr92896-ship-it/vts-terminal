
// The section title for a Trading screen header. Every Trading screen rendered
// its title with the exact same inline <h2> style; this keeps that one
// definition in a single place.
export function ScreenTitle({ children }: { children: string }) {
  return (
    <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>
      {children}
    </h2>
  );
}
