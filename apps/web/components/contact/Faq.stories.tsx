import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import raw from "@/content/contact.json";
import ps from "@/components/printing/Printing.module.css";
import cs from "./Contact.module.css";
import type { Contact } from "@/lib/contactText";
import Faq from "./Faq";

/** Contact page: grouped FAQs as native disclosures, with the "still have a question?" card. */
const contact = raw as unknown as Contact;
const meta = {
  title: "Contact/FAQ",
  component: Faq,
  args: { c: contact.faq, locale: "fa" },
  render: (args, { globals }) => (
    <div className={`${ps.page} ${cs.page}`}>
      <Faq {...args} locale={globals.locale ?? args.locale} />
    </div>
  ),
} satisfies Meta<typeof Faq>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Groups: Story = {};

export const OpenAnswer: Story = {
  globals: { locale: "en" },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByText("What is a seamless plastic tube?"));
    await expect(c.getByText(/extruded as a tube/)).toBeVisible();
  },
};
