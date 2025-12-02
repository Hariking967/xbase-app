"use client";

import React from "react";

export default function Layout({ children }: { children: React.ReactNode }) {
  // Pass-through; header moved back to HomeView
  return <>{children}</>;
}
