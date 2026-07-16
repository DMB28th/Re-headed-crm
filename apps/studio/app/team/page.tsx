import { isAuthEnabled } from "../../lib/auth";
import { TeamPageClient } from "../../components/team-page";

export const dynamic = "force-dynamic";

export default function TeamPage() {
  return <TeamPageClient authEnabled={isAuthEnabled()} />;
}
