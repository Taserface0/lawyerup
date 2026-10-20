import { useEffect, useRef, useState } from 'react';
import Icon from '../icons/Icon.jsx';
import { useTranslation } from '../hooks/useTranslation.js';

/**
 * @param {'mobile'|'email'} channel
 * @param {string} destination - phone digits or email address being verified
 * @param {object} otp - the object returned by useOtpChannel()
 * @param {() => void} onVerified - called once the code is confirmed correct
 * @param {() => void} onChangeDestination - "change number/email" link handler
 */
export default function OtpStepCard({ channel, destination, otp, onVerified, onChangeDestination }) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const hasAutoSent = useRef(false);

  // Auto-send the code the moment this step mounts, so the user isn't
  // stuck looking at an empty input waiting to click "send" first.
  //
  // The `hasAutoSent` ref (not a state/closure check) is deliberate: React
  // 18 StrictMode fires effects twice in development to surface missing
  // cleanup. Both invocations share the same closure, so checking
  // `otp.status === 'idle'` sees the same stale value both times and would
  // fire two separate sends — generating two different mock codes back to
  // back, with the second silently overwriting the first in the mock
  // store. A ref survives that double-invoke and correctly gates it to one
  // real send.
  useEffect(() => {
    if (!hasAutoSent.current) {
      hasAutoSent.current = true;
      otp.send(destination);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (otp.status === 'verified') {
      onVerified();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp.status]);

  async function handleVerify() {
    if (code.trim().length < 4) return;
    await otp.verify(destination, code);
  }

  const sentNoteKey = channel === 'mobile' ? 'otpStep.sentToMobile' : 'otpStep.sentToEmail';
  const changeLinkKey = channel === 'mobile' ? 'otpStep.changeMobile' : 'otpStep.changeEmail';
  const isBusy = otp.status === 'sending' || otp.status === 'verifying';

  return (
    <>
      <div className="auth-icon-badge" style={{ marginTop: 8 }}>
        <Icon name={channel === 'mobile' ? 'phone' : 'mail'} />
      </div>

      <p className="otp-note" style={{ textAlign: 'center' }}>
        {t(sentNoteKey, { value: destination })}
      </p>
      <div className="disclaimer" style={{ marginBottom: 18 }}>
        <Icon name="info" />
        <span>{t('otpStep.mockNotice')}</span>
      </div>

      <label className="field-label">{t('otpStep.codeLabel')}</label>
      <input
        className="field-input"
        type="tel"
        maxLength={6}
        placeholder="••••"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      {otp.errorKey && (otp.errorKey === 'wrongCode' || otp.errorKey === 'expiredCode') && (
        <p className="field-error">{t(`otpStep.${otp.errorKey}`)}</p>
      )}

      <button className="book-btn" onClick={handleVerify} disabled={isBusy || code.trim().length < 4}>
        {otp.status === 'verifying' ? t('otpStep.verifying') : t('otpStep.verifyButton')}
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
        <button className="link-btn" onClick={onChangeDestination}>
          {t(changeLinkKey)}
        </button>
        <button
          className="link-btn"
          disabled={!otp.canResend}
          style={{ opacity: otp.canResend ? 1 : 0.5, cursor: otp.canResend ? 'pointer' : 'default' }}
          onClick={() => otp.send(destination)}
        >
          {otp.canResend
            ? otp.status === 'sending'
              ? t('otpStep.sending')
              : t('otpStep.resendButton')
            : t('otpStep.resendIn', { seconds: otp.resendSecondsLeft })}
        </button>
      </div>
    </>
  );
}
