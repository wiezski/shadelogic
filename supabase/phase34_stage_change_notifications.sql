-- Phase 34 — DB trigger that fires bell notifications when a customer's
-- lead_status changes. Covers every pipeline stage movement (New → Contacted
-- → Scheduled → Measured → Quoted → Sold → Installed → Complete, etc.)
-- without requiring the app code to remember to insert a notification on
-- every code path that touches lead_status.
--
-- Skips New + Contacted (too chatty for daily use).
-- Inserts one company-wide notification per transition (user_id NULL).

CREATE OR REPLACE FUNCTION notify_on_stage_change()
RETURNS TRIGGER AS $$
DECLARE
  v_name text;
  v_icon text;
  v_title text;
  v_message text;
BEGIN
  IF COALESCE(NEW.lead_status, '') = COALESCE(OLD.lead_status, '') THEN
    RETURN NEW;
  END IF;

  v_name := TRIM(BOTH ' ' FROM CONCAT_WS(' ', NEW.first_name, NEW.last_name));
  IF v_name = '' THEN v_name := 'Unknown customer'; END IF;

  v_icon := CASE NEW.lead_status
    WHEN 'Consult Scheduled' THEN '📅'
    WHEN 'Measure Scheduled' THEN '📅'
    WHEN 'Measured'          THEN '📐'
    WHEN 'Quoted'            THEN '📄'
    WHEN 'Sold'              THEN '🎉'
    WHEN 'Contact for Install' THEN '📞'
    WHEN 'Installed'         THEN '✅'
    WHEN 'Complete'          THEN '🏁'
    WHEN 'Lost'              THEN '❌'
    WHEN 'On Hold'           THEN '⏸️'
    WHEN 'Waiting'           THEN '⏳'
    ELSE NULL
  END;
  IF v_icon IS NULL THEN RETURN NEW; END IF;

  v_title := v_icon || ' ' || v_name || ' → ' || NEW.lead_status;

  v_message := CASE NEW.lead_status
    WHEN 'Sold'              THEN 'Deal closed! Time to contact for install.'
    WHEN 'Quoted'            THEN 'Quote sent — follow up in a few days if no response.'
    WHEN 'Measured'          THEN 'Measurements done — send the quote.'
    WHEN 'Consult Scheduled' THEN 'Consult on the books.'
    WHEN 'Measure Scheduled' THEN 'Measure appointment booked.'
    WHEN 'Contact for Install' THEN 'Ready to schedule the install.'
    WHEN 'Installed'         THEN 'Install complete — send review request.'
    WHEN 'Complete'          THEN 'Job wrapped up.'
    WHEN 'Lost'              THEN 'Lead marked lost.'
    WHEN 'On Hold'           THEN 'Lead paused.'
    WHEN 'Waiting'           THEN 'Waiting on customer response.'
    ELSE ''
  END;

  INSERT INTO notifications (company_id, type, title, message, icon, link, customer_id)
  VALUES (
    NEW.company_id,
    'stage_change',
    v_title,
    v_message,
    v_icon,
    '/customers/' || NEW.id,
    NEW.id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS customers_notify_on_stage_change ON customers;
CREATE TRIGGER customers_notify_on_stage_change
AFTER UPDATE OF lead_status ON customers
FOR EACH ROW EXECUTE FUNCTION notify_on_stage_change();
