import { createApiClient } from './createApiClient';

const adminApi = createApiClient({ forceRefreshToken: true });

export default adminApi;
