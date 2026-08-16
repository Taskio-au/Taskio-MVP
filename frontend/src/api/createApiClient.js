import axios from 'axios';
import { auth } from '../firebase';
import { getE2EAuthUser } from '../e2e/authBypass';
import { resolveApiBaseUrl } from '../config/apiBaseUrl';

export const API_BASE_URL = resolveApiBaseUrl(process.env);

export function createApiClient({ forceRefreshToken = false } = {}) {
  const client = axios.create({ baseURL: API_BASE_URL });

  client.interceptors.request.use(async (config) => {
    const user = auth.currentUser || getE2EAuthUser();
    if (!user) return config;

    const token = await user.getIdToken(forceRefreshToken);
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
    return config;
  });

  return client;
}
