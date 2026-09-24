import { PageContainer } from "@/components/PageContainer";
import { PageTransition } from "@/components/PageTransition";
import { listDepartments, listUsers } from "@/lib/roster/queries";
import { getSettings } from "@/lib/settings/queries";
import { requireSession } from "@/lib/session";
import { ContactList } from "./ContactList";

export default async function ContactsPage() {
  const session = await requireSession();
  const [users, settings, departments] = await Promise.all([
    listUsers(),
    getSettings(),
    listDepartments(),
  ]);
  const activeUsers = users.filter((user) => user.status === "active");
  return (
    <PageTransition>
      <PageContainer>
        <ContactList
          users={activeUsers}
          departments={departments.map((department) => ({
            id: department.id,
            name: department.name,
            sortOrder: department.sortOrder,
            parentId: department.parentId,
          }))}
          nameTemplate={settings.nameTemplate}
          isAdmin={session.user.role === "admin"}
        />
      </PageContainer>
    </PageTransition>
  );
}
