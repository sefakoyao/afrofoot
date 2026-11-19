'use client';

import type { SelectHTMLAttributes } from 'react';

/** A select that saves its form as soon as a choice is made (the form still has a button for when scripts are off). */
export function AutoSubmitSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
