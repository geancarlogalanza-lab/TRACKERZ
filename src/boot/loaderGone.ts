let settle: () => void = () => {}

/**
 * Settles once the loading screen has gone. The app renders underneath it
 * while it is still burning, so work that could cost it a frame — setting
 * up WebGL, which can hold the page for a moment the first time — waits
 * for this instead.
 */
export const loaderGone = new Promise<void>((resolve) => {
  settle = resolve
})

/** Called by Boot as the loading screen leaves. */
export const markLoaderGone = () => settle()
