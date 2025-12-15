"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarRail,
} from "@/components/ui/sidebar";
import Papa from "papaparse";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X, MessageSquare } from "lucide-react";

type ChatTurn = {
  user_query: string;
  response: string;
  image_box: any[];
  chat_history: string[];
};

type Item = {
  id: string;
  name: string;
  parent_id: string;
  bucket_url: string;
};

export default function DataSparkPage() {
  const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "";
  const router = useRouter();
  const { data } = authClient.useSession();

  // Chat state
  const [chatList, setChatList] = useState<ChatTurn[]>([]);
  const [chatHistory, setChatHistory] = useState<string[]>([]);
  const [userQuery, setUserQuery] = useState("");
  const [sending, setSending] = useState(false);

  // Context and db_info
  const [contextList, setContextList] = useState<string[]>([]);
  const [dbInfo, setDbInfo] = useState(""); // newline-delimited multi-db info

  // Context picker modal
  const [pickerOpen, setPickerOpen] = useState(false);
  const [rootId, setRootId] = useState<string>("");
  const [currentFolderId, setCurrentFolderId] = useState<string>("");
  const [folders, setFolders] = useState<Item[]>([]);
  const [files, setFiles] = useState<Item[]>([]);
  const [loadingPicker, setLoadingPicker] = useState(false);
  const [crumbs, setCrumbs] = useState<Array<{ id: string; name: string }>>([
    { id: "", name: "Home" },
  ]);

  // nav button styles to match HomeView aesthetics
  const neonBtn =
    "text-base md:text-lg px-4 py-3 text-neutral-300 hover:text-[#39FF14] transition-colors duration-200";
  const activeGradient =
    "bg-gradient-to-r from-[#39FF14] to-neutral-800 text-white";

  // Derived lines from dbInfo for display/removal
  const dbLines = useMemo(() => {
    return dbInfo
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  }, [dbInfo]);

  const removeContext = useCallback((name: string) => {
    setContextList((prev) => prev.filter((n) => n !== name));
    setDbInfo((prev) => {
      const lines = prev.split("\n").filter(Boolean);
      const filtered = lines.filter((line) => !line.startsWith(name + " "));
      return filtered.join("\n");
    });
  }, []);

  const loadRoot = useCallback(async () => {
    try {
      if (!data?.user?.id) return;
      const res = await fetch(`${BACKEND}/root`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ user_id: data.user.id }),
      });
      if (!res.ok) return;
      const js = await res.json();
      const rid = js?.root_id || js?.user_root_id || js?.id || "";
      if (rid) {
        setRootId(rid);
        setCurrentFolderId(rid);
        setCrumbs([{ id: rid, name: "Home" }]);
      }
    } catch (e) {
      // noop
    }
  }, [BACKEND, data?.user?.id]);

  // Helper to ensure we have a root id and return it
  const fetchRootId = useCallback(async (): Promise<string | null> => {
    try {
      if (rootId) return rootId;
      if (!data?.user?.id) return null;
      const res = await fetch(`${BACKEND}/root`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ user_id: data.user.id }),
      });
      if (!res.ok) return null;
      const js = await res.json();
      const rid: string | null =
        js?.root_id || js?.user_root_id || js?.id || null;
      if (rid) {
        setRootId(rid);
        if (!currentFolderId) setCurrentFolderId(rid);
        setCrumbs([{ id: rid, name: "Home" }]);
      }
      return rid;
    } catch {
      return null;
    }
  }, [BACKEND, data?.user?.id, rootId, currentFolderId]);

  // Proactively load root when user session arrives
  useEffect(() => {
    if (data?.user?.id && !rootId) {
      void loadRoot();
    }
  }, [data?.user?.id, rootId, loadRoot]);

  const loadFolder = useCallback(
    async (folderId: string) => {
      setLoadingPicker(true);
      try {
        const [fres, filesRes] = await Promise.all([
          fetch(`${BACKEND}/folders`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({ current_folder_id: folderId }),
          }),
          fetch(`${BACKEND}/files`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({ current_folder_id: folderId }),
          }),
        ]);
        const [fjson, filesJson] = await Promise.all([
          fres.json(),
          filesRes.json(),
        ]);
        setFolders(Array.isArray(fjson) ? fjson : fjson?.folders || []);
        setFiles(Array.isArray(filesJson) ? filesJson : filesJson?.files || []);
      } catch (e) {
        setFolders([]);
        setFiles([]);
      } finally {
        setLoadingPicker(false);
      }
    },
    [BACKEND]
  );

  useEffect(() => {
    if (!pickerOpen) return;
    if (rootId) {
      setCurrentFolderId(rootId);
      setCrumbs([{ id: rootId, name: "Home" }]);
    } else {
      void loadRoot();
    }
  }, [pickerOpen, rootId, loadRoot]);

  useEffect(() => {
    if (pickerOpen && currentFolderId) {
      void loadFolder(currentFolderId);
    }
  }, [pickerOpen, currentFolderId, loadFolder]);

  const isCsv = (it: Item) => it?.name?.toLowerCase().endsWith(".csv");
  const isSql = (it: Item) =>
    typeof it?.bucket_url === "string" &&
    it.bucket_url.toLowerCase().includes("schema");

  // Add selected file into context and update dbInfo
  const addContextFromFile = useCallback(
    async (it: Item) => {
      try {
        if (isCsv(it)) {
          // fetch first line (columns) via local API proxy
          const apiUrl = `/api/files?url=${encodeURIComponent(it.bucket_url)}`;
          const res = await fetch(apiUrl);
          if (!res.ok) {
            return;
          }
          const text = await res.text();
          // Parse header row using Papa
          const parsed = Papa.parse(text, { header: true });
          const columns: string[] = Array.isArray(parsed.meta?.fields)
            ? (parsed.meta.fields as string[])
            : parsed.data.length > 0
            ? Object.keys(parsed.data[0] as any)
            : [];
          const line = `${it.name} columns: ${columns.join(", ")}`;
          setDbInfo((prev) => (prev ? prev + "\n" + line : line));
          setContextList((prev) =>
            prev.includes(it.name) ? prev : [...prev, it.name]
          );
        } else if (isSql(it)) {
          // call backend getColumns using table name from bucket_url
          const tablePart = (it.bucket_url.split("|>")[1] || "").trim();
          const colsRes = await fetch(`${BACKEND}/getColumns`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              parent_id: it.parent_id,
              table_name: tablePart,
            }),
          });
          if (!colsRes.ok) return;
          const colsJson = await colsRes.json();
          const columns: string[] = Array.isArray(colsJson?.columns)
            ? (colsJson.columns as string[])
            : [];
          const line = `${it.name} columns: ${columns.join(", ")}`;
          setDbInfo((prev) => (prev ? prev + "\n" + line : line));
          setContextList((prev) =>
            prev.includes(it.name) ? prev : [...prev, it.name]
          );
        }
      } catch {
        // ignore
      }
    },
    [BACKEND]
  );

  // Send to AI
  const send = useCallback(async () => {
    const q = userQuery.trim();
    if (!q || !BACKEND) return;
    setSending(true);
    try {
      // Ensure we have a parent_id (root)
      const parentId = rootId || (await fetchRootId());
      if (!parentId) {
        setSending(false);
        return;
      }
      const res = await fetch(`${BACKEND}/ask_ai`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          db_info: dbInfo,
          query: q,
          chat_history: chatHistory,
          parent_id: parentId,
        }),
      });
      if (!res.ok) {
        setSending(false);
        return;
      }
      const data = await res.json();
      const aiText = typeof data?.response === "string" ? data.response : "";
      const nextImages: any[] = Array.isArray(data?.image_box)
        ? data.image_box
        : Array.isArray(data?.images)
        ? data.images
        : [];
      const nextHistory: string[] = Array.isArray(data?.chat_history)
        ? data.chat_history
        : chatHistory;
      setChatHistory(nextHistory);
      setChatList((prev) => [
        ...prev,
        {
          user_query: q,
          response: aiText,
          image_box: nextImages,
          chat_history: nextHistory,
        },
      ]);
      setUserQuery("");
      setSending(false);
    } catch {
      setSending(false);
    }
  }, [BACKEND, dbInfo, userQuery, chatHistory]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (sending) return;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void send();
      }
    },
    [sending, send]
  );

  return (
    <div className="h-screen bg-neutral-900 text-white flex flex-col">
      {!!data?.user && (
        <header className="w-full bg-neutral-900 text-white border-b border-neutral-800">
          <div className="w-full px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src="/logo-bg.png"
                alt="XBase"
                className="h-8 w-8 rounded-md"
              />
              <span className="font-semibold text-2xl">XBase</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xl">{data?.user?.name ?? "User"}</span>
              <Button
                className="h-8 bg-red-600 text-white hover:bg-red-700 border-transparent"
                onClick={() => {
                  authClient.signOut({
                    fetchOptions: {
                      onSuccess: () => router.push("/auth/sign-in"),
                    },
                  });
                }}
              >
                Logout
              </Button>
            </div>
          </div>
        </header>
      )}

      <SidebarProvider>
        <div className="flex flex-1 min-h-0">
          <Sidebar className="bg-neutral-900/90 backdrop-blur border-r border-neutral-800">
            <SidebarContent className="bg-neutral-900/90">
              <SidebarGroup>
                <SidebarGroupLabel className="px-3 mb-3 text-sm md:text-base uppercase tracking-wider text-neutral-400">
                  Primary
                </SidebarGroupLabel>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      className={neonBtn}
                      onClick={() => router.push("/")}
                    >
                      My Database
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      className={`${neonBtn} ${activeGradient}`}
                    >
                      Ask AI
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroup>

              <div className="my-6">
                <SidebarGroup>
                  <SidebarGroupLabel className="px-3 mb-3 text-sm md:text-base uppercase tracking-wider text-neutral-400">
                    Data Processing
                  </SidebarGroupLabel>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton className={neonBtn}>
                        Data Cleaning
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton className={neonBtn}>
                        Impute Data
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroup>

                <SidebarGroup className="mt-6">
                  <SidebarGroupLabel className="px-3 mb-3 text-sm md:text-base uppercase tracking-wider text-neutral-400">
                    Analytics
                  </SidebarGroupLabel>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton className={neonBtn}>
                        Visualisation
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton className={neonBtn}>
                        Classification
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton className={neonBtn}>
                        Association Rules
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroup>
              </div>
            </SidebarContent>

            <SidebarFooter className="bg-neutral-900/90 border-t border-neutral-800">
              <SidebarGroup>
                <SidebarGroupLabel className="px-3 mb-3 text-sm md:text-base uppercase tracking-wider text-neutral-400">
                  History
                </SidebarGroupLabel>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton className={neonBtn}>
                      Snapshot History
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroup>
            </SidebarFooter>
            <SidebarRail className="bg-neutral-900/80" />
          </Sidebar>

          {/* Main content fills remaining space */}
          <main className="flex-1 flex flex-col p-6 overflow-hidden min-h-0 bg-neutral-900">
            <h1 className="text-2xl md:text-3xl font-semibold text-white mb-4">
              DataSpark ✨
            </h1>

            {/* Context summary as removable boxes */}
            {dbLines.length > 0 && (
              <Card className="mb-4 bg-neutral-900 border-neutral-800">
                <CardHeader>
                  <CardTitle className="text-white">Context</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {dbLines.map((line) => {
                      const name = line.split(" columns:")[0] || line;
                      return (
                        <div
                          key={line}
                          className="group relative rounded-md bg-neutral-800/70 text-neutral-200 px-3 py-2"
                          title={line}
                        >
                          <span className="pr-6 whitespace-pre-wrap break-words">
                            {line}
                          </span>
                          <button
                            aria-label="Remove context"
                            className="absolute top-1.5 right-1.5 p-1 rounded hover:bg-neutral-700"
                            onClick={() => removeContext(name)}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Chat area */}
            <>
              {/* Chat area */}
              <div className="flex-1 min-h-0 overflow-auto rounded-md border border-neutral-800 bg-neutral-900 p-3 space-y-4">
                {chatList.length === 0 ? (
                  <div className="h-full flex items-center justify-center">
                    <div className="flex flex-col items-center text-center gap-3">
                      <MessageSquare className="h-14 w-14 text-neutral-500" />
                      <div className="text-2xl md:text-3xl font-semibold text-neutral-300">
                        Ask Anything
                      </div>
                      <div className="text-neutral-400 text-sm md:text-base">
                        Click + icon to add context and ask questions
                      </div>
                    </div>
                  </div>
                ) : (
                  chatList.map((turn, idx) => (
                    <div key={idx} className="space-y-2">
                      <div className="rounded-md px-3 py-2 text-sm whitespace-pre-wrap bg-neutral-700 text-neutral-50">
                        {turn.user_query}
                      </div>
                      <div className="rounded-md px-3 py-2 text-sm whitespace-pre-wrap bg-[#123d16] text-[#39FF14]">
                        {turn.response}
                      </div>
                      {turn.image_box && turn.image_box.length > 0 && (
                        <div className="rounded-md border border-neutral-700 bg-neutral-900 p-3">
                          <div className="text-neutral-300 mb-2">Images</div>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {turn.image_box.map((img: any, i: number) => (
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
                  ))
                )}
              </div>

              {/* Composer */}
              <div className="flex items-center gap-2 pt-3">
                <button
                  title="Add Context"
                  className="rounded-md border border-neutral-700 px-3 py-2 text-neutral-200 hover:bg-neutral-800"
                  onClick={() => {
                    // Always reset to root on open
                    if (rootId) {
                      setCurrentFolderId(rootId);
                      setCrumbs([{ id: rootId, name: "Home" }]);
                    } else {
                      void loadRoot();
                    }
                    setPickerOpen(true);
                  }}
                >
                  +
                </button>
                <Input
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
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
            </>

            {/* Context picker dialog (combined folders + files) */}
            {pickerOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
                <div className="w-[95%] max-w-4xl max-h-[80vh] overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
                  <div className="flex items-center justify-between p-3 border-b border-neutral-800">
                    <div className="flex items-center gap-2 text-white font-medium">
                      <img
                        src="/folder-icon.png"
                        alt="Home"
                        className="h-5 w-5"
                      />
                      Add Context
                    </div>
                    <Button
                      className="bg-neutral-700 hover:bg-neutral-600 text-white"
                      onClick={() => setPickerOpen(false)}
                    >
                      Close
                    </Button>
                  </div>
                  <div className="p-3 space-y-4">
                    {/* Breadcrumbs */}
                    <div className="flex flex-wrap gap-2 text-sm text-neutral-300">
                      {crumbs.map((c, i) => (
                        <span key={c.id || i}>
                          <button
                            className="underline hover:text-white"
                            onClick={() => {
                              setCurrentFolderId(c.id);
                              setCrumbs((prev) => prev.slice(0, i + 1));
                            }}
                          >
                            {c.name}
                          </button>
                          {i < crumbs.length - 1 ? (
                            <span className="mx-1">/</span>
                          ) : null}
                        </span>
                      ))}
                    </div>

                    {/* Combined grid */}
                    <section className="rounded-md border border-neutral-800 p-3 bg-neutral-900">
                      <div className="max-h-[55vh] overflow-auto">
                        {loadingPicker && (
                          <div className="text-neutral-500">Loading...</div>
                        )}
                        {!loadingPicker &&
                          folders.length === 0 &&
                          files.length === 0 && (
                            <div className="text-neutral-500">No items</div>
                          )}
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                          {/* Folders */}
                          {folders.map((f) => (
                            <button
                              key={`folder-${f.id}`}
                              className="flex flex-col items-center gap-2 p-3 rounded-md hover:bg-neutral-800/60 transition-colors"
                              onClick={() => {
                                setCurrentFolderId(f.id);
                                setCrumbs((prev) => [
                                  ...prev,
                                  { id: f.id, name: f.name },
                                ]);
                              }}
                              title={f.name}
                            >
                              <img
                                src="/folder-icon.png"
                                alt="Folder"
                                className="h-16 w-16 object-contain"
                              />
                              <span className="text-sm text-neutral-200 truncate w-full text-center">
                                {f.name}
                              </span>
                            </button>
                          ))}
                          {/* Files */}
                          {files.map((fi) => {
                            const isSchema =
                              typeof fi.bucket_url === "string" &&
                              fi.bucket_url.toLowerCase().includes("schema");
                            const iconSrc = isSchema
                              ? "/table-icon.png"
                              : "/file-icon.png";
                            return (
                              <button
                                key={`file-${fi.id}`}
                                className="flex flex-col items-center gap-2 p-3 rounded-md hover:bg-neutral-800/40 transition-colors"
                                onClick={() => void addContextFromFile(fi)}
                                title={fi.name}
                              >
                                <img
                                  src={iconSrc}
                                  alt={isSchema ? "Table" : "File"}
                                  className="h-16 w-16 object-contain"
                                />
                                <span className="text-sm text-neutral-200 truncate w-full text-center">
                                  {fi.name}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </section>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </SidebarProvider>
    </div>
  );
}
