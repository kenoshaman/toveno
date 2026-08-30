"use client";

import { Bell, BellOff } from "lucide-react";
import { useEffect, useState } from "react";
import {
  getExistingSubscription,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push-client";

export function NotificationToggle() {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setSupported(isPushSupported());
    void getExistingSubscription().then((subscription) => setSubscribed(Boolean(subscription)));
  }, []);

  async function toggle() {
    if (pending) {
      return;
    }
    setPending(true);

    try {
      if (subscribed) {
        await unsubscribeFromPush();
        setSubscribed(false);
      } else {
        await subscribeToPush();
        setSubscribed(true);
      }
    } catch {
      // Permissão negada ou navegador sem suporte; estado permanece inalterado.
    } finally {
      setPending(false);
    }
  }

  if (!supported) {
    return null;
  }

  return (
    <button
      type="button"
      className="notification-toggle"
      onClick={toggle}
      disabled={pending}
      aria-pressed={subscribed}
      aria-label={subscribed ? "Desativar notificações de transmissão" : "Ativar notificações de transmissão"}
      title={subscribed ? "Notificações ativadas" : "Avise-me quando uma transmissão começar"}
    >
      {subscribed ? <Bell size={18} /> : <BellOff size={18} />}
    </button>
  );
}
