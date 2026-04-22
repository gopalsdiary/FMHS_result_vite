import type { User } from '@supabase/supabase-js'
import { supabase } from '@/services/supabaseClient'

/**
 * Returns the currently authenticated user, or null if not signed in.
 * If redirectIfNotAuth is true (default), saves the current path to
 * sessionStorage and navigates to /login so React Router can pick it up.
 */
export async function checkAuth(redirectIfNotAuth = true): Promise<User | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user && redirectIfNotAuth) {
      const currentPath = window.location.pathname
      sessionStorage.setItem('redirectUrl', currentPath)
      window.location.replace('/login')
      return null
    }

    return user
  } catch (error) {
    console.error('Auth check error:', error)
    return null
  }
}

/** Saves all named form fields to localStorage under storageKey. */
export function saveFormData(formId: string, storageKey?: string): void {
  const form = document.getElementById(formId) as HTMLFormElement | null
  if (!form) {
    console.warn(`Form with ID '${formId}' not found`)
    return
  }

  const key = storageKey ?? formId
  const data: Record<string, string | string[]> = {}

  const formData = new FormData(form)
  for (const [k, v] of formData.entries()) {
    if (typeof v === 'string') {
      const existing = data[k]
      if (existing !== undefined) {
        data[k] = Array.isArray(existing) ? [...existing, v] : [existing as string, v]
      } else {
        data[k] = v
      }
    }
  }

  form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
    'input, select, textarea',
  ).forEach(field => {
    if (field.id && data[field.id] === undefined) {
      if (field instanceof HTMLInputElement && (field.type === 'checkbox' || field.type === 'radio')) {
        if (field.checked) data[field.id] = field.value
      } else {
        data[field.id] = field.value
      }
    }
  })

  localStorage.setItem(key, JSON.stringify(data))
}

/** Restores named form fields from localStorage. */
export function restoreFormData(formId: string, storageKey?: string): void {
  const form = document.getElementById(formId) as HTMLFormElement | null
  if (!form) return

  const key = storageKey ?? formId
  const saved = localStorage.getItem(key)
  if (!saved) return

  try {
    const data = JSON.parse(saved) as Record<string, string | string[]>

    form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      'input, select, textarea',
    ).forEach(field => {
      if (!field.id || data[field.id] === undefined) return
      const value = data[field.id]

      if (field instanceof HTMLInputElement && (field.type === 'checkbox' || field.type === 'radio')) {
        field.checked = value === field.value || value === 'on'
      } else if (field instanceof HTMLSelectElement && field.multiple) {
        const values = Array.isArray(value) ? value : [value]
        Array.from(field.options).forEach(opt => { opt.selected = values.includes(opt.value) })
      } else {
        field.value = Array.isArray(value) ? value[0] : value
      }
    })

    form.dispatchEvent(new Event('formDataRestored', { bubbles: true }))
  } catch (err) {
    console.error('Error restoring form data:', err)
  }
}

/** Removes saved form data from localStorage. */
export function clearFormData(storageKey: string): void {
  localStorage.removeItem(storageKey)
}

/** Signs the user out and redirects to the requested login page. */
export async function handleLogout(redirectAfterLogin?: string, loginPath = '/login'): Promise<void> {
  try {
    const target = redirectAfterLogin ?? window.location.pathname
    sessionStorage.setItem('redirectUrl', target)
    await supabase.auth.signOut()
    window.location.replace(loginPath)
  } catch (error) {
    console.error('Logout error:', error)
    window.location.replace(loginPath)
  }
}
