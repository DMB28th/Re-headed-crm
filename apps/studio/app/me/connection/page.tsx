import { redirect } from "next/navigation";

/** Self-service member access is gone: reps re-auth from their chat host
 *  (spec §1 "Deleted"). Deleted outright in the governance-removal task. */
export default function MeConnectionPage(): never {
  redirect("/");
}
