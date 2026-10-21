import { createContext, useContext, useEffect, useReducer, useRef } from 'react';
import { loadSession, saveSession, clearSession } from '../services/mockAuthStore.js';
import { fetchCurrentUser, signOut } from '../services/authApi.js';
import { refreshServerData, resetServerData, connectLiveUpdates, DATA_EVENT, DATA_ERROR_EVENT } from '../services/serverData.js';
import { translations } from '../i18n/index.js';

// How often screens re-check the server for changes made elsewhere (another
// browser, the other party) when the live-update stream isn't connected.
// While it is connected, they still re-check every LIVE_POLL_EVERY ticks
// (60 s) as a safety net.
const DATA_POLL_MS = 10_000;
const LIVE_POLL_EVERY = 6;

const initialState = {
  screen: 'home', // home | chat | lawyers | bookings | profile
  filterCat: 'all',
  user: null, // hydrated from localStorage on first load — see the lazy init below
  theme: 'light', // light | dark
  // Phase 2: consultation-type + resolved location, shared between the
  // Lawyers list screen and the lawyer-profile booking modal so a choice
  // made in one place carries into the other without re-asking.
  consultationType: 'online', // 'online' | 'in_person' — online is the safe default: it never touches location
  // null | { source:'gps'|'manual', city, lat?, lng? }. lat/lng are only
  // ever present when source is 'gps', live ONLY in this in-memory context
  // (never written to localStorage — see the persistence effect below,
  // which only ever mirrors `user`), and exist purely so THIS client's own
  // Lawyers list can sort by distance. The privacy boundary is enforced at
  // the write site, not here: mockAppointmentStore.js's bookSlot() (and the server)
  // only accepts a `city` string, and BookingCheckoutModal.jsx only ever
  // reads `.city` off this object — the lat/lng never reaches anything
  // shared/durable (an Appointment/Case), so a lawyer can never see them.
  locationQuery: null,
  // Phase 3: which case's consultation screen is currently open (drill-down
  // navigation, not a bottom-nav tab — same pattern as filterCat driving
  // LawyersScreen).
  activeCaseId: null,
  // Which nav-tab screen navigated INTO the consultation (e.g. 'bookings',
  // 'messages', 'lawyerAppointments', 'lawyerClients') — lets BottomNav
  // keep the correct parent tab highlighted while screen==='consultation',
  // and lets ConsultationScreen's back button return to the true origin
  // instead of a hardcoded default. Deliberately a separate action from
  // SET_ACTIVE_CASE (not folded into its payload) so every existing
  // dispatch site's shape stays exactly as it was; each just gains one
  // extra dispatch call, consistent with how they already fire two in
  // sequence (SET_ACTIVE_CASE + SET_SCREEN). Not persisted to localStorage
  // — same as activeCaseId, this is intentionally session-only for now.
  activeCaseOrigin: null,
  // No seeded welcome message here — it's rendered from the translation
  // dictionary in ChatScreen instead, so it re-renders in the right
  // language and never gets sent to the API as fake conversation history.
  chatMessages: [],
  chatBusy: false,
  lang: 'en', // language CODE, not display label — see src/i18n/index.js
  modal: { type: null, payload: null },
  toast: { message: '', id: 0 },
  // Bumped whenever the server data copy (services/serverData.js) changes, so
  // every screen re-renders and re-reads lawyers, slots, bookings and cases.
  dataVersion: 0,
};

// NOTE: appointments/bookings are no longer part of this in-memory reducer
// — they moved to services/mockAppointmentStore.js (localStorage-backed,
// readable by both the client and lawyer "sides" of the app). Screens read
// them directly (getAppointmentsForClient/getAppointmentsForLawyer) rather
// than through context, the same way AdminScreen already reads lawyer
// applications directly from mockLawyerStore.js. See BookingsScreen.jsx.

function reducer(state, action) {
  switch (action.type) {
    case 'SET_SCREEN':
      return { ...state, screen: action.payload };
    case 'SET_FILTER_CAT':
      return { ...state, filterCat: action.payload };
    case 'SET_USER':
      return { ...state, user: action.payload };
    case 'LOGOUT':
      return { ...state, user: null };
    case 'SET_THEME':
      return { ...state, theme: action.payload };
    case 'SET_CONSULTATION_TYPE':
      return { ...state, consultationType: action.payload };
    case 'SET_LOCATION_QUERY':
      return { ...state, locationQuery: action.payload };
    case 'SET_ACTIVE_CASE':
      return { ...state, activeCaseId: action.payload };
    case 'SET_ACTIVE_CASE_ORIGIN':
      return { ...state, activeCaseOrigin: action.payload };
    case 'ADD_CHAT_MESSAGE':
      return { ...state, chatMessages: [...state.chatMessages, action.payload] };
    case 'SET_CHAT_BUSY':
      return { ...state, chatBusy: action.payload };
    case 'SET_LANG':
      return { ...state, lang: action.payload };
    case 'OPEN_MODAL':
      return { ...state, modal: action.payload };
    case 'CLOSE_MODAL':
      return { ...state, modal: { type: null, payload: null } };
    case 'SHOW_TOAST':
      return { ...state, toast: action.payload };
    case 'DATA_SYNCED':
      return { ...state, dataVersion: state.dataVersion + 1 };
    default:
      return state;
  }
}

