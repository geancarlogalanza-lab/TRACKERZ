interface Section<T extends string> {
  id: T
  label: string
  /** A quiet number after the label: things waiting here, not a score. */
  count?: number
}

interface SectionNavProps<T extends string> {
  /** Names the group for screen readers, e.g. "College". */
  label: string
  sections: Section<T>[]
  value: T
  onChange: (id: T) => void
}

/**
 * The sections of an area (College: Tasks · Calendar · Streaks; Reading:
 * Capture · Review · Library), as the same segmented control the app uses
 * everywhere. It sits at the start of each screen's toolbar.
 */
export function SectionNav<T extends string>({ label, sections, value, onChange }: SectionNavProps<T>) {
  return (
    <nav className="tabs" role="tablist" aria-label={label}>
      {sections.map((section) => (
        <button
          key={section.id}
          type="button"
          role="tab"
          className="tab"
          aria-selected={value === section.id}
          onClick={() => onChange(section.id)}
        >
          {section.label}
          {section.count ? <span className="tab__count">{section.count}</span> : null}
        </button>
      ))}
    </nav>
  )
}
