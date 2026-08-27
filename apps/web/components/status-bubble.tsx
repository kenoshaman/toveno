type StatusBubbleProps = {
  live: boolean;
  status: string;
  error?: string | null;
};

export function StatusBubble({ live, status, error }: StatusBubbleProps) {
  const tone = error ? "error" : live ? "live" : "idle";

  return (
    <div
      className="status-bubble-toggle sketchy-round"
      data-tooltip={error ?? status}
      aria-label={`Status: ${error ?? status}`}
      tabIndex={0}
    >
      <span className="status-dot" data-tone={tone} aria-hidden />
    </div>
  );
}
