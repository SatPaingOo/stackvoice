/**
 * Every address and time limit the browser code uses, in one place, so no
 * component hardcodes an endpoint.
 */
export const ENDPOINTS = {
  apps: '/console/api/apps',
  inspect: '/console/api/inspect',
  secrets: '/console/api/secrets',
  shortcuts: '/console/api/shortcuts',
  shortcutTry: '/console/api/shortcuts/try',
  tools: '/console/api/tools',
  settings: '/console/api/settings',
  login: '/console/api/login',
  signin: '/console/signin',
} as const;

export const TIMEOUTS = {
  /** An ordinary read or save. */
  requestMs: 15_000,
  /** Looking at a GitHub repository tries several paths, each with its own server-side timeout. */
  inspectMs: 45_000,
} as const;
