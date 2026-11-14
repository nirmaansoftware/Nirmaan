/** The Nirmaan pixel-N mark (same 5×5 grid as the public site's logo). */
export function Logo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 5 5" aria-hidden="true" focusable="false" shapeRendering="crispEdges">
      <path d="M0 0h1v5H0zM4 0h1v5H4zM1 1h1v1H1zM2 2h1v1H2zM3 3h1v1H3z" />
    </svg>
  );
}
