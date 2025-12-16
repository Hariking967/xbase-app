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
  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editedRows, setEditedRows] = useState<Array<Record<string, any>>>([]);
  const [editingCell, setEditingCell] = useState<{
    r: number;
    c: string;
  } | null>(null);

  // Helper: extract user_root_id and file_name from public URL
  const parseBucketUrl = useCallback(() => {
    try {
      const u = new URL(file.bucket_url);
      const parts = u.pathname.split("/"); // .../public/<bucket>/<user_root_id>/<filename>
      const pubIdx = parts.findIndex((p) => p === "public");
      const bucket = parts[pubIdx + 1];
      const userRootId = parts[pubIdx + 2];
      const fileName = parts.slice(pubIdx + 3).join("/"); // supports nested paths
      return { bucket, userRootId, fileName };
    } catch {
      return { bucket: "", userRootId: "", fileName: "" };
    }
  }, [file.bucket_url]);

  // Load CSV content
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
        setEditedRows(dataRows); // keep a working copy
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
  }, [
    file.bucket_url,
    file.name,
    onColumnsChange,
    fileSpecificChatHistory.length,
  ]);

  // Double-click to edit a cell
  const onCellDblClick = (rIdx: number, key: string) => {
    setEditingCell({ r: rIdx, c: key });
    setIsEditing(true);
  };

  // Change cell value
  const onCellChange = (rIdx: number, key: string, val: string) => {
    setEditedRows((prev) => {
      const next = [...prev];
      const row = { ...next[rIdx] };
      row[key] = val;
      next[rIdx] = row;
      return next;
    });
  };

  // Finish edit on Enter or blur
  const finishEdit = () => {
    setEditingCell(null);
  };

  // Generate CSV string from headers + editedRows
  const toCsv = () => {
    const lines: string[] = [];
    lines.push(headers.join(","));
    for (const row of editedRows) {
      const fields = headers.map((h) => {
        const v = row[h] ?? "";
        const s = String(v);
        // Quote if contains comma, quote, or newline
        if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
      });
      lines.push(fields.join(","));
    }
    return lines.join("\n");
  };

  // Save to Supabase via API
  const saveEdits = async () => {
    const { userRootId, fileName, bucket } = parseBucketUrl();
    if (!userRootId || !fileName) return;

    const csvText = toCsv();
    const blob = new Blob([csvText], { type: "text/csv" });
    const fileObj = new File([blob], fileName, { type: "text/csv" });

    const form = new FormData();
    form.append("file", fileObj);
    form.append("user_root_id", userRootId);
    form.append("file_name", fileName);

    // Log where the upsert will happen
    const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(
      /\/+$/,
      ""
    );
    const publicUrl =
      bucket && base
        ? `${base}/storage/v1/object/public/${bucket}/${userRootId}/${fileName}`
        : `${userRootId}/${fileName}`;
    console.log("Upserting CSV to storage URL:", publicUrl);
    console.log("Calling API endpoint:", "/api/files/update");

    try {
      const res = await fetch("/api/files/update", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("Update failed", {
          status: res.status,
          body: text.slice(0, 200),
        });
        return;
      }
      // Commit editedRows to rows and exit edit mode
      setRows(editedRows);
      setIsEditing(false);
      setEditingCell(null);
    } catch (e) {
      console.error("Update error", e);
    }
  };

  const cancelEdits = () => {
    setEditedRows(rows); // revert working copy
    setIsEditing(false);
    setEditingCell(null);
  };

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
              editedRows.length > 0 &&
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
                      {editedRows.map((row, rIdx) => (
                        <tr key={rIdx} className="text-neutral-300">
                          {headers.map((key) => {
                            const isActive =
                              editingCell &&
                              editingCell.r === rIdx &&
                              editingCell.c === key;
                            return (
                              <td
                                key={key}
                                className="px-3 py-2 border-b border-neutral-800 cursor-pointer"
                                onDoubleClick={() => onCellDblClick(rIdx, key)}
                              >
                                {isActive ? (
                                  <input
                                    className="w-full bg-neutral-700 text-white px-2 py-1 rounded-sm outline-none"
                                    value={String(row[key] ?? "")}
                                    onChange={(e) =>
                                      onCellChange(rIdx, key, e.target.value)
                                    }
                                    onBlur={finishEdit}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") finishEdit();
                                    }}
                                    autoFocus
                                  />
                                ) : (
                                  String(row[key] ?? "")
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

            {!loading && !loadError && editedRows.length === 0 && (
              <p className="text-neutral-400">No content to display.</p>
            )}

            {/* Move Save/Cancel inside the content section; right-aligned and sticky so it stays visible when scrolling */}
            {isEditing && (
              <div className="sticky bottom-4">
                <div className="flex justify-end gap-3">
                  <Button
                    type="button"
                    className="bg-neutral-700 hover:bg-neutral-600 text-white"
                    onClick={cancelEdits}
                    title="Cancel edits"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    className="bg-[#39FF14] text-black hover:bg-[#2fd310]"
                    onClick={saveEdits}
                    title="Save changes"
                  >
                    Save
                  </Button>
                </div>
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

          {/* DataSpark chat with bucket_url-aware sending */}
          <CSVDataSparkChat
            bucketUrl={file.bucket_url}
            parentId={file.parent_id}
            headersHint={headers.length ? headers : csvColumns}
            initialUserQuery={userQuery}
            sendingExternal={sending}
            onUpdateQuery={onUserQueryChange}
            onAppendHistory={(pair) => {
              fileSpecificChatHistory.push(pair);
            }}
          />
        </aside>
      </div>
    </div>
  );
}

// Lightweight DataSpark chat for CSV view that always sends bucket_url to /ask_ai
function CSVDataSparkChat({
  bucketUrl,
  parentId,
  headersHint,
  initialUserQuery,
  sendingExternal,
  onUpdateQuery,
  onAppendHistory,
}: {
  bucketUrl: string;
  parentId: string;
  headersHint: string[];
  initialUserQuery: string;
  sendingExternal: boolean;
  onUpdateQuery: (v: string) => void;
  onAppendHistory: (pair: { user: string; ai: string }) => void;
}) {
  const [localQuery, setLocalQuery] = useState(initialUserQuery || "");
  const [sending, setSending] = useState(false);
  const [currentChat, setCurrentChat] = useState<
    Array<{ user: string; ai: string }>
  >([]);

  useEffect(() => {
    // keep external query in sync
    onUpdateQuery(localQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localQuery]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (sending || sendingExternal) return;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void send();
      }
    },
    [sending, sendingExternal, localQuery, bucketUrl, parentId]
  );

  const send = useCallback(async () => {
    const q = localQuery.trim();
    if (!q) return;
    setSending(true);
    try {
      const NEXT_PUBLIC_BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "";
      // Derive filename from bucket URL
      let fileName = "";
      try {
        const u = new URL(bucketUrl);
        const pathParts = u.pathname.split("/").filter(Boolean);
        fileName = pathParts[pathParts.length - 1] || "";
      } catch {
        // Fallbacks
        const parts = bucketUrl.split("/");
        fileName = parts[parts.length - 1] || bucketUrl;
      }
      console.log(
        "db_info:\n" +
          `CSV:\n` +
          `File: ${fileName}\n` +
          "Columns: " +
          `${headersHint.join(", ")}` +
          "\n" +
          "bucket_url:" +
          bucketUrl.split("/").slice(-2).join("/")
      );
      const res = await fetch(`${NEXT_PUBLIC_BACKEND_URL}/ask_ai`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          db_info:
            `CSV:\n` +
            `File: ${fileName}\n` +
            "Columns: " +
            `${headersHint.join(", ")}` +
            "\n" +
            "bucket_url:" +
            bucketUrl.split("/").slice(-2).join("/"),
          bucket_url: bucketUrl,
          query: q,
          chat_history: [],
          parent_id: parentId,
        }),
      });
      if (!res || !res.ok) {
        setSending(false);
        return;
      }
      const data = await res.json();
      const aiText = typeof data?.response === "string" ? data.response : "";
      setCurrentChat((prev) => [...prev, { user: q, ai: aiText }]);
      onAppendHistory({ user: q, ai: aiText });
      setLocalQuery("");
      setSending(false);
    } catch {
      setSending(false);
    }
  }, [localQuery, headersHint, bucketUrl, parentId, onAppendHistory]);

  return (
    <>
      <div className="flex-1 min-h-0 overflow-auto rounded-md border border-neutral-800 bg-neutral-900 p-3 space-y-3">
        {currentChat.length === 0 ? (
          <div className="text-neutral-400 text-sm">
            Ask questions about this file. Context will include:{" "}
            {headersHint.join(", ") || "no columns detected"}.
          </div>
        ) : (
          currentChat.map((turn, idx) => (
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

      <div className="flex items-center gap-2 pt-2 mb-5">
        <Input
          value={localQuery}
          onChange={(e) => setLocalQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your question..."
          className="flex-1 bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-400"
          disabled={sending || sendingExternal}
        />
        <Button
          className="bg-[#39FF14] text-black hover:bg-[#2fd310]"
          disabled={sending || sendingExternal}
          onClick={() => void send()}
        >
          {sending || sendingExternal ? "Sending..." : "Send"}
        </Button>
      </div>
    </>
  );
}
