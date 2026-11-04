# Tamakkan visual identity

Tamakkan is the frontend's only visual identity. There is no brand setting: `lib/branding.ts` is the single source, and no environment variable selects an identity.

`lib/branding.ts` defines the name, Arabic wordmark, browser title, description and icon. `app/layout.tsx` adds the selected identity to the root element. The Tamakkan theme in `app/globals.css` overrides the existing shared tokens so navigation, buttons, forms, reports and learning screens use the same palette.

| Use | Tamakkan color |
| --- | --- |
| Primary actions | `#086caa` |
| Sidebar / dark panels | `#103b59` |
| Page background | `#f5f9fc` |
| Cards and mobile navigation | White |
| Soft emphasis | `#eef7fc` |
| Body text | `#273e50` |

Red is retained in the supplied logo and for error states. Most interface surfaces use white and blue, following the team's direction.

The logo in `public/brand/tamakkan-logo.jpg` is copied unchanged from the existing KasselSoft project asset `kasselSoftBranches_Frontend/src/assets/tamakan-logo.jpg`. It matches the logo in the supplied Tamakkan reference. The original artwork has not been redrawn or recolored.

The login includes English and Arabic content, with a compact form on phones and an introductory panel on desktop. The logo also appears in the desktop sidebar, mobile header, loading screen and browser icon. Language preferences use `tamakkan_locale`.

Authentication, permissions, API routes, course content and learning calculations retain their existing behavior. Activating external AI/media services and replacing remaining demonstration metrics are separate tasks. This change does not publish or deploy the application.
