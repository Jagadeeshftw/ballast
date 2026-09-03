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
 *
 * The engine read is caught here rather than allowed to throw. An error in a LAYOUT does not
 * reach that layout's own error boundary -- it propagates to the parent segment -- so an
 * unreachable RPC took out the entire shell and rendered Next's default 500, with no sidebar
 * to leave by and no statement of what had failed. The shell must not depend on a network
 * read succeeding. When the read fails the chip says so, and the views below still render
 * their own states through the boundary that does cover them.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const engine = await getEngineState().catch(() => null);
  const unread = notificationsFor(ADDR.demoUser).filter((n) => n.important).length;

  return (
    <div id="dir-a" className="app">
      <WalletProvider>
        <Sidebar />
        <div className="appMain">
          <TopBar
            engineLive={engine ? engine.subscribed : null}
            engineNote={
              !engine
                ? "Could not read the engine — the testnet RPC did not answer. Nothing is wrong with the contract; this page could not reach it."
                : engine.subscribed
                  ? "Subscribed and watching every window"
                  : "Subscription closed — out of gas. See Engine."
            }
            unread={unread}
          />
          <main className="appBody">{children}</main>
        </div>
      </WalletProvider>
    </div>
  );
}
