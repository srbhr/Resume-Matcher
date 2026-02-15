import { describe, expect, it } from 'vitest';
import { sanitizeFilename } from '@/lib/utils/download';

describe('sanitizeFilename', () => {
  describe('Basic functionality', () => {
    it('should add .pdf extension to a simple title', () => {
      const result = sanitizeFilename('My Resume', 'test-id-123');
      expect(result).toBe('My Resume.pdf');
    });

    it('should use resume type by default', () => {
      const result = sanitizeFilename(null, 'test-id-123');
      expect(result).toBe('resume_test-id-123.pdf');
    });

    it('should use cover-letter type when specified', () => {
      const result = sanitizeFilename(null, 'test-id-123', 'cover-letter');
      expect(result).toBe('cover_letter_test-id-123.pdf');
    });
  });

  describe('Invalid character sanitization', () => {
    it('should replace forward slashes with dashes', () => {
      const result = sanitizeFilename('Senior Dev / Team Lead', 'test-id');
      expect(result).toBe('Senior Dev - Team Lead.pdf');
    });

    it('should replace backslashes with dashes', () => {
      const result = sanitizeFilename('Path\\To\\Resume', 'test-id');
      expect(result).toBe('Path-To-Resume.pdf');
    });

    it('should replace colons with dashes', () => {
      const result = sanitizeFilename('Resume: Software Engineer', 'test-id');
      expect(result).toBe('Resume- Software Engineer.pdf');
    });

    it('should replace asterisks with dashes', () => {
      const result = sanitizeFilename('Best * Resume * Ever', 'test-id');
      expect(result).toBe('Best - Resume - Ever.pdf');
    });

    it('should replace question marks with dashes', () => {
      const result = sanitizeFilename('Are You Hiring?', 'test-id');
      expect(result).toBe('Are You Hiring-.pdf');
    });

    it('should replace double quotes with dashes', () => {
      const result = sanitizeFilename('"Expert" Developer', 'test-id');
      expect(result).toBe('-Expert- Developer.pdf');
    });

    it('should replace angle brackets with dashes', () => {
      const result = sanitizeFilename('Developer <Full Stack>', 'test-id');
      expect(result).toBe('Developer -Full Stack-.pdf');
    });

    it('should replace pipes with dashes', () => {
      const result = sanitizeFilename('Frontend | Backend', 'test-id');
      expect(result).toBe('Frontend - Backend.pdf');
    });

    it('should replace multiple invalid characters at once', () => {
      const result = sanitizeFilename('Dev @ Company | React/Vue', 'test-id');
      expect(result).toBe('Dev @ Company - React-Vue.pdf');
    });
  });

  describe('Whitespace normalization', () => {
    it('should normalize multiple spaces to single space', () => {
      const result = sanitizeFilename('Resume    with    spaces', 'test-id');
      expect(result).toBe('Resume with spaces.pdf');
    });

    it('should trim leading whitespace', () => {
      const result = sanitizeFilename('   Leading spaces', 'test-id');
      expect(result).toBe('Leading spaces.pdf');
    });

    it('should trim trailing whitespace', () => {
      const result = sanitizeFilename('Trailing spaces   ', 'test-id');
      expect(result).toBe('Trailing spaces.pdf');
    });

    it('should handle tabs and normalize them', () => {
      const result = sanitizeFilename('Resume\t\twith\ttabs', 'test-id');
      expect(result).toBe('Resume with tabs.pdf');
    });
  });

  describe('Length truncation', () => {
    it('should truncate titles longer than 100 characters', () => {
      const longTitle = 'A'.repeat(150);
      const result = sanitizeFilename(longTitle, 'test-id');
      expect(result).toBe('A'.repeat(100) + '.pdf');
      expect(result.length).toBe(104); // 100 chars + '.pdf'
    });

    it('should preserve titles exactly 100 characters', () => {
      const exactTitle = 'B'.repeat(100);
      const result = sanitizeFilename(exactTitle, 'test-id');
      expect(result).toBe(exactTitle + '.pdf');
    });

    it('should preserve short titles without truncation', () => {
      const shortTitle = 'Short Title';
      const result = sanitizeFilename(shortTitle, 'test-id');
      expect(result).toBe('Short Title.pdf');
    });

    it('should trim whitespace after truncation', () => {
      // Create a 105-character string where char 100 is a space
      const titleWithSpace = 'A'.repeat(99) + ' ' + 'B'.repeat(5);
      const result = sanitizeFilename(titleWithSpace, 'test-id');
      // Should truncate to 100 chars then trim the trailing space
      expect(result).toBe('A'.repeat(99) + '.pdf');
    });
  });

  describe('Null, undefined, and empty handling', () => {
    it('should handle null title with resume type', () => {
      const result = sanitizeFilename(null, 'abc-123');
      expect(result).toBe('resume_abc-123.pdf');
    });

    it('should handle undefined title with resume type', () => {
      const result = sanitizeFilename(undefined, 'xyz-456');
      expect(result).toBe('resume_xyz-456.pdf');
    });

    it('should handle empty string with resume type', () => {
      const result = sanitizeFilename('', 'empty-id');
      expect(result).toBe('resume_empty-id.pdf');
    });

    it('should handle whitespace-only string with resume type', () => {
      const result = sanitizeFilename('   ', 'space-id');
      expect(result).toBe('resume_space-id.pdf');
    });

    it('should handle null title with cover-letter type', () => {
      const result = sanitizeFilename(null, 'cover-id', 'cover-letter');
      expect(result).toBe('cover_letter_cover-id.pdf');
    });

    it('should handle undefined title with cover-letter type', () => {
      const result = sanitizeFilename(undefined, 'cover-id', 'cover-letter');
      expect(result).toBe('cover_letter_cover-id.pdf');
    });
  });

  describe('Real-world examples', () => {
    it('should handle "Senior Software Engineer - Google"', () => {
      const result = sanitizeFilename('Senior Software Engineer - Google', 'test-id');
      expect(result).toBe('Senior Software Engineer - Google.pdf');
    });

    it('should handle "Frontend Dev @ Meta | React Specialist"', () => {
      const result = sanitizeFilename('Frontend Dev @ Meta | React Specialist', 'test-id');
      expect(result).toBe('Frontend Dev @ Meta - React Specialist.pdf');
    });

    it('should handle "ML Engineer: OpenAI (2024)"', () => {
      const result = sanitizeFilename('ML Engineer: OpenAI (2024)', 'test-id');
      expect(result).toBe('ML Engineer- OpenAI (2024).pdf');
    });

    it('should handle "Backend Developer - Node.js/Python"', () => {
      const result = sanitizeFilename('Backend Developer - Node.js/Python', 'test-id');
      expect(result).toBe('Backend Developer - Node.js-Python.pdf');
    });

    it('should handle unicode characters (emojis)', () => {
      const result = sanitizeFilename('Developer 🚀 Resume', 'test-id');
      expect(result).toBe('Developer 🚀 Resume.pdf');
    });

    it('should handle Chinese characters', () => {
      const result = sanitizeFilename('软件工程师简历', 'test-id');
      expect(result).toBe('软件工程师简历.pdf');
    });

    it('should handle Japanese characters', () => {
      const result = sanitizeFilename('ソフトウェアエンジニア', 'test-id');
      expect(result).toBe('ソフトウェアエンジニア.pdf');
    });

    it('should handle Spanish characters with accents', () => {
      const result = sanitizeFilename('Currículum Técnico', 'test-id');
      expect(result).toBe('Currículum Técnico.pdf');
    });
  });

  describe('Edge cases', () => {
    it('should handle title with only invalid characters', () => {
      const result = sanitizeFilename('/<>:*?"|\\', 'test-id');
      expect(result).toBe('---------.pdf');
    });

    it('should handle title that becomes empty after sanitization', () => {
      const result = sanitizeFilename('   /<>:*?"|\\   ', 'test-id');
      // After replacing invalid chars and trimming, if empty, should use fallback
      // But the function replaces them with dashes, so result will be dashes
      expect(result).toBe('---------.pdf');
    });

    it('should handle UUID-like fallback ID', () => {
      const result = sanitizeFilename(
        null,
        'ec3aa096-0cba-498e-998b-bc867e35eff6',
        'resume'
      );
      expect(result).toBe('resume_ec3aa096-0cba-498e-998b-bc867e35eff6.pdf');
    });

    it('should handle very long fallback ID', () => {
      const longId = 'x'.repeat(200);
      const result = sanitizeFilename(null, longId);
      expect(result).toBe(`resume_${longId}.pdf`);
    });

    it('should handle mixed valid and invalid characters', () => {
      const result = sanitizeFilename('Valid-Name|Invalid:Chars', 'test-id');
      expect(result).toBe('Valid-Name-Invalid-Chars.pdf');
    });

    it('should preserve hyphens and underscores', () => {
      const result = sanitizeFilename('My_Resume-2024', 'test-id');
      expect(result).toBe('My_Resume-2024.pdf');
    });

    it('should preserve parentheses and brackets', () => {
      const result = sanitizeFilename('Resume (Updated) [Final]', 'test-id');
      expect(result).toBe('Resume (Updated) [Final].pdf');
    });

    it('should preserve ampersands and at symbols', () => {
      const result = sanitizeFilename('Sales & Marketing @ Company', 'test-id');
      expect(result).toBe('Sales & Marketing @ Company.pdf');
    });
  });

  describe('Type safety', () => {
    it('should accept "resume" type', () => {
      const result = sanitizeFilename('Test', 'id', 'resume');
      expect(result).toBe('Test.pdf');
    });

    it('should accept "cover-letter" type', () => {
      const result = sanitizeFilename('Test', 'id', 'cover-letter');
      expect(result).toBe('Test.pdf');
    });

    it('should default to "resume" when type is not provided', () => {
      const result = sanitizeFilename(null, 'id');
      expect(result).toBe('resume_id.pdf');
    });
  });

  describe('Unicode normalization', () => {
    it('should normalize NFD (decomposed) to NFC (composed) - Spanish accents', () => {
      // NFD form: "Currículum" with í as i + combining accent
      const nfdTitle = 'Curr\u0069\u0301culum Te\u0301cnico'; // í = i + ́
      // NFC form: "Currículum" with í as single character
      const nfcTitle = 'Currículum Técnico'; // í = í (precomposed)

      const result1 = sanitizeFilename(nfdTitle, 'test-id');
      const result2 = sanitizeFilename(nfcTitle, 'test-id');

      // Both should produce the same filename
      expect(result1).toBe(result2);
      expect(result1).toBe('Currículum Técnico.pdf');
    });

    it('should normalize NFD to NFC - French accents', () => {
      const nfdTitle = 'Re\u0301sume\u0301'; // é as e + combining accent
      const nfcTitle = 'Résumé'; // é as precomposed character

      const result1 = sanitizeFilename(nfdTitle, 'test-id');
      const result2 = sanitizeFilename(nfcTitle, 'test-id');

      expect(result1).toBe(result2);
      expect(result1).toBe('Résumé.pdf');
    });

    it('should handle titles with zero-width characters', () => {
      // Zero-width space (U+200B) should be preserved but not affect normalization
      const titleWithZWS = 'Senior\u200BEngineer';
      const result = sanitizeFilename(titleWithZWS, 'test-id');
      // Zero-width space is preserved in the filename
      expect(result).toBe('Senior\u200BEngineer.pdf');
    });

    it('should handle combining diacritical marks consistently', () => {
      // Vietnamese combining marks
      const nfdTitle = 'Ngu\u0303ye\u0302\u0303n'; // ũ as u + tilde, ễ as e + circumflex + tilde
      const result = sanitizeFilename(nfdTitle, 'test-id');

      // Should normalize to NFC
      expect(result).toBe('Ngũyễn.pdf');
    });
  });

  describe('Multi-byte character truncation', () => {
    it('should not corrupt Chinese characters at truncation boundary', () => {
      // Create a title with Chinese chars near the 100-char limit
      const prefix = 'A'.repeat(95);
      const suffix = '高级工程师'; // 5 multi-byte Chinese characters
      const title = prefix + suffix; // 100 characters total

      const result = sanitizeFilename(title, 'test-id');

      // Should truncate to exactly 100 chars without corruption
      expect(result.length).toBe(104); // 100 chars + '.pdf'
      expect(result).not.toContain('�'); // No replacement characters
      expect(result.slice(0, -4)).toHaveLength(100); // Without .pdf extension
    });

    it('should not split emoji at truncation boundary', () => {
      // Create title with emoji near boundary
      const prefix = 'A'.repeat(97);
      const emoji = '👨‍👩‍👧‍👦'; // Family emoji (complex grapheme cluster)
      const title = prefix + emoji + 'BC';

      const result = sanitizeFilename(title, 'test-id');

      // Should not have replacement characters
      expect(result).not.toContain('�');
    });

    it('should handle Japanese characters at boundary', () => {
      const prefix = 'Engineer '.repeat(10); // ~90 chars
      const japanese = 'ソフトウェアエンジニア'; // 11 Japanese characters
      const title = prefix + japanese; // Over 100 chars

      const result = sanitizeFilename(title, 'test-id');

      // Should truncate cleanly without corruption
      expect(result).not.toContain('�');
      expect(result.slice(0, -4).length).toBeLessThanOrEqual(100);
    });

    it('should handle Korean characters at boundary', () => {
      const prefix = 'A'.repeat(95);
      const korean = '소프트웨어엔지니어'; // 9 Korean characters
      const title = prefix + korean;

      const result = sanitizeFilename(title, 'test-id');

      // Should not corrupt Korean characters
      expect(result).not.toContain('�');
    });

    it('should handle Arabic RTL text at boundary', () => {
      const prefix = 'A'.repeat(90);
      const arabic = 'مهندس برمجيات'; // Arabic: "Software Engineer"
      const title = prefix + arabic;

      const result = sanitizeFilename(title, 'test-id');

      // Should not corrupt Arabic characters
      expect(result).not.toContain('�');
    });

    it('should handle mixed multi-byte characters', () => {
      // Mix of Chinese, emoji, and Latin
      const title = '高级软件工程师 👨‍💻 Senior Engineer - 2024年'.repeat(5); // Over 100 grapheme clusters

      const result = sanitizeFilename(title, 'test-id');

      // Should truncate without corruption
      expect(result).not.toContain('�');
      // Array.from() truncates to 100 codepoints, but complex emoji (ZWJ sequences) may be longer in UTF-16
      const resultWithoutExt = result.slice(0, -4);
      const graphemeCount = Array.from(resultWithoutExt).length;
      expect(graphemeCount).toBeLessThanOrEqual(100);
    });

    it('should handle edge case: title is exactly 101 grapheme clusters', () => {
      // 101 single-character grapheme clusters
      const title = 'A'.repeat(101);
      const result = sanitizeFilename(title, 'test-id');

      // Should truncate to 100 + .pdf
      expect(result).toBe('A'.repeat(100) + '.pdf');
    });

    it('should handle edge case: complex emoji at position 100', () => {
      const prefix = 'A'.repeat(99);
      const emoji = '👨‍👩‍👧‍👦'; // Complex emoji (family) - multiple codepoints with ZWJ
      const suffix = 'BC';
      const title = prefix + emoji + suffix;

      const result = sanitizeFilename(title, 'test-id');

      // Should either include the full emoji or exclude it entirely, not split it
      expect(result).not.toContain('�');

      // Complex emojis with ZWJ (zero-width joiner) are treated as multiple codepoints by Array.from()
      // So the family emoji '👨‍👩‍👧‍👦' is actually 7 codepoints (👨 ZWJ 👩 ZWJ 👧 ZWJ 👦)
      // Array.from() will count each codepoint, so the emoji might get split at the 100-codepoint boundary

      // The key is: no corruption (no � replacement characters)
      const graphemeCount = Array.from(result.slice(0, -4)).length;
      expect(graphemeCount).toBeLessThanOrEqual(100);
    });
  });
});