// Lazy init reads any previously-saved mock session exactly once, so a
// page refresh keeps the person signed in. See services/mockAuthStore.js —
// this reads only safe profile fields (name/phone/email/city), never a
// password.
//
// The restored screen must match the restored user's role: without this,
// a refreshed lawyer session would hydrate with the hardcoded client
// 'home' screen (a key that isn't even in the lawyer's nav), showing the
// client Home screen's content underneath the lawyer's dashboard nav bar
// with no tab highlighted. Defaulting a restored lawyer to their
// dashboard keeps the nav and the visible screen in sync from the very
// first render.
// Theme and language are per-device preferences, so they persist across
// reloads too (they used to reset to light/English on every refresh).
const PREFS_KEY = 'lawyerup_prefs';

function loadPrefs() {
  try {
    const prefs = JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
    return {
      theme: prefs.theme === 'dark' ? 'dark' : 'light',
      lang: ['en', 'hi', 'hinglish'].includes(prefs.lang) ? prefs.lang : 'en',
    };
  } catch {
    return {};
  }
}

function init() {
  const restoredUser = loadSession();
  const initialScreen = restoredUser?.role === 'lawyer' ? 'lawyerAppointments' : initialState.screen;
  return { ...initialState, ...loadPrefs(), user: restoredUser, screen: initialScreen };
}

const AppStateContext = createContext(null);
const AppDispatchContext = createContext(null);

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState, init);

  // Keep the document theme attribute (used by the dark-theme CSS block) in sync.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.theme);
  }, [state.theme]);

  // Screen readers and browser translation rely on <html lang>; it used to
  // stay "en" even while the whole UI was in Hindi.
  useEffect(() => {
    document.documentElement.setAttribute('lang', state.lang === 'hi' ? 'hi' : state.lang === 'hinglish' ? 'hi-Latn' : 'en');
  }, [state.lang]);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ theme: state.theme, lang: state.lang }));
    } catch {
      // storage unavailable (private mode) — preferences just won't persist
    }
  }, [state.theme, state.lang]);

  // Mirror the logged-in user to localStorage so the first render after a
  // refresh shows the right screen (display data only; the server cookie is
  // what proves the session). When a session ends, however it ended (Sign
  // out, account deleted), end it on the server too, so
  // a reload can't bring it back, and only then reload the data.
  const previousUserRef = useRef(state.user);
  useEffect(() => {
    if (state.user) saveSession(state.user);
    else clearSession();
    const previous = previousUserRef.current;
    previousUserRef.current = state.user;
    if (previous && !state.user) {
      signOut()
        .catch(() => {})
        .finally(() => refreshServerData().catch(() => {}));
    }
  }, [state.user]);

  // Accounts live on the server: confirm the cached profile (or pick up a
  // session this browser doesn't have cached) and refresh it, e.g. a KYC
  // change or a lawyer application being approved.
  useEffect(() => {
    const cached = loadSession();
    fetchCurrentUser()
      .then((user) => {
        // Someone signed in or out while this was loading: theirs wins.
        if (previousUserRef.current?.email !== cached?.email) return;
        if (user) {
          dispatch({ type: 'SET_USER', payload: user });
          // A lawyer session with nothing cached started on the client Home
          // screen; open their dashboard instead, as init() does for a cached one.
          if (!cached && user.role === 'lawyer') dispatch({ type: 'SET_SCREEN', payload: 'lawyerAppointments' });
        } else if (cached) dispatch({ type: 'LOGOUT' });
      })
      .catch(() => {
        // Server unreachable: keep the cached profile; actions that need the
        // server will report the problem themselves.
      });
  }, []);

  // Lawyers, availability, bookings and cases come from the server
  // (services/serverData.js). Re-render on every change, and show a toast
  // when the server refuses one (the copy has already been put back).
  const langRef = useRef(state.lang);
  langRef.current = state.lang;
  useEffect(() => {
    const onData = () => dispatch({ type: 'DATA_SYNCED' });
    const onError = () => {
      const message = (translations[langRef.current] || translations.en).toast.actionFailed;
      dispatch({ type: 'SHOW_TOAST', payload: { message, id: Date.now() } });
    };
    window.addEventListener(DATA_EVENT, onData);
    window.addEventListener(DATA_ERROR_EVENT, onError);
    return () => {
      window.removeEventListener(DATA_EVENT, onData);
      window.removeEventListener(DATA_ERROR_EVENT, onError);
    };
  }, []);

  // Reload whenever the signed-in account changes (what you may see depends
  // on it), then keep it fresh. Signed in, the live-update stream
  // (Server-Sent Events) brings changes from the other person straight away;
  // polling is the fallback for when it can't connect, and a slow safety net
  // when it can. Signing out closes the stream.
  const userKey = state.user ? `${state.user.role}:${state.user.email}` : '';
  const firstLoadRef = useRef(true);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'hidden') refreshServerData().catch(() => {});
    };
    // After a sign-out, the sign-out effect above reloads once the server
    // session is gone; until then, drop the private data.
    if (userKey || firstLoadRef.current) refresh();
    else resetServerData();
    firstLoadRef.current = false;
    const live = userKey ? connectLiveUpdates() : null;
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
      if (!live?.isOpen() || ticks % LIVE_POLL_EVERY === 0) refresh();
    }, DATA_POLL_MS);
    window.addEventListener('focus', refresh);
    return () => {
      live?.close();
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [userKey]);

  return (
    <AppStateContext.Provider value={state}>
      <AppDispatchContext.Provider value={dispatch}>{children}</AppDispatchContext.Provider>
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within an AppProvider');
  return ctx;
}

export function useAppDispatch() {
  const ctx = useContext(AppDispatchContext);
  if (!ctx) throw new Error('useAppDispatch must be used within an AppProvider');
  return ctx;
}
