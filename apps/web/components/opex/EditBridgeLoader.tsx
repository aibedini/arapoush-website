"use client";

import dynamic from "next/dynamic";

// The bridge loads only in edit mode (this loader is rendered only then).
const EditBridge = dynamic(() => import("./EditBridge"), { ssr: false });

export default function EditBridgeLoader({ consoleOrigin }: { consoleOrigin: string }) {
  return consoleOrigin ? <EditBridge consoleOrigin={consoleOrigin} /> : null;
}
