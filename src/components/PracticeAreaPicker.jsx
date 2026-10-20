import { CATEGORIES } from '../data/categories.js';
import { useTranslation } from '../hooks/useTranslation.js';

/**
 * @param {string[]} value - selected category slugs
 * @param {(next: string[]) => void} onChange
 */
export default function PracticeAreaPicker({ value, onChange }) {
  const { t } = useTranslation();

  function toggle(slug) {
    if (value.includes(slug)) onChange(value.filter((s) => s !== slug));
    else onChange([...value, slug]);
  }

  return (
    <div className="quick-chips" style={{ marginBottom: 16 }}>
      {CATEGORIES.map((c) => (
        <div
          key={c.slug}
          className={`filter-chip ${value.includes(c.slug) ? 'active' : ''}`}
          onClick={() => toggle(c.slug)}
        >
          {t(`category.${c.slug}`)}
        </div>
      ))}
    </div>
  );
}
