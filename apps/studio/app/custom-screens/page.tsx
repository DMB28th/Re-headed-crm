/**
 * Custom screens are no longer a top-level area — a screen only exists as a
 * screen of a flow, so Flows is where you find and build them. Kept as a
 * redirect so old links and bookmarks land somewhere useful.
 */
import { redirect } from "next/navigation";

export default function CustomScreensIndex() {
  redirect("/flows");
}
