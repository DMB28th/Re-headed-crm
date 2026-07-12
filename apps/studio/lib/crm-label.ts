/**
 * The one place the crm enum turns into display copy. Three hand-rolled
 * ternaries disagreed ("SFDC" vs "Salesforce") before this existed — always
 * import this instead of writing a new one.
 */
export function crmDisplayLabel(crm: string | undefined | null): string {
  return crm === "salesforce" ? "Salesforce" : "HubSpot";
}
