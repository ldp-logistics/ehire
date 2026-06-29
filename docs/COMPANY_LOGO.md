# Company logo (LDP LOGISTICS)

The app supports **two logo variants** so the right one is used on light vs dark backgrounds.

## Where each logo is used

| Place | Background | File used |
|--------|------------|-----------|
| **Sidebar** (desktop) | Dark (slate) | `logo-light.png` |
| **Mobile header** | Follows app theme (light/dark) | `logo-light.png` in dark theme, `logo-dark.png` in light theme |
| **Login page** | Blue box (primary) | `logo-light.png` |
| **Signup page** | Blue box (primary) | `logo-light.png` |

## Files to add

Put these in **`client/public/`** (create the folder if needed):

| File | Use for |
|------|--------|
| **`logo-light.png`** | Dark backgrounds (sidebar, blue logo box, dark theme). Use a light/white version of your logo. |
| **`logo-dark.png`** | Light backgrounds (header in light theme). Use a dark version of your logo. |
| **`favicon.png`** | Browser tab icon (optional). 32×32 or 64×64 PNG. |

Naming:

- **Light web** / “logo for dark background” (e.g. LDP LOGISTICS on black with white/red) → save as **`logo-light.png`**
- **Dark web** / “logo for light background” (e.g. LDP LOGISTICS on white) → save as **`logo-dark.png`**

If you only have the dark-background version (e.g. your current LDP LOGISTICS logos), copy that as **`logo-light.png`**. The app will use it everywhere until you add **`logo-dark.png`** for the light-theme header.

## If you only have one logo

1. Use the same file for both: in **`client/src/lib/logo.ts`** set:
   - `LOGO_LIGHT = "/logo.png"`
   - `LOGO_DARK = "/logo.png"`
2. Put that single file at **`client/public/logo.png`**.

(Or use a logo that works on both backgrounds and point both constants to it.)

## Changing paths or filenames

Edit **`client/src/lib/logo.ts`**. Only `LOGO_LIGHT` and `LOGO_DARK` are used; update them to your paths (e.g. `"/my-company-light.png"`).

## Social / share preview

To change the image when the app is shared (Open Graph / Twitter), edit **`client/index.html`** and set `og:image` and `twitter:image` to your logo or a branded preview image URL.
