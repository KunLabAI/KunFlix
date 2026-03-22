import { getEffectiveTime, formatTimeAgo, sortTheatersByEffectiveTime } from '../timeUtils';

describe('timeUtils', () => {
  describe('getEffectiveTime', () => {
    it('should return updated_at if present', () => {
      const theater = { created_at: '2023-01-01T00:00:00Z', updated_at: '2023-01-02T00:00:00Z' };
      expect(getEffectiveTime(theater)).toBe('2023-01-02T00:00:00Z');
    });

    it('should return created_at if updated_at is null', () => {
      const theater = { created_at: '2023-01-01T00:00:00Z', updated_at: null };
      expect(getEffectiveTime(theater)).toBe('2023-01-01T00:00:00Z');
    });
  });

  describe('formatTimeAgo', () => {
    const now = new Date('2023-10-10T12:00:00Z');

    it('should return "刚刚" for time within 60 seconds', () => {
      const date = new Date(now.getTime() - 30 * 1000).toISOString();
      expect(formatTimeAgo(date, now)).toBe('刚刚');
    });

    it('should return "X分钟前" for time within 60 minutes', () => {
      const date = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
      expect(formatTimeAgo(date, now)).toBe('5分钟前');
    });

    it('should return "X小时前" for time within 24 hours', () => {
      const date = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();
      expect(formatTimeAgo(date, now)).toBe('3小时前');
    });

    it('should return "X天前" for time within 30 days', () => {
      const date = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
      expect(formatTimeAgo(date, now)).toBe('5天前');
    });
  });

  describe('sortTheatersByEffectiveTime', () => {
    it('should sort theaters by effective time descending', () => {
      const theaters = [
        { id: '1', created_at: '2023-01-01T00:00:00Z', updated_at: null }, // effective: Jan 1
        { id: '2', created_at: '2023-01-02T00:00:00Z', updated_at: null }, // effective: Jan 2
        { id: '3', created_at: '2022-12-01T00:00:00Z', updated_at: '2023-01-03T00:00:00Z' }, // effective: Jan 3
      ];

      const sorted = sortTheatersByEffectiveTime(theaters);
      expect(sorted[0].id).toBe('3');
      expect(sorted[1].id).toBe('2');
      expect(sorted[2].id).toBe('1');
    });
  });
});
