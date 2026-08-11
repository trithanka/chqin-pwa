export default function StepHeader({ eyebrow, title, body }) {
  return (
    <header className="mb-8">
      {eyebrow && (
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-brand">
          {eyebrow}
        </p>
      )}
      <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.03em] text-slate-900 text-balance">
        {title}
      </h1>
      {body && (
        <p className="mt-2.5 max-w-[52ch] text-[14.5px] leading-relaxed text-slate-500">{body}</p>
      )}
    </header>
  )
}
