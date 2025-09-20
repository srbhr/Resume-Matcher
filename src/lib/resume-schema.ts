// Shared minimal JSON schema for resume validation/diagnostics
export const RESUME_JSON_SCHEMA = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', minLength: 1 },
    name: { type: 'string' },
    title: { type: 'string' },
    summary: { type: 'string' },
    'contact-details': {
      type: 'object',
      properties: {
        email: { type: 'string', format: 'email' },
        phone: { type: 'string' },
        city: { type: 'string' },
        state: { type: 'string' },
        country: { type: 'string' },
      },
      additionalProperties: true,
    },
    'social-links': { type: 'object', additionalProperties: { type: 'string' } },
    'work-experiences': {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          company: { type: 'string' },
          position: { type: 'string' },
          duration: { type: 'string' },
          location: { type: 'string' },
          responsibilities: { type: 'array', items: { type: 'string' } },
          achievements: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: true,
      },
    },
    education: { type: 'array', items: { type: 'object', additionalProperties: true } },
    projects: { type: 'array', items: { type: 'object', additionalProperties: true } },
    certifications: { type: 'array', items: { type: 'object', additionalProperties: true } },
    languages: { type: 'array', items: { type: 'object', additionalProperties: true } },
    awards: { type: 'array', items: { type: 'object', additionalProperties: true } },
    'volunteer-work': { type: 'array', items: { type: 'object', additionalProperties: true } },
    publications: { type: 'array', items: { type: 'object', additionalProperties: true } },
  },
  additionalProperties: true,
} as const;
