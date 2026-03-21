import api from './api';

describe('API Interceptors', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('Request Interceptor', () => {
    it('should attach Authorization header when access_token exists', () => {
      localStorage.setItem('access_token', 'fake_token');
      
      const config: any = { headers: { set: jest.fn() } };
      const requestHandler = (api.interceptors.request as any).handlers[0].fulfilled;
      
      const result = requestHandler(config);
      
      expect(config.headers.set).toHaveBeenCalledWith('Authorization', 'Bearer fake_token');
      expect(result).toBe(config);
    });

    it('should not attach Authorization header when missing', () => {
      const config: any = { headers: { set: jest.fn() } };
      const requestHandler = (api.interceptors.request as any).handlers[0].fulfilled;
      
      const result = requestHandler(config);
      
      expect(config.headers.set).not.toHaveBeenCalled();
      expect(result).toBe(config);
    });
  });

  describe('Response Interceptor', () => {
    it('should reject without refresh if status is not 401', async () => {
      const errorHandler = (api.interceptors.response as any).handlers[0].rejected;
      const error = { response: { status: 403 }, config: { url: '/theaters' } };
      await expect(errorHandler(error)).rejects.toEqual(error);
    });

    it('should clear storage if no refresh token', async () => {
      const errorHandler = (api.interceptors.response as any).handlers[0].rejected;
      const error = { response: { status: 401 }, config: { url: '/theaters' } };
      
      localStorage.setItem('access_token', 'old_token');
      
      // Since window.location assignment throws in jsdom without proper mocking,
      // we catch it and just check if localStorage was cleared.
      try {
        await errorHandler(error);
      } catch (e) {
        // Expected to throw error or redirect
      }
      
      expect(localStorage.getItem('access_token')).toBeNull();
    });
  });
});
