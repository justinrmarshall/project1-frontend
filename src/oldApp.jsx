import React, { useState, useEffect } from "react";
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

function App() {
  const [results, setResults] = useState([]);
  const [showDashboard, setShowDashboard] = useState(false);

  // List of real URLs to pick randomly
  const allUrls = [
    "https://example.com",
    "https://github.com",
    "https://wikipedia.org",
    "https://cnn.com",
    "https://nytimes.com",
    "https://bbc.com",
    "https://reddit.com",
    "https://stackoverflow.com",
    "https://twitter.com",
    "https://linkedin.com",
  ];

  useEffect(() => {
    const channel = new BroadcastChannel("benchmark_channel");
    channel.onmessage = (event) => {
      setResults((prev) => [...prev, event.data]);
    };
    return () => channel.close();
  }, []);

  const runBenchmark = () => {
    setResults([]);
    setShowDashboard(true);

    // Pick 5 random URLs
    const shuffled = allUrls.sort(() => 0.5 - Math.random());
    const testUrls = shuffled.slice(0, 5);

    testUrls.forEach((url) => {
      window.open(
        `/benchmark.html?site=${encodeURIComponent(url)}`,
        "_blank",
        "width=400,height=300"
      );
    });
  };

  return (
    <div className="p-6">
      {/* Popup Blocker Warning */}
      <div className="max-w-xl mx-auto text-center mb-6 text-red-600 font-semibold">
        ⚠️ Make sure pop-up blockers are disabled. Tabs will open for benchmarking.
      </div>

      {/* Benchmark Button */}
      <div className="flex justify-center mt-6 mb-12">
        <button
          className="px-6 py-3 bg-blue-600 text-white text-lg rounded-lg shadow-md"
          onClick={runBenchmark}
        >
          Benchmark
        </button>
      </div>

      {/* Dashboard */}
      {showDashboard && (
        <div className="bg-white shadow-md rounded-lg p-6 max-w-4xl mx-auto">
          <h2 className="text-xl font-semibold mb-4 text-center">
            Tab Benchmark Results
          </h2>

          {results.length === 0 && (
            <p className="text-gray-500 text-center">Waiting for results...</p>
          )}

          {results.length > 0 && (
            <div className="space-y-8">
              {/* Raw Results List */}
              <ul className="space-y-2">
                {results.map((r, i) => (
                  <li
                    key={i}
                    className="border-b border-gray-200 pb-2 flex justify-between"
                  >
                    <span className="font-medium">{r.site}</span>
                    <span>
                      CPU: {r.cpu}ms | Network: {r.network}ms | Memory:{" "}
                      {r.memory}MB
                    </span>
                  </li>
                ))}
              </ul>

              {/* Chart */}
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={results}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="site" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="cpu" stroke="#8884d8" />
                    <Line type="monotone" dataKey="network" stroke="#82ca9d" />
                    <Line type="monotone" dataKey="memory" stroke="#ffc658" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
