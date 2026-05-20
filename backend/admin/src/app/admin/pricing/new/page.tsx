'use client';

import React from 'react';
import { useSearchParams } from 'next/navigation';
import PricingForm from '../components/PricingForm';

export default function NewPricingPage() {
  const params = useSearchParams();
  const initialProviderId = params.get('provider_id') || undefined;
  const initialModel = params.get('model') || undefined;

  return <PricingForm initialProviderId={initialProviderId} initialModel={initialModel} />;
}
