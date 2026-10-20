import { useState } from 'react';
import Icon from '../../icons/Icon.jsx';
import SocialAuthButtons from '../../components/SocialAuthButtons.jsx';
import OtpStepCard from '../../components/OtpStepCard.jsx';
import KycConsentStep from '../../components/KycConsentStep.jsx';
import { useAppDispatch } from '../../context/AppContext.jsx';
import { useShowToast } from '../../hooks/useToast.js';
import { useTranslation } from '../../hooks/useTranslation.js';
import { useOtpChannel } from '../../hooks/useOtpChannel.js';
import { isValidEmail, isValidMobile, isValidPassword } from '../../lib/utils.js';
import { isEmailAvailable } from '../../services/authApi.js';
import { completeRegistration } from '../../services/authService.js';
import { sendMobileOtp, verifyMobileOtp } from '../../services/mockOtpService.js';
import { sendEmailOtp, verifyEmailOtp } from '../../services/mockEmailService.js';

const EMPTY_FORM = { firstName: '', lastName: '', phone: '', email: '', city: '', password: '', confirmPassword: '' };

export default function RegisterFlow() {
  const dispatch = useAppDispatch();
  const showToast = useShowToast();
  const { t } = useTranslation();

  const [step, setStep] = useState('form'); // form | verifyMobile | verifyEmail | kyc | success
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [createdUser, setCreatedUser] = useState(null);

  const mobileOtp = useOtpChannel({ sendFn: sendMobileOtp, verifyFn: verifyMobileOtp });
  const emailOtp = useOtpChannel({ sendFn: sendEmailOtp, verifyFn: verifyEmailOtp });

  function updateField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function validateForm() {
    const errors = {};
    if (!form.firstName.trim()) errors.firstName = t('register.errors.firstNameRequired');
    if (!form.lastName.trim()) errors.lastName = t('register.errors.lastNameRequired');
    if (!form.phone.trim()) errors.phone = t('register.errors.mobileRequired');
    else if (!isValidMobile(form.phone)) errors.phone = t('register.errors.mobileInvalid');
    if (!form.email.trim()) errors.email = t('register.errors.emailRequired');
    else if (!isValidEmail(form.email)) errors.email = t('register.errors.emailInvalid');
    if (!form.city.trim()) errors.city = t('register.errors.cityRequired');
    if (!isValidPassword(form.password)) errors.password = t('register.errors.passwordTooShort');
    else if (form.password !== form.confirmPassword) errors.confirmPassword = t('register.errors.passwordsMismatch');
    return errors;
  }

  async function handleFormSubmit(e) {
    e.preventDefault();
    const errors = validateForm();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    // Checked on the server before the OTP steps, so a taken email is caught
    // up front. Sign-up itself checks again.
    try {
      if (!(await isEmailAvailable(form.email))) {
        setFieldErrors({ email: t('toast.emailInUse') });
        return;
      }
    } catch {
      showToast(t('toast.serverUnavailable'));
      return;
    }
    setStep('verifyMobile');
  }

  async function handleKycApproved(kycStatus) {
    try {
      const welcomeSubject = t('register.welcomeHeading', { name: form.firstName.trim() });
      const welcomeBody = t('register.welcomeBody');
      const profile = await completeRegistration({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        city: form.city.trim(),
        password: form.password,
        kycStatus,
        welcomeSubject,
        welcomeBody,
      });
      setCreatedUser(profile);
      setStep('success');
      showToast(t('toast.accountCreated'));
    } catch (err) {
      if (err.message === 'email-in-use') {
        setFieldErrors({ email: t('toast.emailInUse') });
        setStep('form');
      } else {
        showToast(t('toast.serverUnavailable'));
      }
    }
  }

  function handleGoToProfile() {
    dispatch({ type: 'SET_USER', payload: createdUser });
  }

  // --- Step: form -------------------------------------------------------
  if (step === 'form') {
    return (
      <>
        <div className="auth-intro">
          <h2>{t('register.formTitle')}</h2>
          <p>{t('register.formSubtitle')}</p>
        </div>

        <form onSubmit={handleFormSubmit}>
          <label className="field-label">{t('register.firstNameLabel')}</label>
          <input
            className="field-input"
            type="text"
            placeholder={t('register.firstNamePlaceholder')}
            value={form.firstName}
            onChange={(e) => updateField('firstName', e.target.value)}
          />
          {fieldErrors.firstName && <p className="field-error">{fieldErrors.firstName}</p>}

          <label className="field-label">{t('register.lastNameLabel')}</label>
          <input
            className="field-input"
            type="text"
            placeholder={t('register.lastNamePlaceholder')}
            value={form.lastName}
            onChange={(e) => updateField('lastName', e.target.value)}
          />
          {fieldErrors.lastName && <p className="field-error">{fieldErrors.lastName}</p>}

          <label className="field-label">{t('register.mobileLabel')}</label>
          <input
            className="field-input"
            type="tel"
            maxLength={10}
            placeholder={t('register.mobilePlaceholder')}
            value={form.phone}
            onChange={(e) => updateField('phone', e.target.value)}
          />
          {fieldErrors.phone && <p className="field-error">{fieldErrors.phone}</p>}

          <label className="field-label">{t('register.emailLabel')}</label>
          <input
            className="field-input"
            type="email"
            placeholder={t('register.emailPlaceholder')}
            value={form.email}
            onChange={(e) => updateField('email', e.target.value)}
          />
          {fieldErrors.email && <p className="field-error">{fieldErrors.email}</p>}

          <label className="field-label">{t('register.cityLabel')}</label>
          <input
            className="field-input"
            type="text"
            placeholder={t('register.cityPlaceholder')}
            value={form.city}
            onChange={(e) => updateField('city', e.target.value)}
          />
          {fieldErrors.city && <p className="field-error">{fieldErrors.city}</p>}

          <label className="field-label">{t('register.passwordLabel')}</label>
          <input
            className="field-input"
            type="password"
            placeholder={t('register.passwordPlaceholder')}
            value={form.password}
            onChange={(e) => updateField('password', e.target.value)}
          />
          {fieldErrors.password && <p className="field-error">{fieldErrors.password}</p>}

          <label className="field-label">{t('register.confirmPasswordLabel')}</label>
          <input
            className="field-input"
            type="password"
            placeholder={t('register.confirmPasswordPlaceholder')}
            value={form.confirmPassword}
            onChange={(e) => updateField('confirmPassword', e.target.value)}
          />
          {fieldErrors.confirmPassword && <p className="field-error">{fieldErrors.confirmPassword}</p>}

          <button className="book-btn" type="submit">
            {t('register.submitButton')}
          </button>
        </form>

        <SocialAuthButtons />
      </>
    );
  }

  // --- Steps: verifyMobile / verifyEmail / kyc (shared progress header) --
  if (step === 'verifyMobile' || step === 'verifyEmail' || step === 'kyc') {
    const mobileDone = step === 'verifyEmail' || step === 'kyc';
    const emailDone = step === 'kyc';
    return (
      <>
        <div className="auth-intro">
          <h2>{t('register.verifyHeading')}</h2>
          <p>{t('register.verifySubheading')}</p>
        </div>

        <div className={`menu-row ${mobileDone ? 'done' : step === 'verifyMobile' ? 'active' : ''}`}>
          <div className="menu-row-left">
            <Icon name={mobileDone ? 'check' : 'phone'} />
            <span>{t('register.stepMobile')}</span>
          </div>
        </div>
        <div className={`menu-row ${emailDone ? 'done' : step === 'verifyEmail' ? 'active' : ''}`}>
          <div className="menu-row-left">
            <Icon name={emailDone ? 'check' : 'mail'} />
            <span>{t('register.stepEmail')}</span>
          </div>
        </div>
        <div className={`menu-row ${step === 'kyc' ? 'active' : ''}`} style={{ marginBottom: 20 }}>
          <div className="menu-row-left">
            <Icon name="shield" />
            <span>{t('kyc.stepLabel')}</span>
          </div>
        </div>

        {step === 'verifyMobile' && (
          <OtpStepCard
            channel="mobile"
            destination={form.phone.trim()}
            otp={mobileOtp}
            onVerified={() => setStep('verifyEmail')}
            onChangeDestination={() => setStep('form')}
          />
        )}
        {step === 'verifyEmail' && (
          <OtpStepCard
            channel="email"
            destination={form.email.trim()}
            otp={emailOtp}
            onVerified={() => setStep('kyc')}
            onChangeDestination={() => setStep('form')}
          />
        )}
        {step === 'kyc' && <KycConsentStep onApproved={handleKycApproved} />}
      </>
    );
  }

  // --- Step: success ------------------------------------------------------
  return (
    <>
      <div className="confirm-check">
        <Icon name="checkBig" />
      </div>
      <div className="auth-intro">
        <h2>{t('register.successTitle')}</h2>
      </div>
      <div className="bio-text" style={{ textAlign: 'center' }}>
        <b>{t('register.welcomeHeading', { name: createdUser?.firstName || form.firstName.trim() })}</b>
        <br />
        <br />
        {t('register.welcomeBody')}
      </div>
      <button className="book-btn" onClick={handleGoToProfile}>
        {t('register.goToProfile')}
      </button>
    </>
  );
}
