// App lifecycle: PD saves when the app goes to the background. Browsers report this through visibilitychange;
// on iOS and Android the Capacitor App plugin's state change is the reliable signal.
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

export function onAppPause(pause: () => void, resume: () => void): void {
  document.addEventListener('visibilitychange', () => (document.visibilityState === 'hidden' ? pause() : resume()));
  addEventListener('pagehide', pause);
  if (Capacitor.isNativePlatform()) {
    void App.addListener('appStateChange', ({ isActive }) => (isActive ? resume() : pause()));
  }
}
