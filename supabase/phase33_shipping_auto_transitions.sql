-- Phase 33 — Shipping stage auto-transitions + customer notification tracking.
--
-- 1) Trigger on material_packages changes: recompute received_packages on
--    the parent quote_materials, auto-flip status to 'received' once all
--    packages are in.
-- 2) Trigger on quote_materials UPDATE: if tracking_number newly set while
--    status='ordered', auto-flip to 'shipped' + timestamp.
-- 3) Tracking columns so the daily cron can send customer notifications
--    exactly once per shipped / arrived event.

-- ── Notification-tracking columns ─────────────────────────────
ALTER TABLE quote_materials
  ADD COLUMN IF NOT EXISTS customer_ship_notified_at timestamptz;

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS customer_arrival_notified_at timestamptz;

-- ── Trigger: sync quote_materials.received_packages from packages ─────────
CREATE OR REPLACE FUNCTION sync_material_from_packages()
RETURNS TRIGGER AS $$
DECLARE
  v_material_id uuid;
  v_received_count int;
  v_expected_count int;
  v_current_status text;
BEGIN
  v_material_id := COALESCE(NEW.material_id, OLD.material_id);
  IF v_material_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT COUNT(*) INTO v_received_count
  FROM material_packages
  WHERE material_id = v_material_id AND status = 'received';

  SELECT expected_packages, status INTO v_expected_count, v_current_status
  FROM quote_materials WHERE id = v_material_id;

  UPDATE quote_materials
  SET received_packages = v_received_count
  WHERE id = v_material_id;

  IF v_expected_count IS NOT NULL
     AND v_expected_count > 0
     AND v_received_count >= v_expected_count
     AND v_current_status IN ('ordered', 'shipped') THEN
    UPDATE quote_materials
    SET status = 'received',
        received_at = COALESCE(received_at, now()),
        auto_updated = true
    WHERE id = v_material_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS material_packages_sync_parent ON material_packages;
CREATE TRIGGER material_packages_sync_parent
AFTER INSERT OR UPDATE OR DELETE ON material_packages
FOR EACH ROW EXECUTE FUNCTION sync_material_from_packages();

-- ── Trigger: auto-flip quote_materials to 'shipped' when tracking set ─────
CREATE OR REPLACE FUNCTION auto_flip_shipped_on_tracking()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tracking_number IS NOT NULL
     AND COALESCE(NEW.tracking_number, '') <> ''
     AND COALESCE(OLD.tracking_number, '') = ''
     AND NEW.status = 'ordered' THEN
    NEW.status := 'shipped';
    NEW.shipped_at := COALESCE(NEW.shipped_at, now());
    NEW.auto_updated := true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS quote_materials_auto_ship ON quote_materials;
CREATE TRIGGER quote_materials_auto_ship
BEFORE UPDATE ON quote_materials
FOR EACH ROW EXECUTE FUNCTION auto_flip_shipped_on_tracking();
