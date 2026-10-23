import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { rooms } from "@/db/schema";
import { db } from "@/lib/db";
import { ConflictError, ForbiddenError } from "@/lib/errors";
import { createTask, listTasks, setRoomHousekeepingStatus, updateTask } from "@/server/services/housekeeping";
import { checkIn, createReservation } from "@/server/services/reservations";
import { listRooms, setRoomOperationalStatus } from "@/server/services/rooms";
import { getDashboard } from "@/server/services/operations";
import { runReport } from "@/server/services/reports";
import { createStaff, updateStaff } from "@/server/services/staff";
import { updateHotelSettings } from "@/server/services/settings";
import { getGuestProfile, listGuests } from "@/server/services/guests";
import { createFixture, day, newGuest, type Fixture } from "../support/fixtures";

let fx: Fixture;
beforeEach(async () => {
  fx = await createFixture();
});

async function occupy(roomNumber = "101") {
  const r = await createReservation(fx.receptionist, {
    newGuest: newGuest(),
    roomId: fx.room[roomNumber].id,
    checkInDate: day(0),
    checkOutDate: day(2),
    adults: 1,
  });
  await checkIn(fx.receptionist, r.id);
  return r;
}

describe("housekeeping status restrictions", () => {
  it("housekeeping can mark rooms dirty/cleaning/clean but not inspected", async () => {
    const id = fx.room["101"].id;
    await setRoomHousekeepingStatus(fx.housekeeper, id, { housekeepingStatus: "dirty" });
    await setRoomHousekeepingStatus(fx.housekeeper, id, { housekeepingStatus: "cleaning" });
    const clean = await setRoomHousekeepingStatus(fx.housekeeper, id, { housekeepingStatus: "clean" });
    expect(clean.housekeepingStatus).toBe("clean");
    await expect(setRoomHousekeepingStatus(fx.housekeeper, id, { housekeepingStatus: "inspected" })).rejects.toBeInstanceOf(ConflictError);
    const inspected = await setRoomHousekeepingStatus(fx.receptionist, id, { housekeepingStatus: "inspected" });
    expect(inspected.housekeepingStatus).toBe("inspected");
  });

  it("cleaning an occupied room never makes it available", async () => {
    await occupy("101");
    await setRoomHousekeepingStatus(fx.housekeeper, fx.room["101"].id, { housekeepingStatus: "clean" });
    const list = await listRooms(fx.receptionist, {});
    const room = list.find((r) => r.roomNumber === "101")!;
    expect(room.occupied).toBe(true);
    expect(room.operationalStatus).toBe("in_service");
    await expect(
      setRoomHousekeepingStatus(fx.admin, fx.room["101"].id, { housekeepingStatus: "inspected" }),
    ).rejects.toThrow(/occupied/);
  });

  it("a room under maintenance stays unavailable after cleaning", async () => {
    const id = fx.room["102"].id;
    await setRoomOperationalStatus(fx.admin, id, { operationalStatus: "maintenance" });
    await setRoomHousekeepingStatus(fx.housekeeper, id, { housekeepingStatus: "clean" });
    const [room] = await db.select().from(rooms).where(eq(rooms.id, id));
    expect(room.operationalStatus).toBe("maintenance");
    await expect(setRoomHousekeepingStatus(fx.admin, id, { housekeepingStatus: "inspected" })).rejects.toThrow(/not in service/);
  });

  it("cannot put an occupied room into maintenance", async () => {
    await occupy("101");
    await expect(
      setRoomOperationalStatus(fx.admin, fx.room["101"].id, { operationalStatus: "maintenance" }),
    ).rejects.toThrow(/occupied/);
  });

  it("completing a cleaning task marks the room clean; staff only see their own or unassigned tasks", async () => {
    const id = fx.room["201"].id;
    await setRoomHousekeepingStatus(fx.admin, id, { housekeepingStatus: "dirty" });
    const mine = await createTask(fx.receptionist, { roomId: id, assignedTo: fx.housekeeper.id });
    const someoneElse = await createTask(fx.receptionist, { roomId: fx.room["301"].id, assignedTo: fx.admin.id });
    const visible = await listTasks(fx.housekeeper, {});
    expect(visible.map((t) => t.id)).toEqual([mine.id]);
    await expect(updateTask(fx.housekeeper, someoneElse.id, { status: "in_progress" })).rejects.toBeInstanceOf(ForbiddenError);
    await updateTask(fx.housekeeper, mine.id, { status: "in_progress" });
    await updateTask(fx.housekeeper, mine.id, { status: "completed" });
    const [room] = await db.select().from(rooms).where(eq(rooms.id, id));
    expect(room.housekeepingStatus).toBe("clean");
  });

  it("housekeeping cannot change task priority or create tasks", async () => {
    await expect(createTask(fx.housekeeper, { roomId: fx.room["101"].id })).rejects.toBeInstanceOf(ForbiddenError);
    const t = await createTask(fx.admin, { roomId: fx.room["101"].id });
    await expect(updateTask(fx.housekeeper, t.id, { priority: "urgent" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("hides guest names from housekeeping on the room board", async () => {
    await occupy("101");
    const asHk = await listRooms(fx.housekeeper, {});
    expect(asHk.find((r) => r.roomNumber === "101")!.occupantName).toBeNull();
    const asFront = await listRooms(fx.receptionist, {});
    expect(asFront.find((r) => r.roomNumber === "101")!.occupantName).toBe("Test1 Guest");
  });
});

describe("unauthorized role access", () => {
  it("housekeeping cannot view guests, dashboard or reports", async () => {
    await expect(listGuests(fx.housekeeper, {})).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getDashboard(fx.housekeeper)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(runReport(fx.housekeeper, "revenue", {})).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("receptionists cannot manage staff, settings or reports", async () => {
    await expect(
      createStaff(fx.receptionist, { name: "X", email: "x@test.invalid", role: "admin", password: "averylongpassword1" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateHotelSettings(fx.receptionist, {})).rejects.toBeInstanceOf(ForbiddenError);
    await expect(runReport(fx.receptionist, "occupancy", {})).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("guests from another hotel are not visible", async () => {
    const r = await occupy("101");
    const outsider = { ...fx.receptionist, hotelId: fx.receptionist.hotelId.replace(/.$/, "0") };
    await expect(getGuestProfile(outsider, r.guestId)).rejects.toThrow(/not found/);
  });

  it("the last active admin cannot be demoted or deactivated", async () => {
    const other = await createStaff(fx.admin, {
      name: "Second Admin",
      email: "second@test.invalid",
      role: "admin",
      password: "averylongpassword1",
    });
    await expect(updateStaff(fx.admin, fx.admin.id, { active: false })).rejects.toThrow(/own account/);
    await updateStaff(fx.admin, other.id, { role: "receptionist" });
    await expect(updateStaff({ ...fx.admin, id: other.id }, fx.admin.id, { role: "receptionist" })).rejects.toThrow(
      /At least one active administrator/,
    );
  });
});

describe("dashboard and reports use real data", () => {
  it("reflects occupancy and arrivals from the database", async () => {
    await occupy("101");
    await createReservation(fx.receptionist, {
      newGuest: newGuest(2),
      roomId: fx.room["102"].id,
      checkInDate: day(0),
      checkOutDate: day(1),
      adults: 1,
    });
    const d = await getDashboard(fx.admin);
    expect(d.rooms.total).toBe(4);
    expect(d.rooms.occupied).toBe(1);
    expect(d.reservations.arrivals).toBe(2);
    expect(d.reservations.inHouseReservations).toBe(1);
    expect(d.occupancyRate).toBe(0.5);
    // Two unpaid stays: 2 nights x 2500 + 12% tax, and 1 night x 2500 + 12% tax.
    expect(d.outstanding.amount).toBe("8400.00");
    expect(d.outstanding.reservations).toBe(2);
    const report = await runReport(fx.admin, "occupancy", { from: day(0), to: day(0) });
    expect(report.rows[0].occupied).toBe(2);
  });
});
