// Vitest 5 gave `Assertion` a second type parameter (R, T). jest-dom's own typing for Vitest still declares `Assertion<T>` with one,
// so TypeScript no longer merges it and every toBeInTheDocument()/toBeDisabled() failed to type-check. This declares the same
// merge with the right shape. The runtime side is unchanged (src/test/setup.ts imports '@testing-library/jest-dom').
/* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers'

declare module 'vitest' {
  interface Assertion<R extends void | Promise<void> = void, T = unknown> extends TestingLibraryMatchers<any, T> {}
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<any, any> {}
}
