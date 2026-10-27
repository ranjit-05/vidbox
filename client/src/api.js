const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
export const TOKEN_STORAGE_KEY = 'reelbox_token';
export const getToken = () => localStorage.getItem(TOKEN_STORAGE_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_STORAGE_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_STORAGE_KEY);

export async function api(path, options = {}) {
  const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}), ...options.headers };
  let response;
  try { response = await fetch(`${API}${path}`, { ...options, headers }); }
  catch { throw new Error('Could not reach Vidbox. Check that the server is running.'); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'That didn’t work. Please try again.');
  return result;
}
