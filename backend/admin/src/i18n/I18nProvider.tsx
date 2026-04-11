'use client';

import React, { useEffect } from 'react';
import { I18nextProvider } from 'react-i18next';
import i18n from './index';

export default function I18nProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const saved = localStorage.getItem('admin-i18n-lang');
    saved && i18n.language !== saved && i18n.changeLanguage(saved);
  }, []);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
