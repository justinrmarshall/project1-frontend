import React, { useEffect, useMemo, useRef, useState } from "react";

export default function App() {
  const [computerName, setComputerName] = useState("");
  const [started, setStarted] = useState(false);
  const [results, setResults] = useState([]);             // current run’s site results
  const [history, setHistory] = useState([]);             // last 5 runs
  const [runId, setRunId] = useState(null);               // current run id
  const expectedCountRef = useRef(0);                     // how many tabs we opened for this run

  // pool of candidate sites – tweak as you like
  const sites = useMemo(
    () => [
      "https://example.com",
      "https://wikipedia.org",
      "https://github.com",
      "https://nytimes.com",
      "https://openai.com",
      "https://cnn.com",
      "https://bbc.com",
      "https://mozilla.org",
      "https://reddit.com",
      "https://stackoverflow.com",
    ],
    []
  );

  // Add *one* message listener that collects results for the active run
  useEffect(() => {
    function onMessage(event) {
      // In dev you can relax origin checks. In prod, check event.origin.
      const data = event.data;
      if (!data || data.type !== "benchmarkResult") return;
      if (data.runId !== runId) return; // ignore from previous runs

      setResults((prev) => {
        // avoid duplicates by index
        if (prev.some((p) => p.index === data.index)) return prev;
        const next = [...prev, data];
        // if all results have arrived, record history (cap 5)
        if (next.length === expectedCountRef.current) {
          const finalScore = averageScore(next);
          const runRecord = {
            id: runId,
            at: new Date(runId).toLocaleString(),
            computer: computerName,
            finalScore,
            results: next,
          };
          setHistory((old) => [runRecord, ...old].slice(0, 5));
        }
        return next;
      });
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [runId, computerName]);

  // Simple weighted scoring (you can tune weights)
  function scoreOne({ loadTime, cpuTime, networkLatency, memoryUsage }) {
    // lower is better → subtract from base
    // weights: load 40%, cpu 30%, net 20%, mem 10
    const score =
      1000 -
      (0.4 * loadTime + 0.3 * cpuTime + 0.2 * networkLatency + 0.1 * memoryUsage);
    return Math.max(0, Math.round(score));
  }

  function averageScore(items) {
    if (!items.length) return 0;
    const sum = items.reduce((acc, it) => acc + scoreOne(it), 0);
    return Math.round(sum / items.length);
  }

  function runBenchmark() {
    if (!computerName.trim()) {
      alert("Please enter a computer name before running the benchmark.");
      return;
    }

    // pick 5 random sites
    const shuffled = [...sites].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 5);

    const id = Date.now();
    setRunId(id);
    setStarted(true);
    setResults([]);
    expectedCountRef.current = selected.length;

    // open popups
    selected.forEach((site, index) => {
      const url = `/benchmark.html?site=${encodeURIComponent(site)}&runId=${id}&index=${index}`;
      window.open(url, "_blank", "width=420,height=420");
    });
  }

  return (
    <div className="p-6 text-center">
      {/* Always-visible popup warning */}
      <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-4 rounded">
        ⚠️ Benchmark opens multiple popup windows. Please disable your popup blocker for this site.
      </div>

      {/* Input + Button (shown until first run starts) */}
      {!started && (
        <div className="flex items-center justify-center gap-3">
          <input
            type="text"
            placeholder="Enter computer name"
            className="border p-2 rounded w-64 text-center"
            value={computerName}
            onChange={(e) => setComputerName(e.target.value)}
          />
          <button
            onClick={runBenchmark}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg shadow hover:bg-blue-700"
          >
            Benchmark
          </button>
        </div>
      )}

      {/* Current run results */}
      {started && (
        <div className="mt-8">
          <h2 className="text-xl font-bold mb-4">
            Benchmark Results {computerName ? `— ${computerName}` : ""}
          </h2>

          {results.length === 0 ? (
            <p className="text-gray-500">Waiting for results…</p>
          ) : (
            <>
              <table className="mx-auto border border-gray-300 text-left">
                <thead>
                  <tr className="bg-gray-200">
                    <th className="px-3 py-2 border">Site</th>
                    <th className="px-3 py-2 border">CPU (ms)</th>
                    <th className="px-3 py-2 border">Memory (MB)</th>
                    <th className="px-3 py-2 border">Network (ms)</th>
                    <th className="px-3 py-2 border">Load (ms)</th>
                    <th className="px-3 py-2 border">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {results
                    .sort((a, b) => a.index - b.index)
                    .map((r) => (
                      <tr key={r.index} className="border">
                        <td className="px-3 py-2 border">{r.site}</td>
                        <td className="px-3 py-2 border">{r.cpuTime.toFixed(2)}</td>
                        <td className="px-3 py-2 border">{r.memoryUsage.toFixed(2)}</td>
                        <td className="px-3 py-2 border">{r.networkLatency.toFixed(2)}</td>
                        <td className="px-3 py-2 border">{r.loadTime.toFixed(2)}</td>
                        <td className="px-3 py-2 border font-semibold text-green-700">
                          {scoreOne(r)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>

              {/* Show final computer score once all have arrived */}
              {results.length === expectedCountRef.current && (
                <div className="mt-4 font-bold text-blue-700">
                  Final Computer Score: {averageScore(results)}
                </div>
              )}

              <div className="mt-6">
                <button
                  className="bg-blue-600 text-white px-5 py-2 rounded hover:bg-blue-700"
                  onClick={runBenchmark}
                >
                  Run Again
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* History (last 5 runs) */}
      {history.length > 0 && (
        <div className="mt-12">
          <h3 className="text-xl font-bold mb-3">Benchmark History (last 5)</h3>
          <div className="max-w-3xl mx-auto text-left space-y-4">
            {history.map((h) => (
              <div key={h.id} className="bg-white rounded shadow p-4">
                <div className="font-semibold">
                  {h.at} — {h.computer}
                </div>
                <div className="text-blue-700 font-bold">
                  Final Score: {Math.round(h.finalScore)}
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-gray-700">Show details</summary>
                  <div className="mt-2">
                    <table className="w-full border border-gray-200 text-sm">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="px-2 py-1 border">Site</th>
                          <th className="px-2 py-1 border">CPU</th>
                          <th className="px-2 py-1 border">Mem</th>
                          <th className="px-2 py-1 border">Net</th>
                          <th className="px-2 py-1 border">Load</th>
                          <th className="px-2 py-1 border">Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {h.results
                          .sort((a, b) => a.index - b.index)
                          .map((r) => (
                            <tr key={r.index}>
                              <td className="px-2 py-1 border">{r.site}</td>
                              <td className="px-2 py-1 border">{r.cpuTime.toFixed(1)}</td>
                              <td className="px-2 py-1 border">{r.memoryUsage.toFixed(1)}</td>
                              <td className="px-2 py-1 border">{r.networkLatency.toFixed(1)}</td>
                              <td className="px-2 py-1 border">{r.loadTime.toFixed(1)}</td>
                              <td className="px-2 py-1 border">{scoreOne(r)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
