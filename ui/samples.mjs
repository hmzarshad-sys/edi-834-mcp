// Copyright (c) 2026 Humza Arshad. MIT License (see LICENSE).
//
// Sample files for the UI, built from the test fixture builder.
// Every person, ID and number here is fictional.

import { build834, SUBSCRIBER, DEPENDENT } from '../test/fixtures/build834.mjs';

const SPOUSE = DEPENDENT({ name: ['Doe', 'Alex'], rel: '01', dob: '19860320', gender: 'U' });

export const SAMPLES = {
  clean: {
    label: 'Clean file',
    name: 'sample-clean.834',
    text: () => build834(),
  },
  errors: {
    label: 'File with errors',
    name: 'sample-with-errors.834',
    text: () => build834({
      seCountDelta: -2,
      members: [
        SUBSCRIBER(),
        DEPENDENT({ dob: '20151331' }),
        SUBSCRIBER({
          sub: 'EMP1002', name: ['Lee', 'Chris'], ssn: '000121234',
          ins: ['Y', '18', '024', '08', 'A', '', '', 'TE'],
          coverages: [{ hd: ['024', '', 'DEN', 'DEN-BASIC', 'EMP'], begin: '20250101' }],
        }),
        DEPENDENT({ sub: 'EMP9999', name: ['Park', 'Ana'], rel: '01' }),
      ],
    }),
  },
  previous: {
    label: 'Last month (full file)',
    name: 'sample-previous-full.834',
    text: () => build834({ action: '4', members: [SUBSCRIBER(), SPOUSE, DEPENDENT()] }),
  },
  current: {
    label: 'This month (full file)',
    name: 'sample-current-full.834',
    text: () => build834({
      action: '4',
      bgnDate: '20260205',
      members: [
        SUBSCRIBER({ coverages: [{ hd: ['001', '', 'HLT', 'PPO-GOLD', 'ECH'], begin: '20260101' }] }),
        DEPENDENT(),
      ],
    }),
  },
};
