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
      {/* Runs during parse, before the panels below are painted -- and it has to, because
          React cannot fix this. The server has no wallet, so the server-rendered HTML says
          "you have no cover", and hydration is required to reproduce that exactly or it is
          not hydration. The effect that finds the provider is a passive one: it runs AFTER
          the first paint. So a returning connected reader saw the negative for one frame no
          matter what the components did.

          This marks the document before that paint, and CSS holds the panel's shape until
          React knows the answer. No DOM the components own is touched, so there is nothing
          for hydration to mismatch. With JavaScript off it never runs, the attribute is
          never set, and the disconnected state -- which is then the true one -- shows
          exactly as it does now. The timeout is a failsafe: if the bundle never arrives,
          the honest fallback is the server's answer, not a shape that waits forever. */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            'try{if(window.ethereum&&localStorage.getItem("ballast.wallet.disconnected")!=="1"){' +
            'var d=document.documentElement;d.setAttribute("data-wpend","1");' +
            'setTimeout(function(){d.removeAttribute("data-wpend")},6000)}}catch(e){}',
        }}
      />
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
