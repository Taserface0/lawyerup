import { useAppDispatch } from '../context/AppContext.jsx';

export function useShowToast() {
  const dispatch = useAppDispatch();
  return (message) => {
    dispatch({ type: 'SHOW_TOAST', payload: { message, id: Date.now() } });
  };
}
