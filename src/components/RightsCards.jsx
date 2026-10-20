import { useTranslation } from '../hooks/useTranslation.js';

export default function RightsCards() {
  const { t } = useTranslation();
  // t() can resolve to an array too — used here for the localized card list.
  const cards = t('rights');

  return (
    <div>
      {cards.map((r) => (
        <div className="rights-card" key={r.title}>
          <b>{r.title}</b>
          <span>{r.sub}</span>
        </div>
      ))}
    </div>
  );
}
