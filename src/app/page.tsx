"use client";

import { useState } from "react";

export default function Home() {
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);

  async function callClaude() {
    setOutput("");
    setLoading(true);

    const response = await fetch("/api/test-claude");
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      setOutput((prev) => prev + decoder.decode(value));
    }

    setLoading(false);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gray-950 p-8">
      <button
        onClick={callClaude}
        disabled={loading}
        className="rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {loading ? "Streaming..." : "Test Claude"}
      </button>

      {output && (
        <p className="max-w-md text-center text-lg text-white">{output}</p>
      )}
    </main>
  );
}