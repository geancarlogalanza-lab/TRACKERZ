import { Component, type ReactNode } from 'react'

interface AppBoundaryProps {
  onCrash: (error: unknown) => void
  children: ReactNode
}

/**
 * Catches an error thrown while the app renders, so a crash becomes the
 * loading screen's error state with a way out rather than a blank page.
 */
export class AppBoundary extends Component<AppBoundaryProps, { crashed: boolean }> {
  state = { crashed: false }

  static getDerivedStateFromError() {
    return { crashed: true }
  }

  componentDidCatch(error: unknown) {
    this.props.onCrash(error)
  }

  render() {
    return this.state.crashed ? null : this.props.children
  }
}
