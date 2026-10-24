import { api } from './api';

export interface CurrentUser {
  uid: string;
  pseudo: string;
  displayName: string | null;
  avatar: string | null;
  banner: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  verified: boolean;
  totpEnabled: boolean;
  createdAt: number;
  role: 'user' | 'moderator' | 'admin';
  status: 'active' | 'suspended' | 'banned';
  suspendedUntil: number | null;
  statusReason: string | null;
  /* Codes de secours de la double authentification. */
  recoveryCodesLeft: number;
  /* Clés de récupération du compte (mot de passe oublié). */
  recoveryKeysLeft: number;
  /* Le compte n'a pas encore enregistré ses clés : pop-up bloquante. */
  recoveryNoticePending: boolean;
  /* Ancien compte (avait une adresse e-mail, supprimée) : la pop-up explique le changement. */
  legacyNotice: boolean;
  /* L'assistant d'onboarding reste à faire (nouveaux comptes uniquement). */
  onboardingDone: boolean;
}

export async function login(pseudo: string, password: string, code?: string, captchaToken?: string) {
  return api.post<{ uid: string; pseudo: string }>('/auth/login', { pseudo, password, code, captchaToken });
}

export async function register(pseudo: string, password: string, captchaToken?: string, ageConfirmed = false) {
  return api.post<{ uid: string; pseudo: string }>('/auth/register', {
    pseudo,
    password,
    captchaToken,
    ageConfirmed,
  });
}

export async function logout() {
  return api.post('/auth/logout');
}

/* L'assistant d'onboarding a été terminé ou fermé : il ne réapparaîtra plus. */
export async function completeOnboarding() {
  return api.post('/auth/onboarded');
}

export async function getMe() {
  return api.get<CurrentUser>('/auth/me');
}
