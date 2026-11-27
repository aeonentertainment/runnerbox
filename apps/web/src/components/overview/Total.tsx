// One of a page's headline figures: a quiet label, the figure, and a line under it, with `why`
// explaining that line on hover.
export function Total({ label, value, under, why }: { label: string; value: string; under: string | null; why?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-semibold text-[28px] leading-tight tracking-tight">{value}</div>
      {under ? (
        <div className="text-muted-foreground/75 text-xs" title={why}>
          {under}
        </div>
      ) : null}
    </div>
  );
}
