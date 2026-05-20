'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import PricingForm from '../components/PricingForm';

export default function EditPricingPage() {
  const params = useParams<{ id: string }>();
  return <PricingForm pricingId={params.id} />;
}
