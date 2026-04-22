import adminEmailCsv from '../../admin_email.csv?raw'

export const ADMIN_LOGIN_PATH = '/login'
export const TEACHER_LOGIN_PATH = '/login-teacher'
export const ADMIN_DASHBOARD_PATH = '/dashboard'
export const TEACHER_DASHBOARD_PATH = '/teacher-dashboard'
export const TEACHER_RESULT_ENTRY_PATH = '/result-entry'
export const ADMIN_RESULT_ENTRY_PATH = '/result-entry-admin'

const teacherOnlyPaths = new Set([
  TEACHER_LOGIN_PATH,
  TEACHER_DASHBOARD_PATH,
  TEACHER_RESULT_ENTRY_PATH,
])

function parseAdminEmails(csv: string): Set<string> {
  const lines = csv
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  if (lines.length <= 1) return new Set()

  return new Set(
    lines
      .slice(1)
      .map(line => line.split(',')[0] ?? '')
      .map(email => normalizeEmail(email))
      .filter(Boolean),
  )
}

const adminEmails = parseAdminEmails(adminEmailCsv)

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase()
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return adminEmails.has(normalizeEmail(email))
}

export function getPostLoginRedirect(email: string | null | undefined, requestedRedirect: string | null): string {
  const redirect = (requestedRedirect ?? '').trim()

  if (isAdminEmail(email)) {
    if (redirect && !teacherOnlyPaths.has(redirect) && redirect !== ADMIN_LOGIN_PATH) return redirect
    return ADMIN_DASHBOARD_PATH
  }

  if (redirect === TEACHER_RESULT_ENTRY_PATH || redirect === TEACHER_DASHBOARD_PATH) return redirect
  return TEACHER_DASHBOARD_PATH
}