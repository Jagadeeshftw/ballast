"use client";

/**
 * Backstop for the two pages whose worked examples read the chain. Those already degrade on a
 * failed read rather than throwing, so this should be unreachable — it exists so that the one
 * path left uncovered says something true instead of showing the framework's default.
 */
export default function DocsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="docLayout">
      <article className="docBody">
        <h1 className="docH1">This page could not be built</h1>
        <p className="docLede">
          Most of the documentation is plain text and does not need the chain. Two pages compute
          a worked example from live readings, and that read failed.
        </p>
        <p>
          Nothing is wrong with the contracts or with your funds — this is the testnet RPC not
          answering. The rest of the documentation is unaffected, and the{" "}
          <a href="/docs">index</a> lists it.
        </p>
        <p>
          <button type="button" className="docRetry" onClick={reset}>Try again</button>
        </p>
      </article>
      <aside className="docTocCol" />
    </div>
  );
}
