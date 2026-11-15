import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { reportCrash } from '../lib/crashReporting'

/**
 * The app's last-resort error boundary: shows `fallback` instead of a white page and reports the crash. It replaces Sentry's own
 * ErrorBoundary so that @sentry/react is not part of the first download (see lib/crashReporting.ts).
 */
export class CrashBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false }
  static getDerivedStateFromError() { return { crashed: true } }
  componentDidCatch(error: unknown, info: ErrorInfo) { reportCrash(error, info.componentStack) }
  render() { return this.state.crashed ? this.props.fallback : this.props.children }
}
