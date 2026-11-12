import type { Decorator, Preview } from "@storybook/nextjs-vite";
import { fa, latin } from "../app/fonts";
import { MeContext, type Me } from "../lib/hooks";
import "../app/globals.css";

/** The console is Persian (RTL). Stories render as a signed-in operator; pick the role in the toolbar. */
const me: Me = { id: "prn_demo", display: "Sara Karimi", role: "operator", stepUpValid: false };
const withShell: Decorator = (Story, ctx) => (
  <MeContext.Provider value={{ ...me, role: (ctx.globals.role ?? "operator") as Me["role"] }}>
    <div lang="fa" dir="rtl" className={`${fa.variable} ${latin.variable}`} style={{ padding: 24, background: "var(--bg)", minHeight: "100vh" }}>
      <Story />
    </div>
  </MeContext.Provider>
);

const preview: Preview = {
  decorators: [withShell],
  globalTypes: {
    role: {
      description: "Signed-in role",
      toolbar: { title: "Role", icon: "user", items: ["viewer", "auditor", "operator", "super_admin"], dynamicTitle: true },
    },
  },
  initialGlobals: { role: "operator" },
  parameters: {
    layout: "fullscreen",
    a11y: { test: "error" },
    viewport: {
      options: {
        mobile: { name: "Mobile 390", styles: { width: "390px", height: "844px" } },
        desktop: { name: "Desktop 1440", styles: { width: "1440px", height: "900px" } },
      },
    },
    nextjs: { appDirectory: true },
  },
  tags: ["autodocs"],
};
export default preview;
