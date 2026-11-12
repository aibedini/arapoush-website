import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import raw from "@/content/contact.json";
import ps from "@/components/printing/Printing.module.css";
import cs from "./Contact.module.css";
import type { Contact } from "@/lib/contactText";
import Locations from "./Locations";

/**
 * Contact page: head office and factory with a photo, a drawn location plan and directions in
 * Google Maps, Neshan and Balad. Neshan and Balad appear once a site has coordinates (or a pasted
 * link) in OPEX; `style` switches between `split` and `stacked`.
 */
const contact = raw as unknown as Contact;
const images = [{ id: "office", image: { src: "/images/contact/office.webp", width: 960, height: 504 } }];
const withGeo: Contact["locations"] = {
  ...contact.locations,
  places: contact.locations.places.map((p) => (p.id === "office" ? { ...p, geo: { lat: 35.7566, lng: 51.4395 } } : p)),
};

const meta = {
  title: "Contact/Locations",
  component: Locations,
  args: { c: contact.locations, locale: "fa", images },
  render: (args, { globals }) => (
    <div className={`${ps.page} ${cs.page}`}>
      <Locations {...args} locale={globals.locale ?? args.locale} />
    </div>
  ),
} satisfies Meta<typeof Locations>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Split: Story = {};

export const Stacked: Story = { args: { c: { ...contact.locations, style: "stacked" } } };

/** With coordinates, all three map apps are offered and open at the point. */
export const WithCoordinates: Story = {
  args: { c: withGeo },
  globals: { locale: "en" },
  play: async ({ canvasElement }) => {
    const office = within(within(canvasElement).getByRole("article", { name: "Tehran head office" }));
    await expect(office.getByRole("link", { name: "Neshan" })).toHaveAttribute("href", "https://neshan.org/maps/@35.7566,51.4395,16z,0p");
    await expect(office.getByRole("link", { name: "Balad" })).toHaveAttribute("href", "https://balad.ir/location?latitude=35.7566&longitude=51.4395&zoom=16");
    await expect(office.getByRole("link", { name: "Google Maps" })).toHaveAttribute("href", "https://www.google.com/maps/search/?api=1&query=35.7566%2C51.4395");
  },
};
