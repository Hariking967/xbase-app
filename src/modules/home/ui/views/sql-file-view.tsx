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

export default function SQLFileView({
  file,
  onBack,
  chatHistory,
  userQuery,
  sending,
  onUserQueryChange,
  onSend,
  aiResponse,
  fileSpecificChatHistory,
}: {
  file: DbFile;
  onBack: () => void;
  chatHistory: string[];
  userQuery: string;
  sending: boolean;
  onUserQueryChange: (v: string) => void;
  onSend: () => void;
  aiResponse?: string;
  fileSpecificChatHistory: Array<{ user: string; ai: string }>;
}) {
  const isSchema =
    typeof file.bucket_url === "string" &&
    file.bucket_url.toLowerCase().includes("schema");

  // Resizable split state (percentages of container width)
  const [leftPct, setLeftPct] = useState(80);
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
    const pct = Math.max(20, Math.min(90, (x / rect.width) * 100));
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

  // Content loading via Ask AI
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [content, setContent] = useState<string>("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Array<Record<string, any>>>([]);

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

  // Parse bucket_url of the form: schema<user_root_id>|><table_name>
  const parseBucketUrl = useCallback(() => {
    const raw = file.bucket_url || "";
    const parts = raw.split("|>");
    const schemaPart = (parts[0] || "").trim();
    const tablePart = (parts[1] || "").trim();
    return { schemaPart, tablePart };
  }, [file.bucket_url]);

  const { schemaPart, tablePart } = parseBucketUrl();

  // Build db_info per latest requirement: include just the filename (table name)
  const dbInfo = tablePart ? `file_name: ${tablePart}` : "";

  useEffect(() => {
    const fetchSqlPreview = async () => {
      setLoading(true);
      setLoadError(null);
      setContent("");
      setHeaders([]);
      setRows([]);
      try {
        const NEXT_PUBLIC_BACKEND_URL =
          process.env.NEXT_PUBLIC_BACKEND_URL || "";
        // First, request only column names with DEV_NEEDS for strict formatting
        const query =
          "Return only the column names of the current table as a comma-separated list in a single line with no extra text. (DEV_NEEDS)";
        const res = await fetch(`${NEXT_PUBLIC_BACKEND_URL}/ask_ai`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            db_info: dbInfo,
            query,
            chat_history: [],
            parent_id: file.parent_id,
          }),
        });
        if (!res || !res.ok) {
          const text = res ? await res.text().catch(() => "") : "";
          throw new Error(text || "Failed to fetch SQL content");
        }
        const data = await res.json();
        console.log("AskAI columns (DEV_NEEDS) response:");
        console.log(data);

        // FIX: define aiText before using it
        const aiText = typeof data?.response === "string" ? data.response : "";

        // Parse column names from a comma-separated string; do NOT set rows here
        if (aiText) {
          const cols = aiText
            .split(/\s*[,|]\s*/)
            .map((c: string) => c.trim())
            .filter((s: string) => Boolean(s));
          if (cols.length > 0) {
            setHeaders(cols);
          }
        }

        // After columns, request full table rows via select all with DEV_NEEDS
        const resCols = await fetch(`${NEXT_PUBLIC_BACKEND_URL}/ask_ai`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            db_info: dbInfo,
            query: tablePart
              ? `Select all rows from ${tablePart}. (DEV_NEEDS)`
              : "Select all rows from the current table. (DEV_NEEDS)",
            chat_history: [],
            parent_id: file.parent_id,
          }),
        });
        if (resCols && resCols.ok) {
          const dataCols = await resCols.json();
          console.log("AskAI select-all (DEV_NEEDS) response:");
          console.log(dataCols);
          const sqlRes = Array.isArray(dataCols?.sql_res)
            ? (dataCols.sql_res as Array<Record<string, any>>)
            : [];
          if (sqlRes.length > 0) {
            const keys = Object.keys(sqlRes[0] || {});
            setHeaders(keys);
            setRows(sqlRes);
          } else {
            const txt =
              typeof dataCols?.response === "string" ? dataCols.response : "";
            const parsed =
              txt && txt.includes(",")
                ? Papa.parse(txt.trim(), { header: true })
                : ({ data: [], meta: { fields: [] } } as any);
            const dataRows = Array.isArray((parsed as any).data)
              ? ((parsed as any).data as any[]) || []
              : [];
            const keys =
              dataRows.length > 0
                ? Object.keys(dataRows[0])
                : Array.isArray((parsed as any).meta?.fields)
                ? ((parsed as any).meta.fields as string[]) || []
                : [];
            setRows(dataRows);
            setHeaders(keys.filter(Boolean));
          }
        } else {
          // Do not render narrative content from the columns call; keep UI clean
          setRows([]);
          setHeaders((headers) => headers);
        }

        // If neither sql_res nor parsed csv from the second call produced rows,
        // try to parse the primary response body as CSV to render a simple table.
        if (rows.length === 0 && headers.length === 0) {
          const fallbackRes = await fetch(`${NEXT_PUBLIC_BACKEND_URL}/ask_ai`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              db_info: dbInfo,
              query: "Return the selected result as raw CSV (DEV_NEEDS).",
              chat_history: [],
              parent_id: file.parent_id,
            }),
          });
          if (fallbackRes && fallbackRes.ok) {
            const fb = await fallbackRes.json();
            console.log("AskAI fallback CSV response:");
            console.log(fb);
            const raw =
              typeof fb?.response === "string" ? fb.response.trim() : "";
            if (raw && /[,]/.test(raw) && /\n/.test(raw)) {
              const parsed = Papa.parse(raw, {
                header: true,
                skipEmptyLines: true,
              });
              const dataRows = Array.isArray(parsed.data)
                ? (parsed.data as any[])
                : [];
              const keys =
                dataRows.length > 0
                  ? Object.keys(dataRows[0])
                  : Array.isArray(parsed.meta?.fields)
                  ? (parsed.meta.fields as string[])
                  : [];
              if (keys.length > 0) setHeaders(keys);
              if (dataRows.length > 0) setRows(dataRows);
            } else {
              setContent(raw);
            }
          }
        }

        setLoading(false);
      } catch (err: any) {
        setLoadError(err?.message || "Failed to load SQL content");
        setLoading(false);
      }
    };
    fetchSqlPreview();
  }, [file.parent_id, file.bucket_url]);

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

      <div
        ref={containerRef}
        className="flex-1 flex gap-0 w-full min-h-0 bg-neutral-900"
      >
        {/* Left pane: SQL content */}
        <section
          className="flex flex-col min-h-0 space-y-4 pr-2 bg-neutral-900"
          style={{ width: `${leftPct}%`, minWidth: "20%" }}
        >
          <div className="text-2xl md:text-3xl font-bold text-white">
            {file.name}
          </div>
          <div className="flex-1 rounded-md border border-neutral-800 bg-neutral-800 p-4 text-neutral-300 overflow-auto">
            {loading && <p className="text-neutral-400">Loading content...</p>}
            {loadError && <p className="text-red-400 text-sm">{loadError}</p>}

            {/* Proper table when we have headers + rows parsed from CSV/ask_ai */}
            {!loading &&
              !loadError &&
              rows.length > 0 &&
              headers.length > 0 && (
                <div className="rounded-md border border-neutral-700 bg-neutral-900 p-4 overflow-auto">
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
                      {rows.map((row, rIdx) => (
                        <tr key={rIdx} className="text-neutral-300">
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

            {/* If headers exist but no rows, show columns */}
            {!loading &&
              !loadError &&
              rows.length === 0 &&
              headers.length > 0 && (
                <div className="rounded-md border border-neutral-700 bg-neutral-900 p-4">
                  <div className="text-neutral-300 mb-2">Columns</div>
                  <div className="flex flex-wrap gap-2">
                    {headers.map((h) => (
                      <span
                        key={h}
                        className="px-2 py-1 text-xs rounded-md bg-neutral-700 text-white"
                      >
                        {h}
                      </span>
                    ))}
                  </div>
                </div>
              )}

            {/* Fallback raw content */}
            {!loading &&
              !loadError &&
              rows.length === 0 &&
              headers.length === 0 && (
                <div className="rounded-md border border-neutral-700 bg-neutral-900 p-4">
                  <pre className="text-xs md:text-sm text-neutral-200 whitespace-pre-wrap">
                    {content || "No content to display."}
                  </pre>
                </div>
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

          {/* DataSpark local state: chat_history and image_box */}
          {/* These ensure every ask_ai call carries bucket_url and updates locally */}
          {(() => {
            // local states scoped in render via closures
            // initialize once using hooks above component return
            return null;
          })()}
          <DataSparkChat
            bucketUrl={file.bucket_url}
            parentId={file.parent_id}
            initialUserQuery={userQuery}
            onAppendHistory={(pair) => {
              // keep existing history view in sync
              fileSpecificChatHistory.push(pair);
            }}
          />

          {/* Composer moved inside DataSparkChat */}
        </aside>
      </div>
    </div>
  );
}

// Lightweight embedded component to encapsulate DataSpark chat logic
function DataSparkChat({
  bucketUrl,
  parentId,
  initialUserQuery,
  onAppendHistory,
}: {
  bucketUrl: string;
  parentId: string;
  initialUserQuery: string;
  onAppendHistory: (pair: { user: string; ai: string }) => void;
}) {
  const [localQuery, setLocalQuery] = useState(initialUserQuery || "");
  const [sending, setSending] = useState(false);
  const [chatHistory, setChatHistory] = useState<string[]>([]);
  const [imageBox, setImageBox] = useState<any[]>([]);
  // New: maintain current_chat as list of { user, ai } pairs for UI
  const [currentChat, setCurrentChat] = useState<
    Array<{ user: string; ai: string }>
  >([]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (sending) return;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void send();
      }
    },
    [sending, localQuery, bucketUrl, parentId]
  );

  const send = useCallback(async () => {
    const q = localQuery.trim();
    if (!q) return;
    setSending(true);
    try {
      const NEXT_PUBLIC_BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "";
      const res = await fetch(`${NEXT_PUBLIC_BACKEND_URL}/ask_ai`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          // Always send schema-only bucket_url and the current table name in db_info
          db_info:
            (bucketUrl
              ? `bucket_url: ${bucketUrl.split("|>")[0].trim()}`
              : "") +
            (bucketUrl.includes("|>")
              ? ", Current table is " + bucketUrl.split("|>")[1].trim()
              : ""),
          query: q,
          chat_history: chatHistory, // [] in preview calls
          parent_id: parentId, // file.parent_id in preview calls
        }),
      });
      if (!res || !res.ok) {
        setSending(false);
        return;
      }
      const data = await res.json();
      console.log("AskAI DataSpark chat response (full object):");
      console.log(data);
      const nextHistory: string[] = Array.isArray(data?.chat_history)
        ? data.chat_history
        : chatHistory;
      setChatHistory(nextHistory);

      const aiText = typeof data?.response === "string" ? data.response : "";
      const nextImageBox: any[] = Array.isArray(data?.image_box)
        ? data.image_box
        : imageBox;
      setImageBox(nextImageBox);

      // Update local current_chat list for rendering in DataSpark
      setCurrentChat((prev) => [...prev, { user: q, ai: aiText }]);
      // Keep parent fileSpecificChatHistory in sync as before
      onAppendHistory({ user: q, ai: aiText });
      setLocalQuery("");
      setSending(false);
    } catch {
      setSending(false);
    }
  }, [localQuery, chatHistory, imageBox, bucketUrl, parentId, onAppendHistory]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 overflow-auto rounded-md border border-neutral-800 bg-neutral-900 p-3 space-y-3">
        {currentChat.length === 0 ? (
          <div className="text-neutral-400 text-sm">
            Ask questions about this file. Context will include bucket_url.
          </div>
        ) : (
          currentChat.map((turn, idx) => (
            <div key={idx} className="space-y-2">
              <div className="rounded-md px-3 py-2 text-sm whitespace-pre-wrap bg-neutral-700 text-neutral-50">
                {turn.user}
              </div>
              <div className="rounded-md px-3 py-2 text-sm whitespace-pre-wrap bg-\[#123d16\] text-\[#39FF14\]">
                {turn.ai}
              </div>
            </div>
          ))
        )}
        {imageBox.length > 0 && (
          <div className="rounded-md border border-neutral-700 bg-neutral-900 p-3">
            <div className="text-neutral-300 mb-2">Images</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {imageBox.map((img: any, i: number) => (
                <img
                  key={i}
                  src={img?.url || ""}
                  alt={img?.alt || `image-${i}`}
                  className="rounded-md border border-neutral-800"
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 pt-2 mb-5">
        <Input
          value={localQuery}
          onChange={(e) => setLocalQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your question..."
          className="flex-1 bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-400"
          disabled={sending}
        />
        <Button
          className="bg-[#39FF14] text-black hover:bg-[#2fd310]"
          disabled={sending}
          onClick={() => void send()}
        >
          {sending ? "Sending..." : "Send"}
        </Button>
      </div>
    </div>
  );
}
