/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)'],
  moduleDirectories: ['node_modules', '<rootDir>'],
  moduleNameMapper: {
  '^@/app/(.*)$': '<rootDir>/app/$1',
  '^@/components/(.*)$': '<rootDir>/components/$1',
  '^@/lib/(.*)$': '<rootDir>/lib/$1',
  '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  setupFilesAfterEnv: [],
};
