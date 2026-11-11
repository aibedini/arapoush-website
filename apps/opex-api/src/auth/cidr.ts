import { BlockList, isIPv4, isIPv6 } from "node:net";

/** True when `ip` falls in any CIDR of the list. An empty list allows everything. */
export function ipAllowed(ip: string | null | undefined, cidrs: string[]): boolean {
  if (!cidrs.length) return true;
  if (!ip) return false;
  const bare = ip.replace(/^::ffff:/, "");
  const list = new BlockList();
  for (const c of cidrs) {
    const [addr, bits] = c.split("/");
    if (!addr) continue;
    const type = isIPv6(addr) ? "ipv6" : "ipv4";
    const prefix = bits ? Number(bits) : type === "ipv6" ? 128 : 32;
    list.addSubnet(addr, prefix, type);
  }
  return list.check(bare, isIPv4(bare) ? "ipv4" : "ipv6");
}
