/**
 * The one Studio page a workspace MEMBER may open (finding C1).
 *
 * A rep whose own Salesforce authorization ended had nowhere to go: the card
 * told them to ask an admin (who cannot reconnect someone else's per-user
 * token) and linked to /connections (which refuses non-admins). This is the
 * page that closes that loop, and it is scoped to the reader's own connection
 * record — no layouts, no permissions, no other people.
 */
import { getSelfServiceIdentity } from "../../../lib/auth";
import { getStore } from "../../../lib/backend";
import { MyConnection } from "../../../components/my-connection";

export const dynamic = "force-dynamic";

export default async function MyConnectionPage() {
  const identity = await getSelfServiceIdentity();
  if (!identity) return null; // Middleware already redirected an unsigned reader.

  const store = await getStore();
  const [workspace, mine] = await Promise.all([
    store.getConnection(identity.workspace.id),
    store.getUserConnection(identity.workspace.id, identity.account.id, "salesforce"),
  ]);

  return (
    <MyConnection
      workspaceName={identity.workspace.name}
      crmLabel={workspace.crm === "salesforce" ? "Salesforce" : "HubSpot"}
      workspaceConnected={workspace.status === "connected"}
      isSalesforce={workspace.crm === "salesforce"}
      connectedUser={mine?.status === "connected" ? (mine.connectedUser ?? null) : null}
    />
  );
}
