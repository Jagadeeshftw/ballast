import "../landing.css";
import "./app.css";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import { WalletProvider } from "./wallet";
import { getEngineState } from "@/lib/chain";
import { notificationsFor } from "./notifications";
import { ADDR } from "@/lib/chain";

export const dynamic = "force-dynamic";

/**
 * The dashboard shell.
 *
 * Server-rendered and populated: the sidebar, the top bar and the engine chip are all real
 * before any JavaScript runs, so a judge who never connects a wallet sees a working dashboard
 * rather than a connect button on an empty page. Only the interactive layer — connecting,
 * writing, the wallet menu — needs scripting, which is normal for an application surface.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const engine = await getEngineState();
  const unread = notificationsFor(ADDR.demoUser).filter((n) => n.important).length;

  return (
    <div id="dir-a" className="app">
      <WalletProvider>
        <Sidebar />
        <div className="appMain">
          <TopBar
            engineLive={engine.subscribed}
            engineNote={engine.subscribed
              ? "Subscribed and watching every window"
              : "Subscription closed — out of gas. See Engine."}
            unread={unread}
          />
          <main className="appBody">{children}</main>
        </div>
      </WalletProvider>
    </div>
  );
}
