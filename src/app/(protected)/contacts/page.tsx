import { listUsers } from "@/lib/roster/queries";
import { getSettings } from "@/lib/settings/queries";
import { requireSession } from "@/lib/session";
import { ContactList } from "./ContactList";

export default async function ContactsPage() {
  await requireSession();
  const [users, settings] = await Promise.all([listUsers(), getSettings()]);
  const activeUsers = users.filter((user) => user.status === "active");
  return <ContactList users={activeUsers} nameTemplate={settings.nameTemplate} />;
}
