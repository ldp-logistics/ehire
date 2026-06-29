eHire – Logo setup
==========================

The app is configured to use:

  Dark mode / dark backgrounds (sidebar, login blue box, dark theme header):
    → Logo-dark-web.png

  Light mode / light backgrounds (header when app is in light theme):
    → Logo-light-web.png

To change which file is used, edit client/src/lib/logo.ts (LOGO_LIGHT and LOGO_DARK).

Other files in this folder (LDP-Light.png, logo-light-2.png, Logo-Presentation.png, etc.)
are available if you want to swap – just update the paths in logo.ts.

Browser tab icon: index.html uses Logo-Social.png (square, works better at small size). To use a different file, edit the favicon <link> in client/index.html. Tab icon size is fixed by the browser (~16px); for clearest result use a simple 32×32 or 64×64 image.
