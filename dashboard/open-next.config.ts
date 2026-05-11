import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // Cache layers — leave at defaults for the free tier.
  // The dashboard is read-mostly with frequent re-renders against D1,
  // so we don't need ISR/cache propagation here.
});
