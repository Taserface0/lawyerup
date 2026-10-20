export function capitalize(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function isValidMobile(phone) {
  // Indian mobile numbers are 10 digits and start with 6, 7, 8 or 9.
  return /^[6-9]\d{9}$/.test(phone.trim());
}

export function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 8;
}

export function initials(name) {
  return name
    .replace('Adv. ', '')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
