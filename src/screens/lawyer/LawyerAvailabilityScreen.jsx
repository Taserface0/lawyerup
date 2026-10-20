import { useState } from 'react';
import Icon from '../../icons/Icon.jsx';
import { useAppState, useAppDispatch } from '../../context/AppContext.jsx';
import { useShowToast } from '../../hooks/useToast.js';
import { useTranslation } from '../../hooks/useTranslation.js';
import {
  getAvailabilityForLawyer,
  createAvailabilitySlot,
  removeAvailabilitySlot,
  markDayUnavailable,
  markSlotAvailable,
  generateTimeOptions,
  formatSlotDateLabel,
  groupSlotsByDate,
} from '../../services/mockAvailabilityStore.js';
import { getAppointmentById } from '../../services/mockAppointmentStore.js';
import { getCaseByAppointmentId } from '../../services/mockCaseStore.js';
import { getClientAccountByEmail } from '../../services/mockAuthStore.js';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function dateLabel(dateISO, t) {
  const label = formatSlotDateLabel(dateISO);
  if (label.type === 'today') return t('availability.today');
  if (label.type === 'tomorrow') return t('availability.tomorrow');
  return label.label;
}

export default function LawyerAvailabilityScreen() {
  const { user } = useAppState();
  const dispatch = useAppDispatch();
  const showToast = useShowToast();
  const { t } = useTranslation();

  const [date, setDate] = useState(todayISO());
  const [startTime, setStartTime] = useState(generateTimeOptions()[0]);
  const [consultationType, setConsultationType] = useState('online');
  const [, setRefreshTick] = useState(0);

  const slots = user ? getAvailabilityForLawyer(user.id) : [];
  const timeOptions = generateTimeOptions();
  const groups = groupSlotsByDate(slots);

  function handleAddSlot(e) {
    e.preventDefault();
    const created = createAvailabilitySlot({ lawyerId: user.id, date, startTime, consultationType });
    if (!created) {
      showToast(t('availability.duplicateSlot'));
      return;
    }
    showToast(t('availability.slotAdded'));
    setRefreshTick((tick) => tick + 1);
  }

  function handleRemove(slotId) {
    const ok = removeAvailabilitySlot(slotId);
    if (!ok) {
      showToast(t('availability.cannotRemoveBooked'));
      return;
    }
    setRefreshTick((tick) => tick + 1);
  }

  function handleMarkDayUnavailable(dateISO) {
    markDayUnavailable(user.id, dateISO);
    setRefreshTick((tick) => tick + 1);
  }

  function handleReactivate(slotId) {
    markSlotAvailable(slotId);
    setRefreshTick((tick) => tick + 1);
  }

  function openBookedSlotConsultation(slot) {
    if (!slot.appointmentId) return;
    const caseRecord = getCaseByAppointmentId(slot.appointmentId);
    if (!caseRecord) return;
    dispatch({ type: 'SET_ACTIVE_CASE_ORIGIN', payload: 'lawyerAppointments' });
    dispatch({ type: 'SET_ACTIVE_CASE', payload: caseRecord.caseId });
    dispatch({ type: 'SET_SCREEN', payload: 'consultation' });
  }

  return (
    <div className="screen active">
      <button
        className="link-btn"
        style={{ display: 'block', margin: '16px 0 10px' }}
        onClick={() => dispatch({ type: 'SET_SCREEN', payload: 'lawyerProfile' })}
      >
        {t('consultation.backLink')}
      </button>

      <div className="section-label tight">
        {t('availability.title')}
      </div>

      <div className="location-card" style={{ marginBottom: 16 }}>
        <div className="location-card-head">
          <Icon name="plus" />
          <div>
            <b>{t('availability.addSlotTitle')}</b>
          </div>
        </div>

        <form onSubmit={handleAddSlot}>
          <label className="field-label">{t('availability.dateLabel')}</label>
          <input
            className="field-input"
            type="date"
            min={todayISO()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />

          <label className="field-label">{t('availability.timeLabel')}</label>
          <select className="field-input" value={startTime} onChange={(e) => setStartTime(e.target.value)}>
            {timeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>

          <label className="field-label">{t('consultation.chooseType')}</label>
          <div className="seg-control" style={{ width: '100%', marginBottom: 16 }}>
            <div
              className={`seg-btn ${consultationType === 'online' ? 'active' : ''}`}
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => setConsultationType('online')}
            >
              <Icon name="chat" /> {t('consultation.online')}
            </div>
            <div
              className={`seg-btn ${consultationType === 'in_person' ? 'active' : ''}`}
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => setConsultationType('in_person')}
            >
              <Icon name="pin" /> {t('consultation.inPerson')}
            </div>
          </div>

          <button className="book-btn" type="submit">
            {t('availability.addSlotButton')}
          </button>
        </form>
      </div>

      <div className="section-label tight">{t('availability.existingTitle')}</div>

      {groups.length === 0 ? (
        <div className="empty-state">
          <Icon name="calendar" />
          <p>{t('availability.noSlots')}</p>
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.date} style={{ marginBottom: 18 }}>
            <div className="section-label tight" style={{ marginBottom: 8 }}>
              <span>{dateLabel(group.date, t)}</span>
              <span className="link" onClick={() => handleMarkDayUnavailable(group.date)}>
                {t('availability.markDayUnavailable')}
              </span>
            </div>

            {group.slots.map((slot) => {
              const typeLabel = slot.consultationType === 'in_person' ? t('consultation.inPerson') : t('consultation.online');
              const statusKey = slot.status.toLowerCase();
              const badgeClass = statusKey === 'unavailable' ? 'pending' : statusKey === 'booked' ? 'completed' : 'confirmed';
              let clientLine = null;
              if (slot.status === 'BOOKED' && slot.appointmentId) {
                const appointment = getAppointmentById(slot.appointmentId);
                const clientAccount = appointment ? getClientAccountByEmail(appointment.clientId) : null;
                clientLine = clientAccount?.name || appointment?.clientId || null;
              }

              return (
                <div
                  className="booking-card"
                  key={slot.id}
                  onClick={slot.status === 'BOOKED' ? () => openBookedSlotConsultation(slot) : undefined}
                  style={{ cursor: slot.status === 'BOOKED' ? 'pointer' : 'default' }}
                >
                  <div className="booking-top">
                    <b>
                      {slot.startTime} · {typeLabel}
                    </b>
                    <span className={`status-tag status-${badgeClass}`}>{t(`availability.status.${statusKey}`)}</span>
                  </div>
                  {clientLine && <div className="lw-tags">{t('availability.bookedBy', { name: clientLine })}</div>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    {slot.status !== 'BOOKED' && (
                      <button
                        className="reco-btn"
                        style={{ background: 'var(--danger-tint)', color: 'var(--danger)' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemove(slot.id);
                        }}
                      >
                        <Icon name="trash" /> {t('availability.removeSlot')}
                      </button>
                    )}
                    {slot.status === 'UNAVAILABLE' && (
                      <button
                        className="reco-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReactivate(slot.id);
                        }}
                      >
                        {t('availability.reactivateSlot')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
