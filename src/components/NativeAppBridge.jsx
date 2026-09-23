import React, { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { useLocation, useNavigate } from 'react-router-dom';

const NativeAppBridge = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;

    const platform = Capacitor.getPlatform();
    document.documentElement.classList.add('native-app', `native-${platform}`);

    const configureChrome = async () => {
      try {
        await StatusBar.setOverlaysWebView({ overlay: false });
        if (platform === 'android') {
          await StatusBar.setBackgroundColor({ color: '#0B1220' });
        }
        await StatusBar.setStyle({ style: Style.Light });
      } catch (error) {
        console.warn('[Native] No fue posible configurar la barra de estado.', error);
      }

      try {
        await SplashScreen.hide();
      } catch (error) {
        console.warn('[Native] No fue posible cerrar el splash.', error);
      }
    };

    configureChrome();

    return () => {
      document.documentElement.classList.remove('native-app', `native-${platform}`);
    };
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return undefined;

    let listener;
    CapacitorApp.addListener('backButton', () => {
      const rootRoute = location.pathname === '/' || location.pathname === '/companies';
      if (rootRoute) {
        CapacitorApp.minimizeApp();
        return;
      }
      navigate(-1);
    }).then(handle => { listener = handle; });

    return () => listener?.remove();
  }, [location.pathname, navigate]);

  return null;
};

export default NativeAppBridge;
