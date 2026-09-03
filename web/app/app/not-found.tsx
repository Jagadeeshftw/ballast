/** A dashboard 404, inside the shell, offering the destinations that do exist. */
export default function NotFound() {
  return (
    <div className="panel">
      <h1 className="viewH1" style={{ fontSize: 22, marginBottom: 8 }}>There is no such view</h1>
      <p className="why">
        The dashboard has six: <a href="/app">Overview</a>, <a href="/app/cover">Cover</a>,{" "}
        <a href="/app/policy">Policy</a>, <a href="/app/funds">Funds</a>,{" "}
        <a href="/app/engine">Engine</a> and <a href="/app/activity">Activity</a>. They are all
        in the sidebar, and all of them read without a wallet.
      </p>
    </div>
  );
}
