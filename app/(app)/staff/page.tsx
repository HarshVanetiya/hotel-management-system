import type { Metadata } from "next";
import { UserPlus } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreateStaffDialog, ResetPasswordDialog, StaffRoleControl } from "@/features/admin/staff-dialogs";
import { formatDateTime } from "@/lib/utils/dates";
import { getHotelSettings } from "@/server/services/settings";
import { listStaff } from "@/server/services/staff";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Staff" };

export default async function StaffPage() {
  const actor = await requirePageActor("staff:manage");
  const [staff, hotel] = await Promise.all([listStaff(actor), getHotelSettings(actor)]);
  return (
    <>
      <PageHeader
        title="Staff & roles"
        description="Accounts are never deleted; deactivate them to revoke access. Role and status changes sign the user out immediately."
        actions={
          <CreateStaffDialog
            trigger={
              <Button>
                <UserPlus /> Add staff
              </Button>
            }
          />
        }
      />
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="hidden md:table-cell">Last sign-in</TableHead>
              <TableHead className="text-right">Role &amp; access</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff.map((u) => (
              <TableRow key={u.id} className={!u.active ? "text-muted-foreground" : undefined}>
                <TableCell className="font-medium">
                  {u.name} {u.id === actor.id ? <Badge variant="secondary">You</Badge> : null}
                  {!u.active ? <Badge variant="outline">Inactive</Badge> : null}
                </TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell className="hidden md:table-cell">{u.lastLoginAt ? formatDateTime(u.lastLoginAt, hotel.timezone) : "Never"}</TableCell>
                <TableCell>
                  <StaffRoleControl user={u} isSelf={u.id === actor.id} />
                </TableCell>
                <TableCell className="text-right">
                  <ResetPasswordDialog userId={u.id} name={u.name} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
