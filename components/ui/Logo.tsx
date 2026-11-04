/** The Tamakkan brand mark: the supplied brand asset, sized by `className`. */
import { brand } from "@/lib/branding";

export function Logo({ className = "size-9" }: { className?: string }) {
  // Use the supplied brand asset unchanged; CSS controls its display size.
  // eslint-disable-next-line @next/next/no-img-element -- small, local static brand asset
  return <img src={brand.icon} alt="Tamakkan — تمكّن" width={640} height={640} className={`tamakkan-logo shrink-0 rounded-xl object-contain ${className}`} />;
}

/** The "Tamakkan" / "تمكّن" wordmark next to `Logo`. Both parts inherit
 * `currentColor` by default (set `className` on a wrapper, or pass one
 * here) so the same markup works on dark and light surfaces. */
export function Wordmark({ className = "" }: { className?: string }) {
  return <span className={`brand-wordmark inline-flex min-w-0 flex-col text-xl font-extrabold leading-tight tracking-tight ${className}`}>
    <bdi>{brand.name}</bdi><small lang="ar" className="mt-0.5 text-xs font-medium tracking-normal opacity-80">{brand.arabicName}</small>
  </span>;
}
