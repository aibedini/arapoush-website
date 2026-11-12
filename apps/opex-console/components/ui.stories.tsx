import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ApiError } from "../lib/api";
import { Dialog, ErrorNote, Loading, PageHead } from "./ui";

/**
 * The console's UI kit (components/ui.tsx): page heading, native dialog (focus trap, Esc, backdrop),
 * problem+json error note (Persian messages per error code, field issues), loading skeleton.
 */
const meta = { title: "Console/UI kit", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Heading: Story = {
  render: () => (
    <PageHead title="فرم‌ها" sub="فرم بسازید و در هر صفحه‌ای بگذارید.">
      <button type="button" className="btn primary">
        فرم تازه
      </button>
    </PageHead>
  ),
};

function DialogDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        باز کردن
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="ارجاع تیکت" footer={<button type="button" className="btn primary">ارجاع</button>}>
        <label className="f">
          <span>پیام</span>
          <textarea defaultValue="لطفاً قیمت را تأیید کنید." />
        </label>
      </Dialog>
    </>
  );
}

/** Opens as a modal (native <dialog>: focus trap, Esc and backdrop built in); the close button closes it. */
export const ModalDialog: Story = {
  render: () => <DialogDemo />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("button", { name: "باز کردن" }));
    const dialog = await within(document.body).findByRole("dialog", { name: "ارجاع تیکت" });
    await expect(dialog).toBeVisible();
    await userEvent.click(within(dialog).getByRole("button", { name: "بستن" }));
    await waitFor(() => expect(dialog).not.toHaveAttribute("open"));
  },
};

/** A known code gets a Persian explanation; field issues are listed with their paths. */
export const ErrorWithIssues: Story = {
  render: () => <ErrorNote error={new ApiError(400, "VALIDATION_FAILED", "Request does not match the schema", { issues: [{ path: "/fields/2/label", message: "A label is required" }] })} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("alert")).toHaveTextContent("/fields/2/label");
  },
};

export const ErrorKnownCode: Story = {
  render: () => <ErrorNote error={new ApiError(412, "CONFLICT_BASE_REVISION", "The content changed since you opened it")} />,
};

export const LoadingState: Story = { render: () => <Loading rows={5} /> };
