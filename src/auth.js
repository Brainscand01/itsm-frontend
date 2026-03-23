const STORAGE_KEY = "itsm_auth";

export function saveAuth(token, user) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }));
}

export function clearAuth() {
  localStorage.removeItem(STORAGE_KEY);
}

export function getToken() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return data?.token || null;
  } catch {
    return null;
  }
}

export function getUser() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return data?.user || null;
  } catch {
    return null;
  }
}

export function isLoggedIn() {
  const token = getToken();
  if (!token) return false;
  // Check JWT expiry (payload is base64 middle segment)
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export function logout() {
  clearAuth();
  window.location.reload();
}
