# Notifications (macOS + Web Push/PWA)

Mission Control supports two notification modes:
- **Desktop notifications**: native OS notifications while Mission Control is open (browser tab or macOS app).
- **Web Push (recommended for iPhone/PWA)**: background push via service worker (requires VAPID keys).

## Desktop Notifications (macOS app or browser tab)

1) Open Mission Control -> Settings -> Notifications.
2) Click "Enable" under Desktop notifications.
3) When macOS prompts, allow notifications.

Notes:
- Desktop notifications only fire while Mission Control is open.
- If permission is denied, fix it in: System Settings -> Notifications -> Mission Control.

## Web Push (PWA / iPhone / background notifications)

This is for installed PWAs and supported browsers. It is not available inside the macOS desktop app.

Admin setup (once):
1) Open Mission Control -> Settings -> Notifications.
2) Click "Configure push keys" (creates VAPID keys).
3) Restart Mission Control if prompted.

Per-device setup:
1) Open Mission Control in the browser on that device.
2) Click "Enable notifications".
3) Send a test notification.

## iPhone: Install as a PWA + Enable Push

1) Make sure iPhone is on your tailnet (Tailscale app connected).
2) Open Mission Control in Safari (tailnet URL).
3) Share button -> "Add to Home Screen".
4) Open Mission Control from the new Home Screen icon.
5) Go to Settings -> Notifications (inside Mission Control) and enable web push.

If you don't get a prompt:
- confirm you installed as a Home Screen app (standalone PWA)
- confirm push keys are configured on the server
