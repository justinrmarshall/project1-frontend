import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

export default function App() {
  const [computerName, setComputerName] = useState("");
  const [started, setStarted] = useState(false);
  const [results, setResults] = useState([]);                // current run’s site results
  const [history, setHistory] = useState([]);                // last 5 runs (persisted)
  const [runId, setRunId] = useState(null);                  // current run id
  const expectedCountRef = useRef(0);                        // how many tabs we opened for this run

  // DNS “ping” probe results
  const [dnsProbe, setDnsProbe] = useState(null);            // { cloudflareMs, googleMs, recommended }

  // ---------- Force dark mode ----------
  useEffect(() => {
    document.documentElement.classList.add("dark");
    return () => document.documentElement.classList.remove("dark");
  }, []);

  // ---------- Sites pool (editable & persisted) ----------
  const defaultSites = [
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
  ];
  const [siteText, setSiteText] = useState(defaultSites.join("\n"));

  const sites = useMemo(
    () =>
      siteText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    [siteText]
  );

  // ---------- Expectation thresholds ----------
  const expectations = {
    loadTimeMs: 1000, // 👈 per your request (1s)
    cpuTimeMs: 800,
    networkMs: 500,
    memoryMb: 400,
  };

  // ---------- Scoring ----------
  function scoreOne({ loadTime, cpuTime, networkLatency, memoryUsage }) {
    const raw =
      1000 -
      (0.4 * loadTime + 0.3 * cpuTime + 0.2 * networkLatency + 0.1 * memoryUsage);
    return Math.max(0, Math.round(raw));
  }
  function averageScore(items) {
    if (!items.length) return 0;
    return Math.round(items.reduce((acc, it) => acc + scoreOne(it), 0) / items.length);
  }

  // ---------- Message listener ----------
  useEffect(() => {
    function onMessage(event) {
      const data = event.data;
      if (!data || data.type !== "benchmarkResult") return;
      if (data.runId !== runId) return;

      setResults((prev) => {
        if (prev.some((p) => p.index === data.index)) return prev;
        const next = [...prev, data];

        // When all results are in, write history (cap 5) and maybe run DNS probe
        if (next.length === expectedCountRef.current) {
          const finalScore = averageScore(next);
          const runRecord = {
            id: runId,
            at: new Date(runId).toLocaleString(),
            computer: computerName,
            finalScore,
            results: next.sort((a, b) => a.index - b.index),
          };
          setHistory((old) => [runRecord, ...old].slice(0, 5));

          // If any load time > 1000 ms, run DNS “ping” probe
          const anySlow = next.some((r) => r.loadTime > expectations.loadTimeMs);
          if (anySlow) {
            runDnsProbe().then(setDnsProbe).catch(() => setDnsProbe(null));
          } else {
            setDnsProbe(null);
          }
        }
        return next;
      });
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [runId, computerName]);

  // ---------- Dynamic title ----------
  useEffect(() => {
    if (!started) {
      document.title = "BenchMark — Ready";
    } else if (results.length === 0) {
      document.title = "BenchMark — Running…";
    } else if (results.length < expectedCountRef.current) {
      document.title = `BenchMark — ${results.length}/${expectedCountRef.current}`;
    } else {
      document.title = "BenchMark — Done";
    }
  }, [started, results]);

  // ---------- Persist history & site list ----------
  useEffect(() => {
    try {
      const savedHist = localStorage.getItem("benchmark_history_v1");
      if (savedHist) setHistory(JSON.parse(savedHist));
      const savedSites = localStorage.getItem("benchmark_sites_v1");
      if (savedSites) setSiteText(JSON.parse(savedSites).join("\n"));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("benchmark_history_v1", JSON.stringify(history));
    } catch {}
  }, [history]);
  useEffect(() => {
    try {
      localStorage.setItem("benchmark_sites_v1", JSON.stringify(sites));
    } catch {}
  }, [sites]);

  // ---------- Export helpers ----------
  function toCSV(rows) {
    if (!rows?.length) return "";
    const headers = Object.keys(rows[0]);
    const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [
      headers.join(","),
      ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
    ];
    return lines.join("\n");
  }
  function download(filename, content, mime = "text/plain") {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ---------- DNS “ping” probe (HTTP RTT proxy) ----------
  async function probeOnce(url) {
    const t0 = performance.now();
    try {
      await fetch(url, { cache: "no-store" });
    } catch (e) {
      // CORS or network errors are okay; we still measured elapsed time
    }
    return performance.now() - t0;
  }
  async function runDnsProbe() {
    const [cloudflareMs, googleMs] = await Promise.all([
      probeOnce("https://1.1.1.1/cdn-cgi/trace"),
      probeOnce("https://dns.google/resolve?name=example.com&type=A"),
    ]);
    const recommended =
      cloudflareMs < googleMs ? "Cloudflare (1.1.1.1)" : "Google (8.8.8.8)";
    return {
      cloudflareMs: Math.round(cloudflareMs),
      googleMs: Math.round(googleMs),
      recommended,
    };
  }

  // ---------- Run benchmark ----------
  function runBenchmark() {
    if (!computerName.trim()) {
      alert("Please enter a computer name before running the benchmark.");
      return;
    }
    if (sites.length < 1) {
      alert("Add at least one test URL in the Site List.");
      return;
    }

    setDnsProbe(null);

    const shuffled = [...sites].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, Math.min(5, shuffled.length));

    const id = Date.now();
    setRunId(id);
    setStarted(true);
    setResults([]);
    expectedCountRef.current = selected.length;

    selected.forEach((site, index) => {
      const url = `/benchmark.html?site=${encodeURIComponent(site)}&runId=${id}&index=${index}`;
      window.open(url, "_blank", "width=420,height=420");
    });
  }

  // ---------- Derived UI helpers ----------
  const progressPct = expectedCountRef.current
    ? Math.round((results.length / expectedCountRef.current) * 100)
    : 0;

  const resultsWithScore = results
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((r) => ({ ...r, score: scoreOne(r) }));

  const summaryChartData = resultsWithScore.map((r, i) => ({
    name: `#${i + 1}`,
    score: r.score,
  }));

  const historyChartData = history
    .slice()
    .reverse()
    .map((h, i) => ({ name: `Run ${history.length - i}`, final: Math.round(h.finalScore) }));

  // CSV rows builders
  function currentRunCSVRows() {
    return resultsWithScore.map((r) => ({
      site: r.site,
      cpuTime: r.cpuTime?.toFixed?.(2),
      memoryUsage: r.memoryUsage?.toFixed?.(2),
      networkLatency: r.networkLatency?.toFixed?.(2),
      loadTime: r.loadTime?.toFixed?.(2),
      score: r.score,
    }));
  }

  function historyCSVRows() {
    const rows = [];
    for (const run of history) {
      for (const r of run.results) {
        rows.push({
          runId: run.id,
          runAt: run.at,
          computer: run.computer,
          finalScore: Math.round(run.finalScore),
          site: r.site,
          cpuTime: r.cpuTime.toFixed(2),
          memoryUsage: r.memoryUsage.toFixed(2),
          networkLatency: r.networkLatency.toFixed(2),
          loadTime: r.loadTime.toFixed(2),
          siteScore: scoreOne(r),
        });
      }
    }
    return rows;
  }

  return (
    <div className="p-6 text-center bg-gray-900 text-gray-100 min-h-screen">
      {/* Top bar */}
      <div className="flex items-center justify-between max-w-5xl mx-auto mb-4">
        <div className="text-left">
          <h1 className="text-2xl font-bold text-white">BenchMark</h1>
          <p className="text-sm text-gray-400">
            Multi-site browser benchmark (tabs). Allow popups for best results.
          </p>
        </div>
      </div>

      {/* Warning banner */}
      <div className="bg-yellow-200/10 border-l-4 border-yellow-400 text-yellow-200 p-3 mb-4 rounded max-w-5xl mx-auto">
        ⚠️ Benchmark opens multiple popup windows. Please disable your popup blocker for this site.
      </div>

      {/* Config: Computer name + Site list */}
      <div className="grid md:grid-cols-2 gap-4 max-w-5xl mx-auto text-left">
        <div className="bg-gray-800 rounded shadow p-4">
          <label className="block text-sm font-medium mb-1 text-gray-300">Computer Name</label>
          <input
            type="text"
            className="border border-gray-700 w-full p-2 rounded bg-gray-900 text-gray-100"
            placeholder="e.g., Work Laptop"
            value={computerName}
            onChange={(e) => setComputerName(e.target.value)}
          />
          <button
            onClick={runBenchmark}
            className="mt-3 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded"
          >
            Benchmark
          </button>

          {started && expectedCountRef.current > 0 && results.length < expectedCountRef.current && (
            <div className="mt-4">
              <div className="h-2 bg-gray-700 rounded">
                <div
                  className="h-2 bg-blue-500 rounded transition-all"
                  style={{ width: `${progressPct}%` }}
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progressPct}
                />
              </div>
              <div className="text-sm text-gray-400 mt-1">{progressPct}%</div>
            </div>
          )}
        </div>

        <div className="bg-gray-800 rounded shadow p-4">
          <label className="block text-sm font-medium mb-1 text-gray-300">
            Site List (one URL per line)
          </label>
          <textarea
            rows={8}
            className="border border-gray-700 w-full p-2 rounded font-mono text-sm bg-gray-900 text-gray-100"
            value={siteText}
            onChange={(e) => setSiteText(e.target.value)}
          />
          <p className="text-xs text-gray-400 mt-1">
            We’ll test up to 5 random sites from this list each run.
          </p>
        </div>
      </div>

      {/* Legend */}
      <div className="max-w-5xl mx-auto text-left bg-gray-800 rounded shadow p-4 mt-4">
        <h2 className="text-lg font-semibold mb-2 text-white">Legend & Scoring</h2>
        <ul className="list-disc pl-5 space-y-1 text-sm text-gray-300">
          <li><strong>Load Time (ms):</strong> Time to fully load the page (measured via iframe <code>onload</code>).</li>
          <li><strong>CPU (ms):</strong> Time for a synthetic compute loop (lower is better).</li>
          <li><strong>Network (ms):</strong> HTTP round-trip to the site (no-cors), as a latency proxy.</li>
          <li><strong>Memory (MB):</strong> JS heap usage (Chrome-only; others may report 0).</li>
          <li><strong>Score:</strong> Higher is better. <code>1000 - (0.4×Load + 0.3×CPU + 0.2×Network + 0.1×Memory)</code>.</li>
          <li>Cells highlighted (amber) exceed thresholds (Load &gt; 1000ms, CPU &gt; 800ms, Net &gt; 500ms, Mem &gt; 400MB).</li>
        </ul>
      </div>

      {/* Current run results + chart + export */}
      {started && (
        <div className="max-w-5xl mx-auto mt-6">
          <div className="bg-gray-800 rounded shadow p-4 overflow-x-auto">
            <h3 className="text-lg font-semibold mb-3 text-white">
              Current Results {computerName ? `— ${computerName}` : ""}
            </h3>
            {resultsWithScore.length === 0 ? (
              <p className="text-gray-400">Waiting for results…</p>
            ) : (
              <>
                <table className="w-full border border-gray-700 text-left text-sm">
                  <thead>
                    <tr className="bg-gray-700">
                      <th className="px-3 py-2 border border-gray-700">Site</th>
                      <th className="px-3 py-2 border border-gray-700">CPU (ms)</th>
                      <th className="px-3 py-2 border border-gray-700">Mem (MB)</th>
                      <th className="px-3 py-2 border border-gray-700">Net (ms)</th>
                      <th className="px-3 py-2 border border-gray-700">Load (ms)</th>
                      <th className="px-3 py-2 border border-gray-700">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultsWithScore.map((r) => {
                      const warn = {
                        cpu: r.cpuTime > expectations.cpuTimeMs,
                        mem: r.memoryUsage > expectations.memoryMb,
                        net: r.networkLatency > expectations.networkMs,
                        load: r.loadTime > expectations.loadTimeMs,
                      };
                      const cell = (value, isWarn) =>
                        <td className={`px-3 py-2 border border-gray-700 ${isWarn ? "bg-yellow-900/40" : ""}`}>{value}</td>;
                      return (
                        <tr key={r.index} className="border border-gray-700">
                          <td className="px-3 py-2 border border-gray-700">{r.site}</td>
                          {cell(r.cpuTime.toFixed(2), warn.cpu)}
                          {cell(r.memoryUsage.toFixed(2), warn.mem)}
                          {cell(r.networkLatency.toFixed(2), warn.net)}
                          {cell(r.loadTime.toFixed(2), warn.load)}
                          <td className="px-3 py-2 border border-gray-700 font-semibold text-green-400">
                            {r.score}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Per-site score chart */}
                <div className="h-72 mt-6">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={summaryChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="score" stroke="#60a5fa" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Export buttons */}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    className="bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-600"
                    onClick={() => {
                      download(
                        `benchmark-${Date.now()}.csv`,
                        toCSV(currentRunCSVRows()),
                        "text/csv"
                      );
                    }}
                  >
                    Export Current Run (CSV)
                  </button>
                  <button
                    className="bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-600"
                    onClick={() => {
                      download(
                        `benchmark-${Date.now()}.json`,
                        JSON.stringify({ computerName, results: resultsWithScore }, null, 2),
                        "application/json"
                      );
                    }}
                  >
                    Export Current Run (JSON)
                  </button>
                  <button
                    className="bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-600"
                    onClick={() => {
                      download(
                        `benchmark-history-${Date.now()}.csv`,
                        toCSV(historyCSVRows()),
                        "text/csv"
                      );
                    }}
                  >
                    Export History (CSV)
                  </button>
                  <button
                    className="bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-600"
                    onClick={() => {
                      download(
                        `benchmark-history-${Date.now()}.json`,
                        JSON.stringify(history, null, 2),
                        "application/json"
                      );
                    }}
                  >
                    Export History (JSON)
                  </button>
                </div>

                {/* Final score */}
                {resultsWithScore.length === expectedCountRef.current && (
                  <div className="mt-4 font-bold text-blue-300">
                    Final Computer Score: {averageScore(resultsWithScore)}
                  </div>
                )}
              </>
            )}
          </div>

          {/* If slow, show DNS “ping” recommendation */}
          {dnsProbe && (
            <div className="bg-gray-800 rounded shadow p-4 mt-4 text-left">
              <h4 className="text-white font-semibold mb-2">Quick DNS “Ping” (HTTP RTT)</h4>
              <p className="text-sm text-gray-300 mb-2">
                Some sites loaded over <strong>1000 ms</strong>. Here’s a one-shot latency probe to popular DNS resolvers:
              </p>
              <ul className="text-sm text-gray-200">
                <li>Cloudflare (1.1.1.1): <span className="font-mono">{dnsProbe.cloudflareMs} ms</span></li>
                <li>Google (8.8.8.8): <span className="font-mono">{dnsProbe.googleMs} ms</span></li>
              </ul>
              <p className="mt-2">
                <span className="text-blue-300 font-semibold">Recommended:</span> {dnsProbe.recommended}
              </p>
            </div>
          )}

          {/* History + chart */}
          {history.length > 0 && (
            <div className="bg-gray-800 rounded shadow p-4 mt-6">
              <h3 className="text-lg font-semibold mb-3 text-white">Benchmark History (last 5)</h3>

              <div className="h-72 mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={historyChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="final" stroke="#34d399" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-4 text-left">
                {history.map((h) => (
                  <details key={h.id} className="bg-gray-900 rounded p-3">
                    <summary className="cursor-pointer">
                      <span className="font-semibold text-white">{h.at}</span> — {h.computer} ·{" "}
                      <span className="text-blue-300 font-bold">
                        Final Score: {Math.round(h.finalScore)}
                      </span>
                    </summary>
                    <div className="mt-2">
                      <table className="w-full border border-gray-700 text-sm">
                        <thead>
                          <tr className="bg-gray-700">
                            <th className="px-2 py-1 border border-gray-700">Site</th>
                            <th className="px-2 py-1 border border-gray-700">CPU</th>
                            <th className="px-2 py-1 border border-gray-700">Mem</th>
                            <th className="px-2 py-1 border border-gray-700">Net</th>
                            <th className="px-2 py-1 border border-gray-700">Load</th>
                            <th className="px-2 py-1 border border-gray-700">Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {h.results.map((r) => (
                            <tr key={r.index}>
                              <td className="px-2 py-1 border border-gray-700">{r.site}</td>
                              <td className="px-2 py-1 border border-gray-700">{r.cpuTime.toFixed(1)}</td>
                              <td className="px-2 py-1 border border-gray-700">{r.memoryUsage.toFixed(1)}</td>
                              <td className="px-2 py-1 border border-gray-700">{r.networkLatency.toFixed(1)}</td>
                              <td className="px-2 py-1 border border-gray-700">{r.loadTime.toFixed(1)}</td>
                              <td className="px-2 py-1 border border-gray-700">{scoreOne(r)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
