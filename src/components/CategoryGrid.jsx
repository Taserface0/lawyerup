import { CATEGORIES } from '../data/categories.js';
import Icon from '../icons/Icon.jsx';
import { useAppDispatch } from '../context/AppContext.jsx';
import { useTranslation } from '../hooks/useTranslation.js';

export default function CategoryGrid() {
  const dispatch = useAppDispatch();
  const { t } = useTranslation();

  function openCategory(slug) {
    dispatch({ type: 'SET_FILTER_CAT', payload: slug });
    dispatch({ type: 'SET_SCREEN', payload: 'lawyers' });
  }

  return (
    <div className="cat-grid">
      {CATEGORIES.slice(0, 7).map((c) => (
        <div className="cat-card" key={c.slug} onClick={() => openCategory(c.slug)}>
          <div className="cat-icon">
            <Icon name={c.icon} />
          </div>
          <b>{t(`category.${c.slug}`)}</b>
        </div>
      ))}
    </div>
  );
}
