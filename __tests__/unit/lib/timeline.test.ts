/**
 * Unit tests for timeline utility functions

 * 
 * Functions tested:
 * - formatRelativeTime() - Formats dates as relative time strings
 * - getActionText() - Returns action text for timeline item types
 * - getActorInitials() - Extracts initials from actor names
 */

import {
  formatRelativeTime,
  getActionText,
  getActorInitials,
  type TimelineItemType,
} from '@/lib/timeline';

// Mock date-fns
jest.mock('date-fns', () => ({
  formatDistanceToNow: jest.fn(),
}));

import { formatDistanceToNow } from 'date-fns';

const mockFormatDistanceToNow = formatDistanceToNow as jest.MockedFunction<
  typeof formatDistanceToNow
>;

describe('Timeline Utilities', () => {
  describe('formatRelativeTime', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('formats a recent date', () => {
      const date = new Date('2024-01-01T10:00:00.000Z');
      mockFormatDistanceToNow.mockReturnValue('5 minutes ago');

      const result = formatRelativeTime(date);

      expect(result).toBe('5 minutes ago');
      expect(mockFormatDistanceToNow).toHaveBeenCalledWith(date, {
        addSuffix: true,
      });
    });

    it('formats a date from hours ago', () => {
      const date = new Date('2024-01-01T08:00:00.000Z');
      mockFormatDistanceToNow.mockReturnValue('2 hours ago');

      const result = formatRelativeTime(date);

      expect(result).toBe('2 hours ago');
      expect(mockFormatDistanceToNow).toHaveBeenCalledWith(date, {
        addSuffix: true,
      });
    });

    it('formats a date from days ago', () => {
      const date = new Date('2023-12-25T10:00:00.000Z');
      mockFormatDistanceToNow.mockReturnValue('7 days ago');

      const result = formatRelativeTime(date);

      expect(result).toBe('7 days ago');
      expect(mockFormatDistanceToNow).toHaveBeenCalledWith(date, {
        addSuffix: true,
      });
    });

    it('formats a date from months ago', () => {
      const date = new Date('2023-10-01T10:00:00.000Z');
      mockFormatDistanceToNow.mockReturnValue('3 months ago');

      const result = formatRelativeTime(date);

      expect(result).toBe('3 months ago');
      expect(mockFormatDistanceToNow).toHaveBeenCalledWith(date, {
        addSuffix: true,
      });
    });

    it('formats a date from years ago', () => {
      const date = new Date('2022-01-01T10:00:00.000Z');
      mockFormatDistanceToNow.mockReturnValue('about 2 years ago');

      const result = formatRelativeTime(date);

      expect(result).toBe('about 2 years ago');
      expect(mockFormatDistanceToNow).toHaveBeenCalledWith(date, {
        addSuffix: true,
      });
    });

    it('handles just now', () => {
      const date = new Date();
      mockFormatDistanceToNow.mockReturnValue('less than a minute ago');

      const result = formatRelativeTime(date);

      expect(result).toBe('less than a minute ago');
      expect(mockFormatDistanceToNow).toHaveBeenCalledWith(date, {
        addSuffix: true,
      });
    });

    it('passes options correctly to date-fns', () => {
      const date = new Date('2024-01-01T10:00:00.000Z');
      mockFormatDistanceToNow.mockReturnValue('5 minutes ago');

      formatRelativeTime(date);

      expect(mockFormatDistanceToNow).toHaveBeenCalledWith(date, {
        addSuffix: true,
      });
    });
  });

  describe('getActionText', () => {
    it('returns "posted" for post_created', () => {
      const result = getActionText('post_created');
      expect(result).toBe('posted');
    });

    it('returns "commented on" for comment_added', () => {
      const result = getActionText('comment_added');
      expect(result).toBe('commented on');
    });

    it('returns "reacted to" for reaction_added', () => {
      const result = getActionText('reaction_added');
      expect(result).toBe('reacted to');
    });

    it('returns "cooked" for cooked_logged', () => {
      const result = getActionText('cooked_logged');
      expect(result).toBe('cooked');
    });

    it('returns "shared" for unknown type (default case)', () => {
      const result = getActionText('unknown_type' as TimelineItemType);
      expect(result).toBe('shared');
    });

    it('handles all valid timeline item types', () => {
      const types: TimelineItemType[] = [
        'post_created',
        'comment_added',
        'reaction_added',
        'cooked_logged',
      ];

      types.forEach((type) => {
        const result = getActionText(type);
        expect(result).toBeTruthy();
        expect(typeof result).toBe('string');
      });
    });
  });

  describe('getActorInitials', () => {
    describe('single name', () => {
      it('returns first letter uppercase for single name', () => {
        expect(getActorInitials('Alice')).toBe('A');
      });

      it('returns uppercase for lowercase single name', () => {
        expect(getActorInitials('alice')).toBe('A');
      });

      it('handles single letter name', () => {
        expect(getActorInitials('A')).toBe('A');
      });
    });

    describe('multiple names', () => {
      it('returns first and last initials for two names', () => {
        expect(getActorInitials('Alice Smith')).toBe('AS');
      });

      it('returns first and last initials for three names', () => {
        expect(getActorInitials('Alice Marie Smith')).toBe('AS');
      });

      it('returns first and last initials for many names', () => {
        expect(getActorInitials('Alice Marie Elizabeth Jane Smith')).toBe('AS');
      });

      it('uppercases both initials', () => {
        expect(getActorInitials('alice smith')).toBe('AS');
      });
    });

    describe('whitespace handling', () => {
      it('trims leading whitespace', () => {
        expect(getActorInitials('  Alice')).toBe('A');
      });

      it('trims trailing whitespace', () => {
        expect(getActorInitials('Alice  ')).toBe('A');
      });

      it('trims both leading and trailing whitespace', () => {
        expect(getActorInitials('  Alice Smith  ')).toBe('AS');
      });

      it('handles multiple spaces between names', () => {
        expect(getActorInitials('Alice    Smith')).toBe('AS');
      });

      it('handles tabs and newlines (treated as single name)', () => {
        // Tabs and newlines are not split on, so treated as part of single name
        expect(getActorInitials('Alice\t\nSmith')).toBe('A');
      });
    });

    describe('edge cases', () => {
      it('returns empty string for empty string (after trim)', () => {
        // After trim(), split(' ') gives [''], which has length 1
        expect(getActorInitials('')).toBe('');
      });

      it('returns empty string for whitespace only', () => {
        // After trim(), we get '', then split gives ['']
        expect(getActorInitials('   ')).toBe('');
      });

      it('returns empty string for tabs only', () => {
        // After trim(), we get '', then split gives ['']
        expect(getActorInitials('\t\t')).toBe('');
      });

      it('handles name with special characters', () => {
        expect(getActorInitials('Alice-Marie')).toBe('A');
      });

      it('handles name with apostrophe', () => {
        expect(getActorInitials("O'Brien")).toBe('O');
      });

      it('handles hyphenated last names', () => {
        expect(getActorInitials('Alice Smith-Jones')).toBe('AS');
      });

      it('handles accented characters', () => {
        expect(getActorInitials('Élise Müller')).toBe('ÉM');
      });

      it('handles unicode characters (single word)', () => {
        // Chinese name without space is treated as single word
        expect(getActorInitials('李明')).toBe('李');
      });

      it('handles unicode characters (multiple words)', () => {
        // Chinese name with space gets first and last initials
        expect(getActorInitials('李 明')).toBe('李明');
      });

      it('handles emoji as first character', () => {
        // Emoji takes first character position
        const result = getActorInitials('😀 Test');
        // charAt(0) on emoji may give partial character, just verify it returns something
        expect(result.length).toBeGreaterThan(0);
        expect(result).toContain('T');
      });
    });

    describe('real world names', () => {
      it('handles common first + last name', () => {
        expect(getActorInitials('John Doe')).toBe('JD');
      });

      it('handles first + middle + last name', () => {
        expect(getActorInitials('John Michael Doe')).toBe('JD');
      });

      it('handles names with prefixes', () => {
        expect(getActorInitials('Dr. Alice Smith')).toBe('DS');
      });

      it('handles names with suffixes', () => {
        expect(getActorInitials('Alice Smith Jr.')).toBe('AJ');
      });
    });
  });
});
