"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";

type MeasureJob = {
  id: string;
  title: string;
  customer_id: string;
  scheduled_at: string | null;
  measured_by: string | null;
  overall_notes: string | null;
  tallest_window: string | null;
};

type Customer = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  address: string | null;
  phone: string | null;
};

type Room = {
  id: string;
  measure_job_id: string;
  name: string;
  room_notes: string | null;
  sort_order: number | null;
};

type WindowItem = {
  id: string;
  room_id: string;
  sort_order: number | null;
  product: string | null;
  lift_system: string | null;
  width: string | null;
  height: string | null;
  mount_type: "IM" | "OM" | null;
  casing_depth: string | null;
  control_side: "left" | "right" | null;
  hold_downs: boolean;
  metal_or_concrete: boolean;
  over_10_ft: boolean;
  takedown: boolean;
  notes: string | null;
};

type WindowPhoto = {
  id: string;
  window_id: string;
  file_path: string;
  caption: string | null;
};

type SummaryRow = {
  id: string;
  room: string;
  window_number: number;
  roomWindow: string;
  width: string;
  height: string;
  mount_type: string;
  dimensions: string;
  casing_depth: string;
  product: string;
  liftSystem: string;
  controlSide: string;
  hold_downs: string;
  metal_or_concrete: string;
  over_10_ft: string;
  takedown: string;
  flags: string;
  notes: string;
};

const MEASUREMENT_CHAR_REGEX = /^[0-9./ ]*$/;

const VALID_FRACTIONS = new Set([
  "1/16",
  "1/8",
  "3/16",
  "1/4",
  "5/16",
  "3/8",
  "7/16",
  "1/2",
  "9/16",
  "5/8",
  "11/16",
  "3/4",
  "13/16",
  "7/8",
  "15/16",
]);

function decimalToNearestSixteenthString(n: number) {
  const whole = Math.floor(n);
  const frac = n - whole;
  const sixteenths = Math.round(frac * 16);

  if (sixteenths === 0) return `${whole}`;
  if (sixteenths === 16) return `${whole + 1}`;

  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const d = gcd(sixteenths, 16);
  const num = sixteenths / d;
  const den = 16 / d;

  return `${whole} ${num}/${den}`;
}

function normalizeMeasurement(raw: string): string | null {
  const trimmed = raw.trim();

  if (!trimmed) return "";

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const asNumber = Number(trimmed);
    if (Number.isNaN(asNumber)) return null;
    return decimalToNearestSixteenthString(asNumber);
  }

  const fractionMatch = trimmed.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (fractionMatch) {
    const whole = Number(fractionMatch[1]);
    const num = Number(fractionMatch[2]);
    const den = Number(fractionMatch[3]);

    if (den === 0 || num >= den) return null;

    const reduced = `${num}/${den}`;
    if (!VALID_FRACTIONS.has(reduced)) return null;

    return `${whole} ${reduced}`;
  }

  return null;
}

function publicPhotoUrl(path: string) {
  const { data } = supabase.storage.from("window-photos").getPublicUrl(path);
  return data.publicUrl;
}

function csvEscape(value: string) {
  const safe = value ?? "";
  return `"${safe.replace(/"/g, '""')}"`;
}

