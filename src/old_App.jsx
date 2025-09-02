import React, { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

// Generate sample CPU & Memory data
const generateData = () =>
  Array.from({ length: 10 }, (_, i) => ({
    name: `T${i + 1}`,
    CPU: Math.floor(Math.random() * 100),
    Memory: Math.floor(Math.random() * 100),
  }));

export default function App() {
  const [data, setData] = useState(generateData());

  useEffect(() => {
    const interval = setInterval(() => setData(generateData()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen p-4 bg-gray-100">
      <h1 className="text-3xl font-bold text-center mb-6">
        Project 1 Dashboard
      </h1>
      <div className="flex justify-center">
        <LineChart width={700} height={350} data={data}>
          <CartesianGrid stroke="#ccc" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="CPU" stroke="#8884d8" />
          <Line type="monotone" dataKey="Memory" stroke="#82ca9d" />
        </LineChart>
      </div>
    </div>
  );
}
