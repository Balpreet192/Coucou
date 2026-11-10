import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";

const AUTH_CALLBACK = "coucou://auth/callback";

function showLaunchScreen() {
  const screen = document.createElement("div");
  screen.setAttribute("aria-hidden", "true");
  screen.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:2147483647",
    "display:flex",
    "flex-direction:column",
    "align-items:center",
    "justify-content:center",
    "gap:20px",
    "background:#e8f7ff",
    "color:#6b4c5a",
    "font-family:Arial,sans-serif",
    "font-size:32px",
    "font-weight:700",
    "transition:opacity 180ms ease"
  ].join(";");
  screen.innerHTML = `
    <svg width="112" height="112" viewBox="0 0 112 112" role="presentation">
      <rect x="4" y="4" width="104" height="104" rx="32" fill="#d7a26d"/>
      <path d="M75 31a34 34 0 1 0 0 50" fill="none" stroke="#6b4c5a" stroke-width="12" stroke-linecap="round"/>
      <circle cx="53" cy="48" r="4" fill="#fff"/>
      <circle cx="53" cy="56" r="4" fill="#fff"/>
      <circle cx="53" cy="64" r="4" fill="#fff"/>
    </svg>
    <span>Coucou</span>`;
  document.body.append(screen);
  return screen;
}

function showAuthError(message) {
  console.error("[Coucou auth] Callback failed:", message);
  const state = document.getElementById("profile-auth-state");
  if (state) {
    state.textContent = "This sign-in link is invalid or has expired. Request a new link and try again.";
    state.classList.add("profile-auth-error");
  }
}

async function handleAuthUrl(rawUrl) {
  if (!rawUrl.startsWith(AUTH_CALLBACK) || !window.coucouSupabase) return;

  const url = new URL(rawUrl);
  const query = url.searchParams;
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const error = query.get("error_description") || query.get("error") ||
    hash.get("error_description") || hash.get("error");

  if (error) {
    showAuthError(error);
    return;
  }

  const recovery = query.get("type") === "recovery" || hash.get("type") === "recovery";
  if (recovery) window.COUCOU_PASSWORD_RECOVERY_PENDING = true;

  const code = query.get("code");
  if (code) {
    const { error: exchangeError } = await window.coucouSupabase.auth.exchangeCodeForSession(code);
    if (exchangeError) showAuthError(exchangeError.message);
    return;
  }

  const accessToken = hash.get("access_token") || query.get("access_token");
  const refreshToken = hash.get("refresh_token") || query.get("refresh_token");
  if (accessToken && refreshToken) {
    const { error: sessionError } = await window.coucouSupabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken
    });
    if (sessionError) showAuthError(sessionError.message);
    return;
  }

  showAuthError("The callback did not contain a valid session.");
}

if (Capacitor.isNativePlatform()) {
  window.COUCOU_AUTH_REDIRECT_URL = AUTH_CALLBACK;

  void StatusBar.setStyle({ style: Style.Dark }).catch((error) => {
    console.error("[Coucou] Could not configure the status bar style:", error);
  });
  void StatusBar.setBackgroundColor({ color: "#e8f7ff" }).catch((error) => {
    console.error("[Coucou] Could not configure the status bar color:", error);
  });

  void App.addListener("appUrlOpen", ({ url }) => {
    return handleAuthUrl(url).catch((error) => showAuthError(error.message || String(error)));
  }).catch((error) => {
    console.error("[Coucou] Could not register the auth link handler:", error);
  });

  document.addEventListener("DOMContentLoaded", () => {
    const screen = showLaunchScreen();
    void SplashScreen.hide().catch((error) => {
      console.error("[Coucou] Could not hide the native launch screen:", error);
    }).finally(() => {
      window.setTimeout(() => {
        screen.style.opacity = "0";
        window.setTimeout(() => screen.remove(), 200);
      }, 500);
    });
  }, { once: true });

  void App.getLaunchUrl()
    .then((launch) => {
      if (launch && launch.url) return handleAuthUrl(launch.url);
      return undefined;
    })
    .catch((error) => showAuthError(error.message || String(error)));
}