export default function MeasureJobPage() {
  const params = useParams();
  const measureJobId = params.id as string;

  const [job, setJob] = useState<MeasureJob | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [windows, setWindows] = useState<WindowItem[]>([]);
  const [photos, setPhotos] = useState<WindowPhoto[]>([]);
  const [newRoomName, setNewRoomName] = useState("");
  const [loading, setLoading] = useState(true);
  const [showSummary, setShowSummary] = useState(false);
  const [showAllPhotos, setShowAllPhotos] = useState(false);
  const [openWindowPhotos, setOpenWindowPhotos] = useState<Record<string, boolean>>({});
  const [loadError, setLoadError] = useState<string | null>(null);

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  async function loadAll() {
    try {
      setLoading(true);
      setLoadError(null);

      const { data: jobData, error: jobError } = await supabase
        .from("measure_jobs")
        .select("id, title, customer_id, scheduled_at, measured_by, overall_notes, tallest_window")
        .eq("id", measureJobId)
        .single();

      if (jobError || !jobData) {
        setJob(null);
        setLoadError(jobError?.message || "Measure job not found.");
        return;
      }

      setJob(jobData);

      const { data: customerData, error: customerError } = await supabase
        .from("customers")
        .select("id, first_name, last_name, address, phone")
        .eq("id", jobData.customer_id)
        .single();

      if (customerError) {
        setLoadError(`Customer load error: ${customerError.message}`);
      }
      setCustomer(customerData || null);

      const { data: roomData, error: roomError } = await supabase
        .from("rooms")
        .select("id, measure_job_id, name, room_notes, sort_order")
        .eq("measure_job_id", measureJobId)
        .order("sort_order", { ascending: true });

      if (roomError) {
        setLoadError(`Room load error: ${roomError.message}`);
      }

      const loadedRooms = (roomData || []) as Room[];
      setRooms(loadedRooms);

      if (loadedRooms.length === 0) {
        setWindows([]);
        setPhotos([]);
        return;
      }

      const roomIds = loadedRooms.map((r) => r.id);

      const { data: windowData, error: windowError } = await supabase
        .from("windows")
        .select(
          "id, room_id, sort_order, product, lift_system, width, height, mount_type, casing_depth, control_side, hold_downs, metal_or_concrete, over_10_ft, takedown, notes"
        )
        .in("room_id", roomIds)
        .order("sort_order", { ascending: true });

      if (windowError) {
        setLoadError(`Window load error: ${windowError.message}`);
      }

      const loadedWindows = (windowData || []) as WindowItem[];
      setWindows(loadedWindows);

      if (loadedWindows.length === 0) {
        setPhotos([]);
        return;
      }

      const windowIds = loadedWindows.map((w) => w.id);

      const { data: photoData, error: photoError } = await supabase
        .from("window_photos")
        .select("id, window_id, file_path, caption")
        .in("window_id", windowIds);

      if (photoError) {
        setLoadError(`Photo load error: ${photoError.message}`);
      }

      setPhotos((photoData || []) as WindowPhoto[]);
    } catch (err) {
      console.error(err);
      setLoadError("Unexpected load error.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!measureJobId) return;
    loadAll();
  }, [measureJobId]);

  function updateJobLocal(field: keyof MeasureJob, value: string | null) {
    setJob((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  async function saveJobField(field: keyof MeasureJob, value: string | null) {
    if (!job) return;

    const { error } = await supabase
      .from("measure_jobs")
      .update({ [field]: value })
      .eq("id", job.id);

    if (error) {
      alert(`Error saving ${String(field)}`);
    }
  }

  function updateRoomLocal(roomId: string, field: keyof Room, value: string | null) {
    setRooms((prev) =>
      prev.map((room) => (room.id === roomId ? { ...room, [field]: value } : room))
    );
  }

  async function saveRoomField(roomId: string, field: keyof Room, value: string | null) {
    const { error } = await supabase
      .from("rooms")
      .update({ [field]: value })
      .eq("id", roomId);

    if (error) {
      alert(`Error saving room ${String(field)}`);
    }
  }

  function updateWindowLocal(
    windowId: string,
    field: keyof WindowItem,
    value: string | boolean | null
  ) {
    setWindows((prev) =>
      prev.map((w) => (w.id === windowId ? { ...w, [field]: value } as WindowItem : w))
    );
  }

  async function saveWindowField(
    windowId: string,
    field: keyof WindowItem,
    value: string | boolean | null
  ) {
    const { error } = await supabase
      .from("windows")
      .update({ [field]: value })
      .eq("id", windowId);

    if (error) {
      alert(`Error saving window ${String(field)}`);
    }
  }

  function handleMeasurementChange(
    windowId: string,
    field: "width" | "height" | "casing_depth",
    value: string
  ) {
    if (!MEASUREMENT_CHAR_REGEX.test(value)) return;
    updateWindowLocal(windowId, field, value);
  }

  function handleMeasurementBlur(
    windowId: string,
    field: "width" | "height" | "casing_depth",
    value: string | null
  ) {
    const normalized = normalizeMeasurement(value || "");

    if (normalized === null) {
      alert(
        `${field.replace("_", " ")} must be a valid measurement.\nExamples: 34, 34.5, 34 1/2, 34 3/16, 34 15/16`
      );
      return;
    }

    updateWindowLocal(windowId, field, normalized);
    saveWindowField(windowId, field, normalized);
  }

  function handleTallestWindowChange(value: string) {
    if (!MEASUREMENT_CHAR_REGEX.test(value)) return;
    updateJobLocal("tallest_window", value);
  }

  function handleTallestWindowBlur(value: string | null) {
    const normalized = normalizeMeasurement(value || "");

    if (normalized === null) {
      alert(
        `Height of tallest window must be a valid measurement.\nExamples: 120, 120.5, 120 1/2, 120 3/16`
      );
      return;
    }

    updateJobLocal("tallest_window", normalized);
    saveJobField("tallest_window", normalized);
  }

  async function addRoom() {
    const trimmed = newRoomName.trim();
    if (!trimmed) return;

    const nextSort = rooms.length + 1;

    const { error } = await supabase.from("rooms").insert([
      {
        measure_job_id: measureJobId,
        name: trimmed,
        room_notes: "",
        sort_order: nextSort,
      },
    ]);

    if (error) {
      alert("Error adding room");
      return;
    }

    setNewRoomName("");
    loadAll();
  }

  async function addWindow(roomId: string) {
    const currentRoomWindows = windows.filter((w) => w.room_id === roomId);
    const nextSort = currentRoomWindows.length + 1;

    const { error } = await supabase.from("windows").insert([
      {
        room_id: roomId,
        sort_order: nextSort,
        product: "",
        lift_system: "",
        width: "",
        height: "",
        mount_type: null,
        casing_depth: "",
        control_side: null,
        hold_downs: false,
        metal_or_concrete: false,
        over_10_ft: false,
        takedown: false,
        notes: "",
      },
    ]);

    if (error) {
      alert("Error adding window");
      return;
    }

    loadAll();
  }

  async function duplicateWindow(windowToCopy: WindowItem) {
    const roomWindows = windows.filter((w) => w.room_id === windowToCopy.room_id);
    const nextSort = roomWindows.length + 1;

    const { error } = await supabase.from("windows").insert([
      {
        room_id: windowToCopy.room_id,
        sort_order: nextSort,
        product: windowToCopy.product || "",
        lift_system: windowToCopy.lift_system || "",
        width: "",
        height: "",
        mount_type: windowToCopy.mount_type,
        casing_depth: windowToCopy.casing_depth || "",
        control_side: windowToCopy.control_side,
        hold_downs: windowToCopy.hold_downs,
        metal_or_concrete: windowToCopy.metal_or_concrete,
        over_10_ft: windowToCopy.over_10_ft,
        takedown: windowToCopy.takedown,
        notes: "",
      },
    ]);

    if (error) {
      alert("Error duplicating window");
      return;
    }

    loadAll();
  }

  async function handlePhotoUpload(windowId: string, file: File | null) {
    if (!file || !job) return;

    const ext = file.name.split(".").pop() || "jpg";
    const fileName = `${job.id}/${windowId}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("window-photos")
      .upload(fileName, file, { upsert: false });

    if (uploadError) {
      alert("Error uploading photo");
      return;
    }

    const { error: insertError } = await supabase.from("window_photos").insert([
      {
        window_id: windowId,
        file_path: fileName,
      },
    ]);

    if (insertError) {
      alert("Error saving photo record");
      return;
    }

    loadAll();
  }

  function toggleWindowPhotos(windowId: string) {
    setOpenWindowPhotos((prev) => ({
      ...prev,
      [windowId]: !prev[windowId],
    }));
  }

  const validationMessages: string[] = [];

  if (!normalizeMeasurement(job?.tallest_window || "")) {
    validationMessages.push("Height of tallest window is missing or invalid.");
  }

  rooms.forEach((room, roomIndex) => {
    if (!room.name?.trim()) {
      validationMessages.push(`Room ${roomIndex + 1} is missing a room name.`);
    }
  });

  windows.forEach((window, index) => {
    if (!normalizeMeasurement(window.width || "")) {
      validationMessages.push(`Window ${index + 1} is missing or has invalid width.`);
    }

    if (!normalizeMeasurement(window.height || "")) {
      validationMessages.push(`Window ${index + 1} is missing or has invalid height.`);
    }

    if (!window.mount_type) {
      validationMessages.push(`Window ${index + 1} is missing IM or OM.`);
    }
  });

  const summaryRows: SummaryRow[] = useMemo(() => {
    return rooms.flatMap((room) => {
      const roomWindows = windows.filter((w) => w.room_id === room.id);

      return roomWindows.map((w, index) => {
        const flags: string[] = [];
        if (w.hold_downs) flags.push("Hold Downs");
        if (w.metal_or_concrete) flags.push("Metal");
        if (w.over_10_ft) flags.push("Over 10 ft");
        if (w.takedown) flags.push("Takedown");

        return {
          id: w.id,
          room: room.name || "Unnamed Room",
          window_number: index + 1,
          roomWindow: `${room.name || "Unnamed Room"} ${index + 1}`,
          width: w.width || "",
          height: w.height || "",
          mount_type: w.mount_type || "",
          dimensions: `${w.width || "-"} x ${w.height || "-"} ${w.mount_type || ""}`.trim(),
          casing_depth: w.casing_depth || "",
          product: w.product || "",
          liftSystem: w.lift_system || "",
          controlSide: w.control_side || "",
          hold_downs: w.hold_downs ? "Yes" : "",
          metal_or_concrete: w.metal_or_concrete ? "Yes" : "",
          over_10_ft: w.over_10_ft ? "Yes" : "",
          takedown: w.takedown ? "Yes" : "",
          flags: flags.join(", "),
          notes: w.notes || "",
        };
      });
    });
  }, [rooms, windows]);

  const photosByWindow = useMemo(() => {
    const grouped: Record<string, WindowPhoto[]> = {};
    photos.forEach((photo) => {
      if (!grouped[photo.window_id]) grouped[photo.window_id] = [];
      grouped[photo.window_id].push(photo);
    });
    return grouped;
  }, [photos]);

  const allPhotoRows = useMemo(() => {
    return rooms.flatMap((room) => {
      const roomWindows = windows.filter((w) => w.room_id === room.id);

      return roomWindows.flatMap((w, index) => {
        const windowPhotos = photosByWindow[w.id] || [];
        return windowPhotos.map((photo) => ({
          photo,
          roomName: room.name || "Unnamed Room",
          windowLabel: `Window ${index + 1}`,
        }));
      });
    });
  }, [rooms, windows, photosByWindow]);

  async function copySummary() {
    if (!job || !customer) return;

    const header = [
      `Measure: ${job.title}`,
      `Customer: ${[customer.last_name, customer.first_name].filter(Boolean).join(", ")}`,
      `Address: ${customer.address || ""}`,
      `Phone: ${customer.phone || ""}`,
      `Date: ${job.scheduled_at ? job.scheduled_at.slice(0, 10) : ""}`,
      `Measured By: ${job.measured_by || ""}`,
      `Tallest Window: ${job.tallest_window || ""}`,
      "",
      "Summary:",
    ];

    const lines = summaryRows.map(
      (row) =>
        `${row.roomWindow} | ${row.width} x ${row.height} ${row.mount_type} | ${row.product} | ${row.liftSystem} | ${row.controlSide} | ${row.flags}`
    );

    try {
      await navigator.clipboard.writeText([...header, ...lines].join("\n"));
      alert("Summary copied");
    } catch {
      alert("Could not copy summary");
    }
  }

  function downloadCsv() {
    if (!job || !customer) return;

    const headers = [
      "customer_last_name",
      "customer_first_name",
      "address",
      "phone",
      "measure_title",
      "date",
      "measured_by",
      "tallest_window",
      "room",
      "window_number",
      "width",
      "height",
      "mount_type",
      "casing_depth",
      "product",
      "lift_system",
      "control_side",
      "hold_downs",
      "metal_or_concrete",
      "over_10_ft",
      "takedown",
      "notes",
    ];

    const lines = [
      headers.join(","),
      ...summaryRows.map((row) =>
        [
          customer.last_name || "",
          customer.first_name || "",
          customer.address || "",
          customer.phone || "",
          job.title || "",
          job.scheduled_at ? job.scheduled_at.slice(0, 10) : "",
          job.measured_by || "",
          job.tallest_window || "",
          row.room,
          String(row.window_number),
          row.width,
          row.height,
          row.mount_type,
          row.casing_depth,
          row.product,
          row.liftSystem,
          row.controlSide,
          row.hold_downs,
          row.metal_or_concrete,
          row.over_10_ft,
          row.takedown,
          row.notes,
        ]
          .map((v) => csvEscape(v))
          .join(",")
      ),
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const datePart = job.scheduled_at ? job.scheduled_at.slice(0, 10) : "measure";
    a.href = url;
    a.download = `${job.title || "measure"}-${datePart}.csv`.replace(/[\\/:*?"<>|]/g, "-");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function printSummary() {
    if (!job || !customer) return;

    const customerName = [customer.last_name, customer.first_name].filter(Boolean).join(", ");
    const rowsHtml = summaryRows
      .map(
        (row, index) => `
          <tr class="${index % 2 === 0 ? "even" : "odd"}">
            <td>${row.roomWindow}</td>
            <td>${row.dimensions}</td>
            <td>${row.product}</td>
            <td>${row.liftSystem}</td>
            <td>${row.controlSide}</td>
            <td>${row.flags}</td>
          </tr>
        `
      )
      .join("");

    const printWindow = window.open("", "_blank", "width=1000,height=800");
    if (!printWindow) {
      alert("Could not open print window");
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>${job.title}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 20px;
              color: #111;
              font-size: 12px;
            }
            h1 {
              margin: 0 0 8px 0;
              font-size: 20px;
            }
            .meta {
              margin-bottom: 16px;
              line-height: 1.5;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 12px;
            }
            th, td {
              border: 1px solid #ccc;
              padding: 6px 8px;
              text-align: left;
              vertical-align: top;
            }
            th {
              background: #e5e5e5;
            }
            tr.odd {
              background: #f5f5f5;
            }
            tr.even {
              background: #fff;
            }
            @media print {
              body {
                padding: 0;
              }
            }
          </style>
        </head>
        <body>
          <h1>${job.title}</h1>
          <div class="meta">
            <div><strong>Customer:</strong> ${customerName}</div>
            <div><strong>Address:</strong> ${customer.address || ""}</div>
            <div><strong>Phone:</strong> ${customer.phone || ""}</div>
            <div><strong>Date:</strong> ${job.scheduled_at ? job.scheduled_at.slice(0, 10) : ""}</div>
            <div><strong>Measured By:</strong> ${job.measured_by || ""}</div>
            <div><strong>Height of Tallest Window:</strong> ${job.tallest_window || ""}</div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Room / Window</th>
                <th>Dimensions</th>
                <th>Product</th>
                <th>Lift System</th>
                <th>Control</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  if (loading) {
    return <div className="p-4">Loading...</div>;
  }

  if (loadError && !job) {
    return (
      <main className="p-4 text-black">
        <div className="mx-auto max-w-3xl">
          <Link href="/" className="text-blue-600 hover:underline">
            ← Back to customers
          </Link>
          <div className="mt-4 rounded border border-red-300 bg-red-50 p-4">
            <div className="font-semibold text-red-800">Could not load measure job</div>
            <div className="mt-2 text-sm text-red-700">{loadError}</div>
          </div>
        </div>
      </main>
    );
  }

  if (!job) {
    return <div className="p-4">Measure job not found.</div>;
  }

  return (
    <main className="p-3 text-sm text-black">
      <div className="mx-auto max-w-7xl">
        <Link href={`/customers/${job.customer_id}`} className="text-blue-600 hover:underline">
          ← Back to customer
        </Link>

        <h1 className="mb-2 mt-1 text-xl font-bold">{job.title}</h1>

        {loadError && (
          <div className="mb-3 rounded border border-amber-400 bg-amber-50 p-3 text-xs text-amber-900">
            {loadError}
          </div>
        )}

        {validationMessages.length > 0 && (
          <div className="mb-3 rounded border border-amber-400 bg-amber-50 p-3">
            <div className="mb-1 font-semibold text-amber-900">
              Missing or incomplete measure info
            </div>
            <ul className="list-disc pl-5 text-xs text-amber-900">
              {validationMessages.map((message, index) => (
                <li key={index}>{message}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mb-3 grid grid-cols-[300px_1fr] gap-3 rounded border p-3">
          <div className="space-y-1">
            <div className="font-semibold">
              {[customer?.last_name, customer?.first_name].filter(Boolean).join(", ")}
            </div>

            <div>{customer?.address || "No address"}</div>
            <div>{customer?.phone || "No phone"}</div>

            <div>
              <label className="mb-1 block text-xs font-medium">Date</label>
              <input
                type="date"
                className="w-full rounded border px-2 py-1"
                value={job.scheduled_at ? job.scheduled_at.slice(0, 10) : ""}
                onChange={(e) => updateJobLocal("scheduled_at", e.target.value)}
                onBlur={(e) => saveJobField("scheduled_at", e.target.value || null)}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium">Measured By</label>
              <input
                className="w-full rounded border px-2 py-1"
                value={job.measured_by || ""}
                onChange={(e) => updateJobLocal("measured_by", e.target.value)}
                onBlur={(e) => saveJobField("measured_by", e.target.value || null)}
                placeholder="Measured by"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium">Notes</label>
            <textarea
              className="mb-2 h-20 w-full rounded border px-2 py-1"
              value={job.overall_notes || ""}
              onChange={(e) => updateJobLocal("overall_notes", e.target.value)}
              onBlur={(e) => saveJobField("overall_notes", e.target.value || null)}
            />

            <div>
              <label className="mb-1 block text-xs font-medium">Height of tallest window</label>
              <input
                className="w-28 rounded border px-2 py-1"
                value={job.tallest_window || ""}
                onChange={(e) => handleTallestWindowChange(e.target.value)}
                onBlur={(e) => handleTallestWindowBlur(e.target.value)}
                placeholder="e.g. 120 1/2"
              />
            </div>
          </div>
        </div>

        <div className="mb-3 flex gap-2">
          <button onClick={addRoom} className="rounded bg-black px-3 py-1 text-white">
            Add Room
          </button>

          <input
            className="flex-1 rounded border px-2 py-1"
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value)}
            placeholder="Room name"
          />
        </div>

        {rooms.map((room) => {
          const roomWindows = windows.filter((w) => w.room_id === room.id);

          return (
            <div key={room.id} className="mb-3 rounded border p-2">
              <div className="mb-1 flex items-center gap-2">
                <button
                  onClick={() => addWindow(room.id)}
                  className="rounded bg-black px-2 py-1 text-xs text-white"
                >
                  Add Window
                </button>

                <input
                  className="text-base font-semibold"
                  value={room.name}
                  onChange={(e) => updateRoomLocal(room.id, "name", e.target.value)}
                  onBlur={(e) => saveRoomField(room.id, "name", e.target.value || null)}
                />
              </div>

              <textarea
                className="mb-2 h-12 w-full rounded border px-2 py-1"
                placeholder="Room notes"
                value={room.room_notes || ""}
                onChange={(e) => updateRoomLocal(room.id, "room_notes", e.target.value)}
                onBlur={(e) => saveRoomField(room.id, "room_notes", e.target.value || null)}
              />

              {roomWindows.map((w, index) => (
                <div key={w.id} className="mb-2 rounded border p-2">
                  <div className="mb-1 flex items-center justify-between">
                    <div className="font-semibold">Window {index + 1}</div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => duplicateWindow(w)}
                        className="rounded border px-2 py-1 text-xs"
                      >
                        Duplicate
                      </button>

                      <button
                        onClick={() => fileInputRefs.current[w.id]?.click()}
                        className="rounded border px-2 py-1 text-xs"
                      >
                        Add Photo
                      </button>

                      <button
                        onClick={() => toggleWindowPhotos(w.id)}
                        className="rounded border px-2 py-1 text-xs"
                      >
                        {openWindowPhotos[w.id] ? "Hide Photos" : "View Photos"}
                      </button>

                      <input
                        ref={(el) => {
                          fileInputRefs.current[w.id] = el;
                        }}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          handlePhotoUpload(w.id, file);
                          e.currentTarget.value = "";
                        }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-[140px_220px_1fr] gap-2">
                    <div className="space-y-1">
                                       <input
                        placeholder="Width"
                        className="w-full rounded border px-2 py-1"
                        value={w.width || ""}
                        onChange={(e) => handleMeasurementChange(w.id, "width", e.target.value)}
                        onBlur={(e) => handleMeasurementBlur(w.id, "width", e.target.value)}
                      />

                      <input
                        placeholder="Height"
                        className="w-full rounded border px-2 py-1"
                        value={w.height || ""}
                        onChange={(e) => handleMeasurementChange(w.id, "height", e.target.value)}
                        onBlur={(e) => handleMeasurementBlur(w.id, "height", e.target.value)}
                      />

                      <div className="flex gap-4">
                        <label className="flex items-center gap-1">
                          <input
                            type="radio"
                            name={`mount-${w.id}`}
                            checked={w.mount_type === "IM"}
                            onChange={() => {
                              updateWindowLocal(w.id, "mount_type", "IM");
                              saveWindowField(w.id, "mount_type", "IM");
                            }}
                          />
                          IM
                        </label>

                        <label className="flex items-center gap-1">
                          <input
                            type="radio"
                            name={`mount-${w.id}`}
                            checked={w.mount_type === "OM"}
                            onChange={() => {
                              updateWindowLocal(w.id, "mount_type", "OM");
                              saveWindowField(w.id, "mount_type", "OM");
                            }}
                          />
                          OM
                        </label>
                      </div>

                      <input
                        placeholder="Casing Depth"
                        className="w-full rounded border px-2 py-1"
                        value={w.casing_depth || ""}
                        onChange={(e) =>
                          handleMeasurementChange(w.id, "casing_depth", e.target.value)
                        }
                        onBlur={(e) =>
                          handleMeasurementBlur(w.id, "casing_depth", e.target.value)
                        }
                      />
                    </div>

                    <div className="space-y-1">
                      <input
                        placeholder="Product"
                        className="w-full rounded border px-2 py-1"
                        value={w.product || ""}
                        onChange={(e) => updateWindowLocal(w.id, "product", e.target.value)}
                        onBlur={(e) => saveWindowField(w.id, "product", e.target.value || null)}
                      />

                      <input
                        placeholder="Lift System"
                        className="w-full rounded border px-2 py-1"
                        value={w.lift_system || ""}
                        onChange={(e) => updateWindowLocal(w.id, "lift_system", e.target.value)}
                        onBlur={(e) =>
                          saveWindowField(w.id, "lift_system", e.target.value || null)
                        }
                      />

                      <div className="flex gap-4">
                        <label className="flex items-center gap-1">
                          <input
                            type="radio"
                            name={`control-${w.id}`}
                            checked={w.control_side === "left"}
                            onChange={() => {
                              updateWindowLocal(w.id, "control_side", "left");
                              saveWindowField(w.id, "control_side", "left");
                            }}
                          />
                          Left
                        </label>

                        <label className="flex items-center gap-1">
                          <input
                            type="radio"
                            name={`control-${w.id}`}
                            checked={w.control_side === "right"}
                            onChange={() => {
                              updateWindowLocal(w.id, "control_side", "right");
                              saveWindowField(w.id, "control_side", "right");
                            }}
                          />
                          Right
                        </label>
                      </div>
                    </div>

                    <div>
                      <textarea
                        placeholder="Notes"
                        className="h-full min-h-[98px] w-full rounded border px-2 py-1"
                        value={w.notes || ""}
                        onChange={(e) => updateWindowLocal(w.id, "notes", e.target.value)}
                        onBlur={(e) => saveWindowField(w.id, "notes", e.target.value || null)}
                      />
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-4 text-xs">
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={w.hold_downs}
                        onChange={(e) => {
                          updateWindowLocal(w.id, "hold_downs", e.target.checked);
                          saveWindowField(w.id, "hold_downs", e.target.checked);
                        }}
                      />
                      Hold Downs
                    </label>

                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={w.metal_or_concrete}
                        onChange={(e) => {
                          updateWindowLocal(w.id, "metal_or_concrete", e.target.checked);
                          saveWindowField(w.id, "metal_or_concrete", e.target.checked);
                        }}
                      />
                      Metal
                    </label>

                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={w.over_10_ft}
                        onChange={(e) => {
                          updateWindowLocal(w.id, "over_10_ft", e.target.checked);
                          saveWindowField(w.id, "over_10_ft", e.target.checked);
                        }}
                      />
                      Over 10 ft
                    </label>

                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={w.takedown}
                        onChange={(e) => {
                          updateWindowLocal(w.id, "takedown", e.target.checked);
                          saveWindowField(w.id, "takedown", e.target.checked);
                        }}
                      />
                      Takedown
                    </label>
                  </div>

                  {openWindowPhotos[w.id] && (
                    <div className="mt-3 rounded border bg-gray-50 p-2">
                      <div className="mb-2 font-medium">Window Photos</div>

                      {(photosByWindow[w.id] || []).length === 0 ? (
                        <p className="text-xs text-gray-500">No photos yet.</p>
                      ) : (
                        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                          {(photosByWindow[w.id] || []).map((photo) => (
                            <img
                              key={photo.id}
                              src={publicPhotoUrl(photo.file_path)}
                              className="h-28 w-full rounded border object-cover"
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}    
                          </div>
          );
        })}

        <div className="mt-4 rounded border p-3">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowSummary((prev) => !prev)}
              className="rounded bg-black px-3 py-1 text-white"
            >
              {showSummary ? "Hide Summary" : "Show Summary"}
            </button>

            <button
              onClick={copySummary}
              className="rounded border px-3 py-1"
            >
              Copy Summary
            </button>

            <button
              onClick={downloadCsv}
              className="rounded border px-3 py-1"
            >
              Download CSV
            </button>

            <button
              onClick={printSummary}
              className="rounded border px-3 py-1"
            >
              Print Summary
            </button>

            <button
              onClick={() => setShowAllPhotos((prev) => !prev)}
              className="rounded border px-3 py-1"
            >
              {showAllPhotos ? "Hide All Photos" : "Show All Photos"}
            </button>
          </div>

          {showSummary && (
            <div className="mt-3 overflow-x-auto">
              {summaryRows.length === 0 ? (
                <p className="text-gray-500">No summary rows yet.</p>
              ) : (
                <table className="min-w-full border text-sm">
                  <thead>
                    <tr className="bg-gray-200 text-left">
                      <th className="border px-3 py-2">Room / Window</th>
                      <th className="border px-3 py-2">Dimensions</th>
                      <th className="border px-3 py-2">Product</th>
                      <th className="border px-3 py-2">Lift System</th>
                      <th className="border px-3 py-2">Control</th>
                      <th className="border px-3 py-2">Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryRows.map((row, index) => (
                      <tr
                        key={row.id}
                        className={index % 2 === 0 ? "bg-white" : "bg-gray-100"}
                      >
                        <td className="border px-3 py-2">{row.roomWindow}</td>
                        <td className="border px-3 py-2">{row.dimensions}</td>
                        <td className="border px-3 py-2">{row.product}</td>
                        <td className="border px-3 py-2">{row.liftSystem}</td>
                        <td className="border px-3 py-2">{row.controlSide}</td>
                        <td className="border px-3 py-2">{row.flags}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {showAllPhotos && (
            <div className="mt-3">
              {allPhotoRows.length === 0 ? (
                <p className="text-gray-500">No photos yet.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {allPhotoRows.map(({ photo, roomName, windowLabel }) => (
                    <div key={photo.id} className="rounded border p-2">
                      <a
                        href={publicPhotoUrl(photo.file_path)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <img
                          src={publicPhotoUrl(photo.file_path)}
                          alt={`${roomName} ${windowLabel}`}
                          className="mb-2 h-32 w-full rounded object-cover"
                        />
                      </a>
                      <div className="text-xs font-medium">{roomName}</div>
                      <div className="text-xs text-gray-600">{windowLabel}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}