"use client";

import React from "react";
import { Button } from "@/components/ui/button";

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
}: {
  file: DbFile;
  onBack: () => void;
}) {
  const isSchema =
    typeof file.bucket_url === "string" &&
    file.bucket_url.toLowerCase().includes("schema");

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

      <div className="flex-1 flex gap-0 w-full min-h-0 bg-neutral-900">
        {/* Left pane: SQL/schema info */}
        <section
          className="flex flex-col min-h-0 space-y-4 pr-2 bg-neutral-900"
          style={{ width: "100%", minWidth: "20%" }}
        >
          <div className="text-2xl md:text-3xl font-bold text-white">
            {file.name}
          </div>

          <div className="flex-1 rounded-md border border-neutral-800 bg-neutral-800 p-4 text-neutral-300 overflow-auto">
            <div className="space-y-3">
              <div className="text-neutral-200">
                {isSchema ? "Schema file" : "SQL file"}
              </div>
              <div className="text-sm text-neutral-400">
                Source: {file.bucket_url}
              </div>
              <div className="rounded-md border border-neutral-700 bg-neutral-900 p-4">
                {/* Placeholder content: in future, render parsed DDL or SQL preview */}
                <pre className="text-xs md:text-sm text-neutral-200 whitespace-pre-wrap">
                  {/* ...existing code... */}
                  {`-- Preview not available yet.\n-- Integrate schema/SQL parsing here.\n\nFile: ${file.name}`}
                </pre>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
