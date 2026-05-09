// apps/extension/tests/parsers.test.js
// Run with: node --test tests/parsers.test.js  (from apps/extension/)
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// Load parsers using CommonJS require (parsers.js uses module.exports guard)
const { parseVisa, parseLanguages } = require('../shared/parsers.js');

describe('parseVisa', () => {
  test('returns not_available when "no sponsorship" appears', () => {
    assert.equal(parseVisa('No sponsorship available for this role.'), 'not_available');
  });

  test('returns not_available for "must be authorized to work"', () => {
    assert.equal(parseVisa('Candidates must be authorized to work in the EU.'), 'not_available');
  });

  test('returns not_available for "not able to sponsor"', () => {
    assert.equal(parseVisa('We are not able to sponsor work visas.'), 'not_available');
  });

  test('returns available when "visa sponsorship available" appears', () => {
    assert.equal(parseVisa('Visa sponsorship available for exceptional candidates.'), 'available');
  });

  test('returns available when "we sponsor" appears', () => {
    assert.equal(parseVisa('We sponsor work visas for international talent.'), 'available');
  });

  test('returns unclear when no visa language found', () => {
    assert.equal(
      parseVisa('We are looking for a passionate product manager to join our growing team.'),
      'unclear'
    );
  });
});

describe('parseLanguages', () => {
  test('detects a single required language with level', () => {
    const result = parseLanguages('Fluent German (C1) required.');
    assert.equal(result.length, 1);
    assert.equal(result[0].language, 'German');
    assert.equal(result[0].required, true);
  });

  test('detects multiple languages', () => {
    const result = parseLanguages('Fluent German required. English professional working proficiency.');
    assert.ok(result.some(r => r.language === 'German'));
    assert.ok(result.some(r => r.language === 'English'));
  });

  test('marks preferred language as not required', () => {
    const result = parseLanguages('English required. German preferred.');
    const german = result.find(r => r.language === 'German');
    assert.ok(german, 'German should be detected');
    assert.equal(german.required, false);
  });

  test('detects CEFR level', () => {
    const result = parseLanguages('German C1 mandatory.');
    assert.ok(result.length >= 1);
    const german = result.find(r => r.language === 'German');
    assert.ok(german, 'German should be detected');
    assert.match(german.level, /C1/);
  });

  test('deduplicates Deutsch and German', () => {
    const result = parseLanguages('German (Deutsch) fluent required.');
    const germanEntries = result.filter(r => r.language === 'German');
    assert.equal(germanEntries.length, 1);
  });

  test('returns empty array when no languages found', () => {
    const result = parseLanguages('We value critical thinking and a collaborative mindset.');
    assert.equal(result.length, 0);
  });
});
