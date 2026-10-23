import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/app/empty-state";
import { RoomTypeDialog } from "@/features/rooms/room-dialogs";
import { listRoomTypes } from "@/server/services/rooms";
import { getHotelSettings } from "@/server/services/settings";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Room types" };

export default async function RoomTypesPage() {
  const actor = await requirePageActor("roomTypes:manage");
  const [types, hotel] = await Promise.all([listRoomTypes(actor, { includeInactive: true }), getHotelSettings(actor)]);
  return (
    <>
      <PageHeader
        title="Room types & base rates"
        description="Base rates are the default nightly price for new reservations, before tax."
        actions={
          <RoomTypeDialog
            currency={hotel.currency}
            trigger={
              <Button>
                <Plus /> Add room type
              </Button>
            }
          />
        }
      />
      <Card className="py-0">
        {types.length === 0 ? (
          <EmptyState title="No room types yet" description="Create room types such as Standard, Deluxe or Suite." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Max guests</TableHead>
                <TableHead className="text-right">Base rate</TableHead>
                <TableHead>Amenities</TableHead>
                <TableHead className="text-right">Rooms</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {types.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <span className="font-medium">{t.name}</span> {!t.active ? <Badge variant="secondary">Inactive</Badge> : null}
                    {t.description ? <span className="text-muted-foreground block max-w-xs truncate text-xs">{t.description}</span> : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{t.capacity}</TableCell>
                  <TableCell className="text-right">
                    <Money value={t.basePrice} currency={hotel.currency} />
                  </TableCell>
                  <TableCell className="max-w-sm truncate whitespace-normal text-xs">{t.amenities.join(", ") || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{t.roomCount}</TableCell>
                  <TableCell className="text-right">
                    <RoomTypeDialog
                      currency={hotel.currency}
                      roomType={t}
                      trigger={
                        <Button size="sm" variant="ghost">
                          Edit
                        </Button>
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}
