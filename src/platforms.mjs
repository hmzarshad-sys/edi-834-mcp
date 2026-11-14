// Copyright (c) 2026 Humza Arshad. MIT License (see LICENSE).
//
// Source systems ("platforms") that produce 834 files. A platform can add:
//   hints    where to fix each validator rule in that system (one entry per rule)
//   profile  validation defaults for files from that system (a carrier profile overrides them)
//
// To add a system: write src/<system>.mjs exporting its hints (and profile, if
// any), register it below, and run npm test: the platform tests check that
// every validator rule has a hint.

import { WORKDAY_HINTS } from './workday.mjs';
import { EN_HINTS, EN_PROFILE } from './employee-navigator.mjs';

export const PLATFORMS = {
  generic: {
    label: 'Any system',
    system: null,
    hints: null,
    profile: {},
  },
  workday_ccb_834_v2: {
    label: 'Workday CCB 834 V2',
    system: 'Workday',
    hints: WORKDAY_HINTS,
    profile: {},
  },
  employee_navigator: {
    label: 'Employee Navigator',
    system: 'Employee Navigator',
    hints: EN_HINTS,
    profile: EN_PROFILE,
  },
};

export const PLATFORM_IDS = Object.keys(PLATFORMS);

export function platformHint(platform, rule) {
  return PLATFORMS[platform]?.hints?.[rule] || null;
}

// Carrier profile settings win over the platform's defaults.
export function platformProfile(platform, profile = {}) {
  return { ...(PLATFORMS[platform]?.profile || {}), ...profile };
}

// Adds where_to_fix to each finding when the platform has hints.
export function withFixLocations(findings, platform) {
  if (!PLATFORMS[platform]?.hints) return findings;
  return findings.map(f => ({ ...f, where_to_fix: platformHint(platform, f.rule) }));
}
