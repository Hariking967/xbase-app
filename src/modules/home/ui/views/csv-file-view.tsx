"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Papa from "papaparse";

interface DbFile {
  id: string;
  name: string;
  created_at: string;
  parent_id: string;
  bucket_url: string;
}

export default function CSVFileView({
  file,
  onBack,
  chatHistory,
  userQuery,
  sending,
  csvColumns,
  onUserQueryChange,
  onSend,
  onColumnsChange,
  aiResponse,
  fileSpecificChatHistory,
}: {
  file: DbFile;
  onBack: () => void;
  chatHistory: string[];
  userQuery: string;
  sending: boolean;
  csvColumns: string[];
  onUserQueryChange: (v: string) => void;
  onSend: () => void;
  onColumnsChange?: (cols: string[]) => void;
  aiResponse?: string;
  fileSpecificChatHistory: Array<{ user: string; ai: string }>;
}) {
  const isSchema =
    typeof file.bucket_url === "string" &&
    file.bucket_url.toLowerCase().includes("schema");

  // Resizable split state (percentages of container width)
  const [leftPct, setLeftPct] = useState(80); // default 4:1 -> 80% : 20%
  const containerRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const onMouseDownDivider = useCallback((e: React.MouseEvent) => {
    draggingRef.current = true;
    e.preventDefault();
  }, []);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!draggingRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(20, Math.min(90, (x / rect.width) * 100)); // clamp between 20% and 90%
    setLeftPct(pct);
  }, []);

  const onMouseUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  // Content loading
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<Array<Record<string, any>>>([]);
  const [headers, setHeaders] = useState<string[]>([]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setLoadError(null);
      setRows([]);
      setHeaders([]);

      try {
        const apiUrl = `/api/files?url=${encodeURIComponent(file.bucket_url)}`;
        console.debug("FileView: Fetching via query mode", {
          apiUrl,
          fileName: file.name,
        });

        const res = await fetch(apiUrl);
        if (!res.ok) {
          const bodyText = await res.text().catch(() => "");
          console.error("FileView: Fetch content failed", {
            status: res.status,
            statusText: res.statusText,
            apiUrl,
            body: bodyText,
          });
          throw new Error(`Fetch failed (${res.status}) - ${bodyText}`);
        }

        const text = await res.text();
        const looksCsv = file.name.toLowerCase().endsWith(".csv");
        if (!looksCsv) {
          setHeaders(["Content"]);
          setRows([{ Content: text }]);
          setLoading(false);
          return;
        }

        const parsed = Papa.parse(text, { header: true });
        const dataRows = Array.isArray(parsed.data)
          ? (parsed.data as any[])
          : [];
        const keys =
          dataRows.length > 0
            ? Object.keys(dataRows[0])
            : Array.isArray(parsed.meta?.fields)
            ? (parsed.meta.fields as string[])
            : [];
        setRows(dataRows);
        setHeaders(keys);
        // NEW: inform parent of columns parsed from the actual CSV content
        if (onColumnsChange) {
          onColumnsChange(keys.filter(Boolean));
        }
        setLoading(false);
      } catch (err: any) {
        setLoadError(err?.message || "Failed to load file content");
        setLoading(false);
      }
    };
    run();
  }, [file.bucket_url, file.name, onColumnsChange]);

  // Send on Enter (without Shift)
  const handleComposerKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (sending) return;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onSend();
      }
    },
    [sending, onSend]
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 bg-neutral-900">
      <div className="flex items-center justify-between">
        <Button
          type="button"
          className="bg-neutral-800 hover:bg-neutral-700 text-white"
          onClick={onBack}
        >
          Back
        </Button>
      </div>

      {/* Split container fills remaining height so right pane matches sidebar height */}
      <div
        ref={containerRef}
        className="flex-1 flex gap-0 w-full min-h-0 bg-neutral-900"
      >
        {/* Left pane: CSV table/content */}
        <section
          className="flex flex-col min-h-0 space-y-4 pr-2 bg-neutral-900"
          style={{ width: `${leftPct}%`, minWidth: "20%" }}
        >
          <div className="text-2xl md:text-3xl font-bold text-white">
            {file.name}
          </div>

          {/* Content Scrollable */}
          <div className="flex-1 rounded-md border border-neutral-800 bg-neutral-800 p-4 text-neutral-300 overflow-auto">
            {loading && <p className="text-neutral-400">Loading content...</p>}
            {loadError && <p className="text-red-400 text-sm">{loadError}</p>}

            {!loading &&
              !loadError &&
              rows.length > 0 &&
              headers.length > 0 && (
                <div className="overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-neutral-200">
                        {headers.map((key) => (
                          <th
                            key={key}
                            className="px-3 py-2 text-left border-b border-neutral-700"
                          >
                            {key}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, idx) => (
                        <tr key={idx} className="text-neutral-300">
                          {headers.map((key) => (
                            <td
                              key={key}
                              className="px-3 py-2 border-b border-neutral-800"
                            >
                              {String(row[key] ?? "")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

            {!loading && !loadError && rows.length === 0 && (
              <p className="text-neutral-400">No content to display.</p>
            )}
          </div>
        </section>

        {/* Divider */}
        <div
          onMouseDown={onMouseDownDivider}
          className="relative w-[8px] cursor-col-resize group"
          style={{ minWidth: "8px" }}
          title="Resize"
        >
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-neutral-700 group-hover:bg-[#39FF14]" />
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs text-neutral-400 opacity-0 group-hover:opacity-100 select-none">
            &lt;-&gt;
          </div>
        </div>

        {/* Right pane: DataSpark chatbot */}
        <aside
          className="pl-2 flex flex-col h-full min-h-0 bg-neutral-900"
          style={{ width: `${100 - leftPct}%`, minWidth: "10%" }}
        >
          <div className="p-3 rounded-md bg-neutral-800 border border-neutral-800">
            <h3 className="text-lg font-semibold text-white">DataSpark ✨</h3>
          </div>

          {/* Chat area: render exact pairs from FileSpecificChatHistory */}
          <div className="flex-1 min-h-0 overflow-auto rounded-md border border-neutral-800 bg-neutral-900 p-3 space-y-3">
            {fileSpecificChatHistory.length === 0 ? (
              <div className="text-neutral-400 text-sm">
                Ask questions about this file. Context will include:{" "}
                {(headers.length ? headers : csvColumns).join(", ") ||
                  "no columns detected"}
                .
              </div>
            ) : (
              fileSpecificChatHistory.map((turn, idx) => (
                <div key={idx} className="space-y-2">
                  <div className="rounded-md px-3 py-2 text-sm whitespace-pre-wrap bg-neutral-700 text-neutral-50">
                    {turn.user}
                  </div>
                  <div className="rounded-md px-3 py-2 text-sm whitespace-pre-wrap bg-[#123d16] text-[#39FF14]">
                    {turn.ai}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Composer */}
          <div className="flex items-center gap-2 pt-2 mb-5">
            <Input
              value={userQuery}
              onChange={(e) => onUserQueryChange(e.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder="Type your question..."
              className="flex-1 bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-400"
              disabled={sending}
            />
            <Button
              className="bg-[#39FF14] text-black hover:bg-[#2fd310]"
              disabled={sending}
              onClick={onSend}
            >
              {sending ? "Sending..." : "Send"}
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
