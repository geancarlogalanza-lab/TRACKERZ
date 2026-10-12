/**
 * The one element whose outline the hearth sets alight: the streak calendar.
 *
 * The calendar registers itself here as it mounts and leaves as it unmounts;
 * the fireplace reads it each time it draws, and hears when it changes, so
 * the flames follow the calendar without either knowing about the other.
 */

let edge: Element | null = null
const listeners = new Set<() => void>()

/** Use as a ref callback: `ref={setBurningEdge}`. */
export function setBurningEdge(element: Element | null): void {
  edge = element
  for (const listener of listeners) listener()
}

/** The element to burn around, if it's on the page. */
export function burningEdge(): Element | null {
  return edge?.isConnected ? edge : null
}

/** Calls `listener` whenever the element changes; returns the unsubscribe. */
export function onBurningEdgeChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
