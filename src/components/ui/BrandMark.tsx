/**
 * The app's mark, shown beside the name in the header and on the sign-in
 * card. It is the same artwork as the installed app icon, served from the
 * public folder — BASE_URL keeps it correct under a GitHub Pages subpath.
 *
 * Decorative: the word "Tracker" always sits next to it, so it carries no
 * alternative text of its own.
 */
export function BrandMark() {
  return (
    <img
      className="header__mark"
      src={`${import.meta.env.BASE_URL}icon-192.png`}
      alt=""
      width={22}
      height={22}
      aria-hidden="true"
    />
  )
}
