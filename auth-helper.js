/**
 * Auth Helper for Result Processing System
 * Handles authentication checks, redirects, and form data persistence
 */

// Initialize Supabase client
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = 'https://rtfefxghfbtirfnlbucb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0ZmVmeGdoZmJ0aXJmbmxidWNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA1MDg3OTcsImV4cCI6MjA1NjA4NDc5N30.fb7_myCmFzbV7WPNjFN_NEl4z0sOmRCefnkQbk6c10w';
const supabase = createClient(supabaseUrl, supabaseKey)

/**
 * Check if user is authenticated
 * If not, store current page URL and redirect to login
 * @param {boolean} redirectIfNotAuth - Whether to redirect to login if not authenticated (default: true)
 * @returns {Promise<Object>} User object if authenticated, null otherwise
 */
export async function checkAuth(redirectIfNotAuth = true) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user && redirectIfNotAuth) {
      // Store current page URL for redirect after login
      const currentPage = window.location.pathname.split('/').pop() || 'result_dashboard.html'
      sessionStorage.setItem('redirectUrl', currentPage)
      
      // Add a small delay before redirect to allow any pending operations to complete
      setTimeout(() => {
        window.location.href = 'login.html'
      }, 100)
      
      return null
    }
    
    return user
  } catch (error) {
    console.error('Auth check error:', error)
    return null
  }
}

/**
 * Save form data to localStorage
 * @param {string} formId - The form element ID
 * @param {string} storageKey - The localStorage key to save under (default: formId)
 */
export function saveFormData(formId, storageKey = null) {
  const form = document.getElementById(formId)
  if (!form) {
    console.warn(`Form with ID '${formId}' not found`)
    return
  }
  
  const key = storageKey || formId
  const formData = new FormData(form)
  const data = {}
  
  // Convert FormData to object
  for (let [key, value] of formData.entries()) {
    // Handle multiple values for the same key (e.g., checkboxes)
    if (data[key]) {
      if (Array.isArray(data[key])) {
        data[key].push(value)
      } else {
        data[key] = [data[key], value]
      }
    } else {
      data[key] = value
    }
  }
  
  // Also capture input values that might not be in FormData
  form.querySelectorAll('input, select, textarea').forEach(field => {
    if (field.id && !data[field.id]) {
      if (field.type === 'checkbox' || field.type === 'radio') {
        if (field.checked) {
          data[field.id] = field.value
        }
      } else {
        data[field.id] = field.value
      }
    }
  })
  
  localStorage.setItem(key, JSON.stringify(data))
  console.log(`Form data saved to localStorage under key: ${key}`)
}

/**
 * Restore form data from localStorage
 * @param {string} formId - The form element ID
 * @param {string} storageKey - The localStorage key to restore from (default: formId)
 */
export function restoreFormData(formId, storageKey = null) {
  const form = document.getElementById(formId)
  if (!form) {
    console.warn(`Form with ID '${formId}' not found`)
    return
  }
  
  const key = storageKey || formId
  const savedData = localStorage.getItem(key)
  
  if (!savedData) {
    console.log(`No saved data found for key: ${key}`)
    return
  }
  
  try {
    const data = JSON.parse(savedData)
    
    // Restore all form fields
    form.querySelectorAll('input, select, textarea').forEach(field => {
      if (field.id && data[field.id] !== undefined) {
        const value = data[field.id]
        
        if (field.type === 'checkbox' || field.type === 'radio') {
          field.checked = (value === field.value || value === 'on')
        } else if (field.type === 'select-multiple') {
          const values = Array.isArray(value) ? value : [value]
          Array.from(field.options).forEach(option => {
            option.selected = values.includes(option.value)
          })
        } else {
          field.value = value
        }
      }
    })
    
    console.log(`Form data restored from localStorage key: ${key}`)
    
    // Trigger change events to update any dependent fields
    form.dispatchEvent(new Event('formDataRestored', { bubbles: true }))
  } catch (error) {
    console.error('Error restoring form data:', error)
  }
}

/**
 * Clear saved form data
 * @param {string} storageKey - The localStorage key to clear
 */
export function clearFormData(storageKey) {
  localStorage.removeItem(storageKey)
  console.log(`Form data cleared from localStorage key: ${storageKey}`)
}

/**
 * Auto-save form data on field changes
 * @param {string} formId - The form element ID
 * @param {string} storageKey - The localStorage key to save under (default: formId)
 */
export function enableAutoSave(formId, storageKey = null) {
  const form = document.getElementById(formId)
  if (!form) {
    console.warn(`Form with ID '${formId}' not found`)
    return
  }
  
  const key = storageKey || formId
  
  // Auto-save on input change
  form.addEventListener('change', () => {
    saveFormData(formId, key)
  })
  
  console.log(`Auto-save enabled for form: ${formId}`)
}

/**
 * Handle logout with optional redirect URL storage
 * @param {string} redirectAfterLogin - URL to redirect to after login (optional)
 */
export async function handleLogout(redirectAfterLogin = null) {
  try {
    if (redirectAfterLogin) {
      sessionStorage.setItem('redirectUrl', redirectAfterLogin)
    } else {
      const currentPage = window.location.pathname.split('/').pop() || 'result_dashboard.html'
      sessionStorage.setItem('redirectUrl', currentPage)
    }
    
    await supabase.auth.signOut()
    
    // Small delay before redirect
    setTimeout(() => {
      window.location.href = 'login.html'
    }, 100)
  } catch (error) {
    console.error('Logout error:', error)
    window.location.href = 'login.html'
  }
}

/**
 * Create a logout button with built-in functionality
 * @param {string} containerId - The ID of the container to add button to
 * @param {string} redirectAfterLogin - URL to redirect to after login (optional)
 * @returns {HTMLElement} The logout button element
 */
export function createLogoutButton(containerId, redirectAfterLogin = null) {
  const container = document.getElementById(containerId)
  if (!container) {
    console.warn(`Container with ID '${containerId}' not found`)
    return null
  }
  
  const button = document.createElement('button')
  button.id = 'logoutBtn'
  button.textContent = 'Sign out'
  button.style.cssText = 'margin-left: 8px; padding: 4px 8px; background: #e74c3c; color: #fff; border: 0; border-radius: 4px; cursor: pointer;'
  
  button.addEventListener('click', () => {
    handleLogout(redirectAfterLogin)
  })
  
  container.appendChild(button)
  return button
}

export { supabase }
