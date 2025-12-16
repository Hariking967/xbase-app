"use client";

import React, { useEffect, useState, useCallback } from "react";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import CSVFileView from "./csv-file-view";
import SQLFileView from "./sql-file-view";
import Papa from "papaparse";

// Types for API responses
interface Folder {
  id: string;
  name: string;
  created_at: string; // ISO datetime
  parent_id: string;
}
interface DbFile {
  id: string;
  name: string;
  created_at: string; // ISO datetime
  parent_id: string;
  bucket_url: string;
}
interface RootResponse {
  user_id: string;
  root_id: string;
}
// Added response wrappers per API docs
interface FoldersResponse {
  folders: Folder[];
}
interface FilesResponse {
  files: DbFile[];
}

export default function HomeView() {
  const router = useRouter();
  const { data, isPending } = authClient.useSession();

  const [current_folder_id, setCurrentFolderId] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<string>("My Database");
  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<DbFile[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);
  // Create Folder dialog state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  // Upload CSV dialog state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Create File dialog state
  const [isCreateFileOpen, setIsCreateFileOpen] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [newFileDesc, setNewFileDesc] = useState("");
  const [creatingFile, setCreatingFile] = useState(false);
  const [createFileError, setCreateFileError] = useState<string | null>(null);
  // trigger list reloads after mutations
  const [reloadTick, setReloadTick] = useState(0);
  const [rootId, setRootId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [selectedFile, setSelectedFile] = useState<DbFile | null>(null);
  const [isFileView, setIsFileView] = useState<number>(0);
  // DataSpark chat state
  const [chatHistory, setChatHistory] = useState<string[]>([]);
  const [userQuery, setUserQuery] = useState("");
  const [sending, setSending] = useState(false);
  const [csvColumns, setCsvColumns] = useState<string[]>([]);
  const [lastAIResponse, setLastAIResponse] = useState<string>("");
  // NEW: per-file chat pairs
  const [fileSpecificChatHistory, setFileSpecificChatHistory] = useState<
    Array<{ user: string; ai: string }>
  >([]);

  // Use NEXT_PUBLIC_BACKEND_URL for all backend requests
  const NEXT_PUBLIC_BACKEND_URL = (() => {
    let u =
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      "https://pythonbackend-xbase.onrender.com";
    u = u.trim();
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    return u.replace(/\/+$/, "");
  })();

  const safeFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
    retries = 2,
    delayMs = 1500
  ): Promise<Response | null> => {
    try {
      return await fetch(input, {
        // mode & credentials default to allow CORS negotiation
        ...init,
        headers: {
          "Content-Type":
            (init?.headers as any)?.["Content-Type"] || "application/json",
        },
      });
    } catch (e) {
      console.error("Network error raw:", e);
      if (retries > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
        return safeFetch(input, init, retries - 1, delayMs * 2);
      }
      setApiError(
        `Network error contacting backend: ${NEXT_PUBLIC_BACKEND_URL}`
      );
      return null;
    }
  };

  // Always ensure we have a root_id for this user
  const ensureRoot = useCallback(async () => {
    setApiError(null);
    const userId = data?.user?.id;
    if (!userId) return;
    if (!NEXT_PUBLIC_BACKEND_URL) {
      setApiError("Backend URL not configured.");
      return;
    }
    const res = await safeFetch(`${NEXT_PUBLIC_BACKEND_URL}/root`, {
      method: "POST",
      body: JSON.stringify({ user_id: userId }),
    });
    if (!res) return;
    if (!res.ok) {
      setApiError(`Root fetch failed (${res.status})`);
      return;
    }
    let payload: RootResponse | any;
    try {
      payload = await res.json();
    } catch {
      setApiError("Failed to parse root response JSON.");
      return;
    }
    console.log("Root response payload:", payload);
    if (payload?.root_id) {
      setCurrentFolderId(payload.root_id);
      setRootId(payload.root_id);
      setBreadcrumbs([{ id: payload.root_id, name: "Home" }]);
    } else setApiError("root_id missing in response.");
  }, [data?.user?.id, NEXT_PUBLIC_BACKEND_URL]);

  // When user id becomes available, ensure we have a root
  useEffect(() => {
    if (data?.user?.id) {
      ensureRoot();
    }
  }, [data?.user?.id, ensureRoot]);

  // If current_folder_id is ever null (e.g., first load), try again
  useEffect(() => {
    if (!current_folder_id && data?.user?.id) {
      ensureRoot();
    }
  }, [current_folder_id, data?.user?.id, ensureRoot]);

  // Fetch folders/files for current folder on visit and after mutations
  useEffect(() => {
    const fetchLists = async () => {
      if (!data?.user?.id) return;
      if (!current_folder_id) {
        await ensureRoot();
        return;
      }
      if (!NEXT_PUBLIC_BACKEND_URL) return;

      setApiError(null);
      const [foldersRes, filesRes] = await Promise.all([
        safeFetch(`${NEXT_PUBLIC_BACKEND_URL}/folders`, {
          method: "POST",
          body: JSON.stringify({ current_folder_id }),
        }),
        safeFetch(`${NEXT_PUBLIC_BACKEND_URL}/files`, {
          method: "POST",
          body: JSON.stringify({ current_folder_id }),
        }),
      ]);
      if (!foldersRes || !filesRes) return;
      if (!foldersRes.ok)
        setApiError(`Folders fetch failed (${foldersRes.status})`);
      if (!filesRes.ok)
        setApiError(
          (prev) => prev || `Files fetch failed (${filesRes.status})`
        );

      // Parse according to documented shapes, with fallback to raw arrays
      const foldersJson = foldersRes.ok ? await foldersRes.json() : null;
      const filesJson = filesRes.ok ? await filesRes.json() : null;

      const foldersData: Folder[] = foldersJson
        ? "folders" in (foldersJson as any)
          ? (foldersJson as FoldersResponse).folders
          : Array.isArray(foldersJson)
          ? (foldersJson as Folder[])
          : []
        : [];

      const filesData: DbFile[] = filesJson
        ? "files" in (filesJson as any)
          ? (filesJson as FilesResponse).files
          : Array.isArray(filesJson)
          ? (filesJson as DbFile[])
          : []
        : [];

      console.log("Fetched current_folder_id:", current_folder_id);
      console.log("Fetched folders:", foldersData);
      console.log("Fetched files:", filesData);

      setFolders(foldersData);
      setFiles(filesData);
    };
    fetchLists();
  }, [
    current_folder_id,
    data?.user?.id,
    NEXT_PUBLIC_BACKEND_URL,
    ensureRoot,
    reloadTick,
  ]);

  // Log whenever these change (extra visibility)
  useEffect(() => {
    console.log("State change -> current_folder_id:", current_folder_id);
    console.log("State change -> folders:", folders);
    console.log("State change -> files:", files);
  }, [current_folder_id, folders, files]);

  const toSlug = (label: string) =>
    `/${label.toLowerCase().replace(/\s+/g, "-")}`;

  // Create Folder handler -> refresh list
  const handleCreateFolder = async () => {
    setCreateError(null);
    if (!folderName.trim()) {
      setCreateError("Folder name is required.");
      return;
    }
    if (!current_folder_id) {
      setCreateError("Invalid parent folder.");
      return;
    }
    setCreating(true);
    const res = await safeFetch(`${NEXT_PUBLIC_BACKEND_URL}/folder/create`, {
      method: "POST",
      body: JSON.stringify({
        folder_name: folderName.trim(),
        parent_id: current_folder_id,
      }),
    });
    setCreating(false);
    if (!res) {
      setCreateError("Network error. Please try again.");
      return;
    }
    if (!res.ok) {
      setCreateError(`Create folder failed (${res.status})`);
      return;
    }
    // Success: close dialog, clear, and refresh lists
    setIsCreateOpen(false);
    setFolderName("");
    setReloadTick((t) => t + 1);
  };

  // Upload CSV -> create file record -> refresh list
  const handleCsvUpload = async () => {
    setUploadError(null);
    if (!uploadFile) {
      setUploadError("Please select a CSV file.");
      return;
    }
    const isCsv =
      uploadFile.type === "text/csv" ||
      uploadFile.name.toLowerCase().endsWith(".csv");
    if (!isCsv) {
      setUploadError("Only .csv files are allowed.");
      return;
    }

    // Fetch parent_id (user_root_id) from /root
    const userId = data?.user?.id;
    if (!userId) {
      setUploadError("User not authenticated.");
      return;
    }
    const rootRes = await safeFetch(`${NEXT_PUBLIC_BACKEND_URL}/root`, {
      method: "POST",
      body: JSON.stringify({ user_id: userId }),
    });
    if (!rootRes || !rootRes.ok) {
      setUploadError(`Root fetch failed (${rootRes?.status ?? "network"})`);
      return;
    }
    const rootPayload = await rootRes.json();
    const user_root_id =
      typeof rootPayload === "string" ? rootPayload : rootPayload?.root_id;
    if (!user_root_id) {
      setUploadError("root_id missing in response.");
      return;
    }

    const form = new FormData();
    form.append("file", uploadFile);
    form.append("parent_id", user_root_id);

    try {
      setUploading(true);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      if (!res.ok) {
        setUploading(false);
        setUploadError(`Upload failed (${res.status})`);
        return;
      }
      const data: { path: string; url: string } = await res.json();
      console.log("Uploaded:", data);

      if (!current_folder_id) {
        setUploading(false);
        setUploadError("Invalid parent folder.");
        return;
      }
      const createRes = await safeFetch(
        `${NEXT_PUBLIC_BACKEND_URL}/files/create`,
        {
          method: "POST",
          body: JSON.stringify({
            name: uploadFile.name,
            current_folder_id,
            bucket_url: data.url,
          }),
        }
      );
      if (!createRes) {
        setUploading(false);
        setUploadError("Network error while creating file record.");
        return;
      }
      if (!createRes.ok) {
        setUploading(false);
        setUploadError(`Create file failed (${createRes.status})`);
        return;
      }
      const created = await createRes.json();
      console.log("File record created:", created);

      setUploading(false);
      setIsUploadOpen(false);
      setUploadFile(null);
      setReloadTick((t) => t + 1);
    } catch (e) {
      setUploading(false);
      setUploadError("Network error while uploading.");
    }
  };

  // Create File with AI + record in files table
  const handleCreateFileWithAI = async () => {
    setCreateFileError(null);
    if (!current_folder_id) {
      setCreateFileError("Invalid parent folder.");
      return;
    }
    if (!newFileName.trim() || !newFileDesc.trim()) {
      setCreateFileError("Name and description are required.");
      return;
    }
    setCreatingFile(true);
    try {
      // 1) Ask AI
      const askBody = {
        db_info: "",
        query: `Table name: ${newFileName.trim()} description: ${newFileDesc.trim()}`,
        chat_history: [],
        parent_id: current_folder_id,
      };
      const askRes = await safeFetch(`${NEXT_PUBLIC_BACKEND_URL}/ask_ai`, {
        method: "POST",
        body: JSON.stringify(askBody),
      });
      if (!askRes || !askRes.ok) {
        setCreatingFile(false);
        setCreateFileError(`Ask AI failed (${askRes?.status ?? "network"})`);
        return;
      }

      // NEW: persist chat_history in session cookie
      let askData: any = null;
      try {
        askData = await askRes.json();
      } catch {
        // ignore parse errors; continue with subsequent steps
      }
      const history = askData?.chat_history ?? [];
      try {
        await fetch("/api/chat-history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ history }),
        });
      } catch {
        // non-blocking; continue
      }

      // 2) Get user_root_id
      const userId = data?.user?.id;
      if (!userId) {
        setCreatingFile(false);
        setCreateFileError("User not authenticated.");
        return;
      }
      const rootRes = await safeFetch(`${NEXT_PUBLIC_BACKEND_URL}/root`, {
        method: "POST",
        body: JSON.stringify({ user_id: userId }),
      });
      if (!rootRes || !rootRes.ok) {
        setCreatingFile(false);
        setCreateFileError(
          `Root fetch failed (${rootRes?.status ?? "network"})`
        );
        return;
      }
      const rootPayload = await rootRes.json();
      const user_root_id =
        typeof rootPayload === "string" ? rootPayload : rootPayload?.root_id;
      if (!user_root_id) {
        setCreatingFile(false);
        setCreateFileError("root_id missing in response.");
        return;
      }

      // 3) Create file record
      const bucket_url = `schema${user_root_id}|>${newFileName.trim()}`;
      const createRes = await safeFetch(
        `${NEXT_PUBLIC_BACKEND_URL}/files/create`,
        {
          method: "POST",
          body: JSON.stringify({
            current_folder_id,
            name: newFileName.trim(),
            bucket_url,
          }),
        }
      );
      if (!createRes || !createRes.ok) {
        setCreatingFile(false);
        setCreateFileError(
          `Create file failed (${createRes?.status ?? "network"})`
        );
        return;
      }

      // Success: close dialog, reset inputs, refresh lists
      setIsCreateFileOpen(false);
      setNewFileName("");
      setNewFileDesc("");
      setCreatingFile(false);
      setReloadTick((t) => t + 1);
    } catch (e) {
      setCreatingFile(false);
      setCreateFileError("Network error during file creation.");
    }
  };

  // Click a folder card: update current_folder_id + breadcrumbs
  const enterFolder = (f: Folder) => {
    setCurrentFolderId(f.id);
    setBreadcrumbs((prev) => {
      // avoid duplicate consecutive entries
      if (prev.find((b) => b.id === f.id)) return [...prev];
      return [...prev, { id: f.id, name: f.name }];
    });
  };

  // Click a breadcrumb segment: jump there and trim trail
  const jumpToCrumb = (index: number) => {
    const target = breadcrumbs[index];
    if (!target) return;
    setCurrentFolderId(target.id);
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
  };

  // Ask AI using documented POST /ask_ai
  const askAIChat = async () => {
    if (!selectedFile || !current_folder_id) return;
    const trimmed = userQuery.trim();
    if (!trimmed) return;
    setSending(true);

    const dbInfo =
      csvColumns.length > 0
        ? `columns: ${csvColumns.join(", ")}, bucket_url: ${
            selectedFile.bucket_url
          }`
        : `bucket_url: ${selectedFile.bucket_url}`;

    try {
      const outgoingHistory = [...chatHistory, `USER: ${trimmed}`];

      const strictQuery = `Return only the table in CSV format with headers. Do not include any narration or extra text. ${trimmed}`;
      const res = await safeFetch(`${NEXT_PUBLIC_BACKEND_URL}/ask_ai`, {
        method: "POST",
        body: JSON.stringify({
          db_info: dbInfo,
          query: strictQuery,
          chat_history: outgoingHistory,
          parent_id: current_folder_id,
        }),
      });
      if (!res || !res.ok) {
        setSending(false);
        return;
      }
      const data = await res.json();

      const nextHistory: string[] = Array.isArray(data?.chat_history)
        ? data.chat_history
        : outgoingHistory;
      setChatHistory(nextHistory);

      const aiText = typeof data?.response === "string" ? data.response : "";
      setLastAIResponse(aiText);

      // NEW: append exact pair for this file
      setFileSpecificChatHistory((prev) => [
        ...prev,
        { user: trimmed, ai: aiText },
      ]);

      setUserQuery("");
      setSending(false);
    } catch {
      setSending(false);
    }
  };

  // Helper: decide file type (CSV vs SQL/schema)
  const isCsvFile = (f: DbFile | null) => {
    if (!f) return false;
    const nameCsv =
      typeof f.name === "string" && f.name.toLowerCase().endsWith(".csv");
    const urlCsv =
      typeof f.bucket_url === "string" &&
      f.bucket_url.toLowerCase().endsWith(".csv");
    return Boolean(nameCsv || urlCsv);
  };

  // shared classes for neon transitions
  const neonBtn =
    "text-base md:text-lg px-4 py-3 text-neutral-300 hover:text-[#39FF14] transition-colors duration-200";
  const activeGradient =
    "bg-gradient-to-r from-[#39FF14] to-neutral-800 text-white";

  return (
    <div className="h-screen bg-neutral-900 text-white flex flex-col">
      {!!data?.user && (
        <header className="w-full bg-neutral-900 text-white border-b border-neutral-800">
          <div className="w-full px-4 py-3 grid grid-cols-3 items-center">
            {/* Left placeholder to allow perfect centering */}
            <div />
            <div className="flex items-center gap-3 justify-self-center">
              <img
                src="/logo-bg.png"
                alt="XBase"
                className="h-8 w-8 rounded-md"
              />
              <span className="font-semibold text-2xl">XBase</span>
            </div>
            <div className="flex items-center gap-4 justify-self-end">
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
              {/* Primary (top) */}
              <SidebarGroup>
                <SidebarGroupLabel className="px-3 mb-3 text-sm md:text-base uppercase tracking-wider text-neutral-400">
                  Primary
                </SidebarGroupLabel>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={activeItem === "My Database"}
                      onClick={() => setActiveItem("My Database")}
                      className={`${neonBtn} ${
                        activeItem === "My Database" ? activeGradient : ""
                      }`}
                    >
                      My Database
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => router.push(toSlug("Ask AI"))}
                      className={neonBtn}
                    >
                      Ask AI
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroup>

              {/* Data Processing + Analytics (middle, spaced) */}
              <div className="my-6">
                <SidebarGroup>
                  <SidebarGroupLabel className="px-3 mb-3 text-sm md:text-base uppercase tracking-wider text-neutral-400">
                    Data Processing
                  </SidebarGroupLabel>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        onClick={() => router.push(toSlug("Data Cleaning"))}
                        className={neonBtn}
                      >
                        Data Cleaning
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        onClick={() => router.push(toSlug("Impute Data"))}
                        className={neonBtn}
                      >
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
                      <SidebarMenuButton
                        onClick={() => router.push(toSlug("Visualisation"))}
                        className={neonBtn}
                      >
                        Visualisation
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        onClick={() => router.push(toSlug("Classification"))}
                        className={neonBtn}
                      >
                        Classification
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        onClick={() => router.push(toSlug("Association Rules"))}
                        className={neonBtn}
                      >
                        Association Rules
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroup>
              </div>
            </SidebarContent>

            {/* History (bottom) */}
            <SidebarFooter className="bg-neutral-900/90 border-t border-neutral-800">
              <SidebarGroup>
                <SidebarGroupLabel className="px-3 mb-3 text-sm md:text-base uppercase tracking-wider text-neutral-400">
                  History
                </SidebarGroupLabel>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => router.push(toSlug("Snapshot History"))}
                      className={neonBtn}
                    >
                      Snapshot History
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroup>
            </SidebarFooter>
            <SidebarRail className="bg-neutral-900/80" />
          </Sidebar>

          {/* Make main a full-height flex column */}
          <main className="flex-1 flex flex-col p-6 overflow-hidden min-h-0 bg-neutral-900">
            {apiError && (
              <div className="mb-4 rounded-md border border-red-700 bg-red-900/40 px-4 py-2 text-sm text-red-300">
                {apiError}
              </div>
            )}

            {/* Breadcrumbs (hidden in file view) */}
            {breadcrumbs.length > 0 && isFileView === 0 && (
              <div className="mb-4 flex flex-wrap items-center gap-3 text-2xl">
                {breadcrumbs.map((crumb, i) => (
                  <div key={crumb.id} className="flex items-center gap-3">
                    <button
                      type="button"
                      className={`hover:text-[#39FF14] ${
                        i === breadcrumbs.length - 1 ? "font-bold" : ""
                      }`}
                      onClick={() => jumpToCrumb(i)}
                      title={crumb.name}
                    >
                      {crumb.name}
                    </button>
                    {i < breadcrumbs.length - 1 && (
                      <span className="text-neutral-500 text-2xl">›</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {activeItem === "My Database" && (
              <>
                {/* Top actions (hidden in file view) */}
                {isFileView === 0 && (
                  <div className="mb-4 flex items-center gap-3">
                    <Button
                      type="button"
                      className="bg-neutral-800 hover:bg-neutral-700 text-white"
                      onClick={() => {
                        setCreateError(null);
                        setIsCreateOpen(true);
                      }}
                    >
                      Create Folder
                    </Button>
                    <Button
                      type="button"
                      className="bg-neutral-800 hover:bg-neutral-700 text-white"
                      onClick={() => {
                        setCreateFileError(null);
                        setNewFileName("");
                        setNewFileDesc("");
                        setIsCreateFileOpen(true);
                      }}
                    >
                      Create File
                    </Button>
                    <Button
                      type="button"
                      className="bg-neutral-800 hover:bg-neutral-700 text-white"
                      onClick={() => {
                        setUploadError(null);
                        setUploadFile(null);
                        setIsUploadOpen(true);
                      }}
                    >
                      Upload File
                    </Button>
                  </div>
                )}

                {/* Create Folder Dialog */}
                <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                  <DialogContent className="bg-neutral-900 text-white border border-neutral-800">
                    <DialogHeader>
                      <DialogTitle>Create new folder</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2">
                      <Input
                        value={folderName}
                        onChange={(e) => setFolderName(e.target.value)}
                        placeholder="Enter folder name"
                        className="bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-400"
                        disabled={creating}
                      />
                      {createError && (
                        <p className="text-sm text-red-400">{createError}</p>
                      )}
                    </div>
                    <DialogFooter className="gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="border-neutral-700 text-black"
                        onClick={() => setIsCreateOpen(false)}
                        disabled={creating}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        className="bg-[#39FF14] text-black hover:bg-[#2fd310]"
                        onClick={handleCreateFolder}
                        disabled={creating}
                      >
                        {creating ? "Creating..." : "Create"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                {/* Create File Dialog */}
                <Dialog
                  open={isCreateFileOpen}
                  onOpenChange={setIsCreateFileOpen}
                >
                  <DialogContent className="bg-neutral-900 text-white border border-neutral-800">
                    <DialogHeader>
                      <DialogTitle>Create new file</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <Input
                        value={newFileName}
                        onChange={(e) => setNewFileName(e.target.value)}
                        placeholder="Enter file (table) name"
                        className="bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-400"
                        disabled={creatingFile}
                      />
                      <Textarea
                        value={newFileDesc}
                        onChange={(e) => setNewFileDesc(e.target.value)}
                        placeholder="Eg: create file named student with columns roll_no int and marks int"
                        className="min-h-24 bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-400"
                        disabled={creatingFile}
                      />
                      {createFileError && (
                        <p className="text-sm text-red-400">
                          {createFileError}
                        </p>
                      )}
                    </div>
                    <DialogFooter className="gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="border-neutral-700 text-black"
                        onClick={() => setIsCreateFileOpen(false)}
                        disabled={creatingFile}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        className="bg-[#39FF14] text-black hover:bg-[#2fd310]"
                        onClick={handleCreateFileWithAI}
                        disabled={creatingFile}
                      >
                        {creatingFile ? "Creating..." : "Create"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                {/* Upload CSV Dialog */}
                <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
                  <DialogContent className="bg-neutral-900 text-white border border-neutral-800">
                    <DialogHeader>
                      <DialogTitle>Upload CSV</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2">
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null;
                          if (!f) {
                            setUploadFile(null);
                            return;
                          }
                          const isCsv =
                            f.type === "text/csv" ||
                            f.name.toLowerCase().endsWith(".csv");
                          if (!isCsv) {
                            setUploadError("Only .csv files are allowed.");
                            setUploadFile(null);
                          } else {
                            setUploadError(null);
                            setUploadFile(f);
                          }
                        }}
                        className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-neutral-800 file:px-4 file:py-2 file:text-white hover:file:bg-neutral-700"
                        disabled={uploading}
                      />
                      {uploadError && (
                        <p className="text-sm text-red-400">{uploadError}</p>
                      )}
                    </div>
                    <DialogFooter className="gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="border-neutral-700 text-black"
                        onClick={() => setIsUploadOpen(false)}
                        disabled={uploading}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        className="bg-[#39FF14] text-black hover:bg-[#2fd310]"
                        onClick={handleCsvUpload}
                        disabled={uploading || !uploadFile}
                      >
                        {uploading ? "Uploading..." : "Upload"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                {/* If a file is selected, render FileView */}
                <div className="flex-1 h-full overflow-hidden min-h-0">
                  {selectedFile ? (
                    <div className="w-full h-full relative">
                      {isCsvFile(selectedFile) ? (
                        <CSVFileView
                          file={selectedFile}
                          onBack={() => {
                            setSelectedFile(null);
                            setIsFileView(0);
                            setChatHistory([]);
                            setUserQuery("");
                            setCsvColumns([]);
                            setLastAIResponse("");
                            setFileSpecificChatHistory([]);
                          }}
                          chatHistory={chatHistory}
                          userQuery={userQuery}
                          sending={sending}
                          csvColumns={csvColumns}
                          onUserQueryChange={setUserQuery}
                          onSend={askAIChat}
                          onColumnsChange={setCsvColumns}
                          aiResponse={lastAIResponse}
                          fileSpecificChatHistory={fileSpecificChatHistory}
                        />
                      ) : (
                        <SQLFileView
                          file={selectedFile}
                          onBack={() => {
                            setSelectedFile(null);
                            setIsFileView(0);
                            setChatHistory([]);
                            setUserQuery("");
                            setCsvColumns([]);
                            setLastAIResponse("");
                            setFileSpecificChatHistory([]);
                          }}
                          chatHistory={chatHistory}
                          userQuery={userQuery}
                          sending={sending}
                          onUserQueryChange={setUserQuery}
                          onSend={askAIChat}
                          aiResponse={lastAIResponse}
                          fileSpecificChatHistory={fileSpecificChatHistory}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="p-4 overflow-auto h-full">
                      {/* Folders */}
                      {folders.length > 0 && (
                        <section className="mb-8">
                          {/* <h2 className="mb-3 text-sm uppercase tracking-wide text-neutral-400">
                    Folders
                  </h2> */}
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                            {folders.map((f) => (
                              <button
                                key={f.id}
                                onClick={() => enterFolder(f)}
                                className="flex flex-col items-center gap-2 p-3 rounded-md hover:bg-neutral-800/60 transition-colors"
                                title={f.name}
                              >
                                <img
                                  src="/folder-icon.png"
                                  alt="Folder"
                                  className="h-24 w-24 object-contain"
                                />
                                <span className="text-sm text-neutral-200 truncate w-full text-center">
                                  {f.name}
                                </span>
                              </button>
                            ))}
                          </div>
                        </section>
                      )}

                      {/* Files */}
                      {files.length > 0 && (
                        <section>
                          {/* <h2 className="mb-3 text-sm uppercase tracking-wide text-neutral-400">
                      Files
                    </h2> */}
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                            {files.map((file) => {
                              const isSchema =
                                typeof file.bucket_url === "string" &&
                                file.bucket_url
                                  .toLowerCase()
                                  .includes("schema");
                              const iconSrc = isSchema
                                ? "/table-icon.png"
                                : "/file-icon.png";
                              return (
                                <button
                                  key={file.id}
                                  onClick={() => {
                                    setSelectedFile(file);
                                    setIsFileView(1);
                                    setChatHistory([]);
                                    setUserQuery("");
                                  }}
                                  className="flex flex-col items-center gap-2 p-3 rounded-md hover:bg-neutral-800/40 transition-colors"
                                  title={file.name}
                                >
                                  <img
                                    src={iconSrc}
                                    alt={isSchema ? "Table" : "File"}
                                    className="h-24 w-24 object-contain"
                                  />
                                  <span className="text-sm text-neutral-200 truncate w-full text-center">
                                    {file.name}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </section>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
            {/* ...existing or future content... */}
          </main>
        </div>
      </SidebarProvider>
    </div>
  );
}
